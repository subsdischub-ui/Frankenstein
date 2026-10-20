import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

import collect_spot_pilot as c


def candle(t, step=60000):
    return [t, "10.00", "12.00", "9.00", "11.00", "2.000",
            t + step - 1, "20.000", 3, "1.000", "10.000", "0"]


class CollectorTests(unittest.TestCase):
    def test_provider_fields_preserved(self):
        row = c.validate_row(candle(0), 0, 60000)
        self.assertEqual(row[5], "2.000")
        self.assertEqual(row[7], "20.000")
        self.assertEqual(row[9:11], ["1.000", "10.000"])

    def test_bad_rows_rejected(self):
        for index, value in [(0, 60000), (6, 1), (2, "1"), (5, "-1"),
                             (7, "NaN"), (9, "3"), (10, "30"), (8, -1)]:
            row = candle(0)
            row[index] = value
            with self.subTest(index=index), self.assertRaises((ValueError, ArithmeticError)):
                c.validate_row(row, 0, 60000)

    def test_pilot_and_warmup_separate(self):
        with patch.object(c.time, "time", return_value=1800000000):
            p = c.plan(c.utc("2026-05-24T10:00:00Z"), c.utc("2026-06-24T09:00:00Z"), 35)
        self.assertEqual(len(p["series"]), 8)
        self.assertEqual(c.stamp(p["series"][0]["start"]), "2026-04-19T10:00:00Z")
        self.assertEqual(c.stamp(p["series"][-1]["start"]), "2026-05-24T08:00:00Z")
        self.assertEqual(p["series"][-1]["interval"], "1m")
        self.assertEqual(c.describe(p)["expectedRows"], 89024)

    def test_dates_and_open_candles_rejected(self):
        with self.assertRaises(ValueError):
            c.utc("2026-05-24")
        with self.assertRaises(ValueError):
            c.plan(0, 900001, 35)
        with patch.object(c.time, "time", return_value=900):
            with self.assertRaises(ValueError):
                c.plan(0, 1800000, 35)

    def test_pagination_and_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            series = {"symbol": "BTCUSDT", "interval": "1m", "start": 0, "end": 180000}
            with patch.object(c, "request_rows", side_effect=[
                [candle(0), candle(60000)], [candle(120000)]
            ]) as request:
                result, reused = c.collect_chunk(root, series, 0, 180000, 1)
                self.assertEqual(request.call_count, 2)
                self.assertEqual(result["rows"], 3)
                self.assertFalse(reused)
            with patch.object(c, "request_rows") as request:
                result, reused = c.collect_chunk(root, series, 0, 180000, 1)
                self.assertTrue(reused)
                request.assert_not_called()
            path, receipt = c.paths_for(root, series, 0)
            path.write_bytes(path.read_bytes().replace(b"10.00", b"99.00", 1))
            with self.assertRaises(ValueError):
                c.verify_chunk(path, receipt, series, 0, 180000)

    def test_missing_duplicate_or_extra_page_rejected(self):
        for rows in [[], [candle(60000)], [candle(0), candle(0)],
                     [candle(0), candle(60000)]]:
            with self.subTest(rows=rows), tempfile.TemporaryDirectory() as tmp:
                series = {"symbol": "BTCUSDT", "interval": "1m", "start": 0, "end": 60000}
                with patch.object(c, "request_rows", return_value=rows):
                    with self.assertRaises(ValueError):
                        c.collect_chunk(Path(tmp), series, 0, 60000, 1)

    def test_interruption_then_resume_and_offline_verification(self):
        start = c.DAY - 60000
        series = {"symbol": "BTCUSDT", "interval": "1m", "start": start, "end": c.DAY + 60000}
        p = {"series": [series]}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(c, "request_rows", side_effect=[[candle(start)], RuntimeError("réseau")]):
                with self.assertRaises(RuntimeError):
                    c.run(root, p, 1)
            self.assertEqual(json.loads((root / "manifest.json").read_text())["status"], "INCOMPLETE")
            self.assertFalse((root / "spot-pilot.zip").exists())
            with patch.object(c, "request_rows", return_value=[candle(c.DAY)]) as request:
                c.run(root, p, 1)
                self.assertEqual(request.call_count, 1)
            with patch.object(c, "request_rows") as request:
                c.run(root, p, 1, verify_only=True)
                request.assert_not_called()
            manifest = json.loads((root / "manifest.json").read_text())
            self.assertEqual(manifest["status"], "COMPLETE")
            self.assertEqual(sum(r["rows"] for r in manifest["verifiedFiles"]), 2)
            with zipfile.ZipFile(root / "spot-pilot.zip") as z:
                self.assertIsNone(z.testzip())
                self.assertNotIn(".collector.lock", z.namelist())

    def test_refuses_unknown_output_or_changed_plan(self):
        p = {"series": []}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "personal.csv").write_text("do not overwrite")
            with self.assertRaises(ValueError):
                c.run(root, p, 1)
            self.assertEqual((root / "personal.csv").read_text(), "do not overwrite")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            c.write_json(root / "plan.json", {"series": [], "different": True})
            with self.assertRaises(ValueError):
                c.run(root, p, 1)

    def test_restricted_or_rate_limited_stops_without_retry(self):
        for code in (403, 418, 429, 451):
            error = urllib.error.HTTPError(c.BASE, code, "blocked", {"Retry-After": "60"}, None)
            with self.subTest(code=code), patch.object(c.time, "sleep"), \
                 patch.object(c.urllib.request, "urlopen", side_effect=error) as request:
                with self.assertRaises(RuntimeError):
                    c.request_rows("BTCUSDT", "1m", 0, 60000, 1)
                self.assertEqual(request.call_count, 1)

    def test_transient_error_retried(self):
        payload = io.BytesIO(json.dumps([candle(0)]).encode())
        error = urllib.error.HTTPError(c.BASE, 503, "unavailable", {}, None)
        with patch.object(c.time, "sleep"), patch.object(
            c.urllib.request, "urlopen", side_effect=[error, payload]
        ) as request:
            self.assertEqual(len(c.request_rows("BTCUSDT", "1m", 0, 60000, 1)), 1)
            self.assertEqual(request.call_count, 2)

    def test_dry_run_does_not_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "not-created"
            with patch.object(c.sys, "argv", ["collect", "--dry-run", "--output", str(target)]), \
                 patch.object(c.time, "time", return_value=1800000000), patch.object(c, "run") as run:
                self.assertEqual(c.main(), 0)
                run.assert_not_called()
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
