import unittest
from validation import FEATURES, validate_rows, purged_splits
from openclaw_adapter import report


class ValidationTests(unittest.TestCase):
    def rows(self):
        return [dict(id=str(i), source="binance_shadow", time=i * 86_400_000,
                     label_end=i * 86_400_000 + 900_000, net_r=3 if i % 2 else -1,
                     target=i % 2, **{k: 1.0 for k in FEATURES}) for i in range(600)]

    def test_reject_synthetic(self):
        rows = self.rows()
        rows[0]["source"] = "synthetic"
        with self.assertRaises(ValueError):
            validate_rows(rows)

    def test_purge(self):
        parts = purged_splits(validate_rows(self.rows()))
        for previous, following in zip(parts, parts[1:]):
            self.assertLess(max(r["label_end"] for r in previous), min(r["time"] for r in following) - 86_400_000)

    def test_future_label(self):
        rows = self.rows()
        rows[10]["label_end"] = rows[10]["time"] - 1
        with self.assertRaises(ValueError):
            validate_rows(rows)

    def test_openclaw_readonly(self):
        r = report({"schemaVersion": 1, "mode": "paper", "metaReport": "{}"})
        self.assertEqual(r["authority"], "READ_ONLY_REPORT")
        self.assertIn("orders", r["forbidden"])


if __name__ == "__main__":
    unittest.main()