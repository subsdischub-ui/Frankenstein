#!/usr/bin/env python3
"""Collecteur public Spot autonome, Python 3.10+, sans dépendance ni clé."""
import argparse
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

BASE = "https://data-api.binance.vision"
ENDPOINT = "/api/v3/klines"
DAY = 86_400_000
STEPS = {"15m": 900_000, "1m": 60_000}
SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "AVAXUSDT", "SUIUSDT", "ARBUSDT", "WIFUSDT")
FIELDS = ("ts", "open", "high", "low", "close", "volume", "close_time_ms",
          "quote_volume", "num_trades", "taker_buy_base", "taker_buy_quote")


def utc(value):
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.utcoffset() is None:
            raise ValueError("Fuseau obligatoire : utiliser Z ou +00:00.")
        return int(dt.timestamp() * 1000)
    except (ValueError, OverflowError) as e:
        raise ValueError(f"Date UTC invalide : {value}") from e


def stamp(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat().replace("+00:00", "Z")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, data):
    temp = path.with_name(path.name + ".tmp")
    with temp.open("wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    temp.replace(path)


def write_json(path, data):
    atomic(path, (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode())


def daily_chunks(start, end):
    while start < end:
        stop = min((start // DAY + 1) * DAY, end)
        yield start, stop
        start = stop


def plan(start, end, warmup_days):
    if start % STEPS["15m"] or end % STEPS["15m"]:
        raise ValueError("Bornes alignées sur 15 minutes requises.")
    if not 0 < end - start <= 90 * DAY or not 35 <= warmup_days <= 60:
        raise ValueError("Pilote : 1 à 90 jours et 35 à 60 jours de warmup.")
    if end > int(time.time() * 1000) // STEPS["15m"] * STEPS["15m"]:
        raise ValueError("La fin inclut une bougie non encore clôturée.")
    series = [{"symbol": s, "interval": "15m", "start": start - warmup_days * DAY,
               "end": end} for s in SYMBOLS]
    series.append({"symbol": "BTCUSDT", "interval": "1m",
                   "start": start - 2 * 3_600_000, "end": end})
    return {"schemaVersion": 1, "market": "BINANCE_SPOT", "endpoint": BASE + ENDPOINT,
            "pilotStart": stamp(start), "pilotEndExclusive": stamp(end),
            "warmupDays": warmup_days, "series": series}


def describe(p):
    rows, requests, chunks = 0, 0, 0
    for s in p["series"]:
        step = STEPS[s["interval"]]
        rows += (s["end"] - s["start"]) // step
        for start, end in daily_chunks(s["start"], s["end"]):
            chunks += 1
            requests += math.ceil((end - start) / step / 1000)
    return {"expectedRows": rows, "dailyFiles": chunks, "minimumRequests": requests}


def request_rows(symbol, interval, start, end, delay, attempts=4):
    params = {"symbol": symbol, "interval": interval, "startTime": start,
              "endTime": end - 1, "limit": 1000, "timeZone": "0"}
    url = BASE + ENDPOINT + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "FrankensteinSpotPilot/1"})
    for attempt in range(attempts):
        time.sleep(delay)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                rows = json.load(response)
            if not isinstance(rows, list):
                raise ValueError("Réponse Binance non tabulaire.")
            return rows
        except urllib.error.HTTPError as e:
            if e.code in (403, 418, 429, 451):
                raise RuntimeError(
                    f"HTTP {e.code} : arrêt sans autre hôte ni contournement. "
                    f"Retry-After={e.headers.get('Retry-After', 'non indiqué')}. "
                    "Attendre ou vérifier l'accès autorisé avant une reprise."
                ) from e
            if e.code < 500 or attempt == attempts - 1:
                raise RuntimeError(f"HTTP {e.code} : collecte interrompue.") from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt == attempts - 1:
                raise RuntimeError("Réseau indisponible après quatre tentatives.") from e
        time.sleep(2 ** (attempt + 1))
    raise RuntimeError("Collecte interrompue.")


def validate_row(raw, expected, step):
    if not isinstance(raw, (list, tuple)) or len(raw) < 11:
        raise ValueError("Bougie Binance incomplète.")
    if int(raw[0]) != expected or int(raw[6]) != expected + step - 1:
        raise ValueError(f"Trou, doublon ou clôture invalide autour de {stamp(expected)}.")
    try:
        o, h, l, c, v, q, tb, tq = [Decimal(str(raw[i])) for i in (1, 2, 3, 4, 5, 7, 9, 10)]
    except InvalidOperation as e:
        raise ValueError("Prix ou volume non numérique.") from e
    if not all(x.is_finite() for x in (o, h, l, c, v, q, tb, tq)):
        raise ValueError("Prix ou volume non fini.")
    if min(o, h, l, c) <= 0 or h < max(o, l, c) or l > min(o, h, c):
        raise ValueError("OHLC incohérent.")
    if min(v, q, tb, tq) < 0 or tb > v or tq > q:
        raise ValueError("Volumes négatifs ou taker supérieur au total.")
    trades = int(raw[8])
    if trades < 0 or str(trades) != str(raw[8]):
        raise ValueError("Nombre de transactions invalide.")
    # Preserve provider decimal strings; do not estimate quote/taker using close*volume.
    return [int(raw[0]), *[str(raw[i]) for i in (1, 2, 3, 4, 5)], int(raw[6]),
            str(raw[7]), trades, str(raw[9]), str(raw[10])]


def csv_bytes(rows):
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(FIELDS)
    writer.writerows(rows)
    return out.getvalue().encode()


def paths_for(root, series, start):
    folder = root / series["symbol"] / series["interval"]
    name = stamp(start).replace(":", "-") + ".csv"
    return folder / name, folder / (name + ".receipt.json")


def verify_chunk(path, receipt_path, series, start, end):
    receipt = json.loads(receipt_path.read_text())
    data = path.read_bytes()
    expected_receipt = {"symbol": series["symbol"], "interval": series["interval"],
                        "start": start, "endExclusive": end, "sha256": sha(data)}
    if any(receipt.get(k) != v for k, v in expected_receipt.items()):
        raise ValueError(f"Empreinte ou paramètres différents : {path}")
    reader = csv.reader(io.StringIO(data.decode()))
    if next(reader, None) != list(FIELDS):
        raise ValueError(f"Schéma CSV invalide : {path}")
    step = STEPS[series["interval"]]
    cursor, zero = start, 0
    for row in reader:
        if len(row) != len(FIELDS) or cursor >= end:
            raise ValueError(f"Nombre de colonnes/lignes invalide : {path}")
        validate_row(row, cursor, step)
        zero += Decimal(row[5]) == 0
        cursor += step
    if cursor != end or receipt.get("rows") != (end - start) // step:
        raise ValueError(f"Couverture incomplète : {path}")
    return {**expected_receipt, "rows": receipt["rows"], "zeroVolumeBars": zero,
            "file": str(path), "fetchedAt": receipt.get("fetchedAt")}


def collect_chunk(root, series, start, end, delay):
    path, receipt_path = paths_for(root, series, start)
    if path.exists() and receipt_path.exists():
        return verify_chunk(path, receipt_path, series, start, end), True
    if path.exists() or receipt_path.exists():
        raise ValueError(f"Fichier sans reçu ou reçu sans fichier : {path}. "
                         "Mettre cette paire à l'écart manuellement puis relancer.")
    step = STEPS[series["interval"]]
    cursor, result = start, []
    while cursor < end:
        rows = request_rows(series["symbol"], series["interval"], cursor, end, delay)
        if not rows:
            raise ValueError(f"Aucune bougie pour {series['symbol']} à {stamp(cursor)}.")
        for raw in rows:
            if cursor >= end:
                raise ValueError("Binance a dépassé la fenêtre demandée.")
            result.append(validate_row(raw, cursor, step))
            cursor += step
    data = csv_bytes(result)
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic(path, data)
    write_json(receipt_path, {"symbol": series["symbol"], "interval": series["interval"],
                             "start": start, "endExclusive": end, "sha256": sha(data),
                             "rows": len(result), "endpoint": BASE + ENDPOINT,
                             "fetchedAt": stamp(int(time.time() * 1000))})
    return verify_chunk(path, receipt_path, series, start, end), False


def run(root, p, delay, verify_only=False):
    # Unix flock is released on interruption; it never controls Docker or the trading engine.
    import fcntl
    root.mkdir(parents=True, exist_ok=True)
    with (root / ".collector.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as e:
            raise ValueError("Un collecteur utilise déjà ce dossier.") from e
        plan_file = root / "plan.json"
        if plan_file.exists():
            if json.loads(plan_file.read_text()) != p:
                raise ValueError("Plan différent : choisir un nouveau dossier de sortie.")
        else:
            if verify_only:
                raise ValueError("Aucun plan à vérifier.")
            if any(f.name != ".collector.lock" for f in root.iterdir()):
                raise ValueError("Dossier non vide non reconnu : choisir un dossier dédié.")
            write_json(plan_file, p)
        verified = []
        try:
            for s in p["series"]:
                for start, end in daily_chunks(s["start"], s["end"]):
                    if verify_only:
                        row = verify_chunk(*paths_for(root, s, start), s, start, end)
                        reused = True
                    else:
                        row, reused = collect_chunk(root, s, start, end, delay)
                    row["file"] = str(Path(row["file"]).relative_to(root))
                    verified.append(row)
                    print(f"{'Vérifié' if reused else 'Collecté'} {row['file']} : {row['rows']} bougies", flush=True)
        except (Exception, KeyboardInterrupt) as e:
            write_json(root / "manifest.json", {"status": "INCOMPLETE", "plan": p,
                       "verifiedFiles": verified, "error": str(e) or "Interruption manuelle"})
            raise
        manifest = {"status": "COMPLETE", "schemaVersion": 1, "plan": p,
                    "verifiedAt": stamp(int(time.time() * 1000)), "totals": describe(p),
                    "verifiedFiles": verified,
                    "limitations": [
                        "Données publiques historiques ; pas une preuve de rentabilité.",
                        "close_time_ms n'est pas l'heure historique de réception/publication.",
                        "Aucun OI/funding collecté ni réparé ; aucun carnet historique.",
                        "Univers fixé aujourd'hui ; biais de sélection/survivance possible.",
                    ]}
        write_json(root / "manifest.json", manifest)
        archive = root / "spot-pilot.zip"
        temp = root / "spot-pilot.zip.tmp"
        with zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED) as z:
            for name in ["plan.json", "manifest.json"]:
                z.write(root / name, name)
            for row in verified:
                z.write(root / row["file"], row["file"])
                receipt = root / (row["file"] + ".receipt.json")
                z.write(receipt, row["file"] + ".receipt.json")
        with zipfile.ZipFile(temp) as z:
            if z.testzip() is not None:
                raise ValueError("ZIP corrompu.")
        temp.replace(archive)
        archive_hash = sha(archive.read_bytes())
        atomic(root / "spot-pilot.zip.sha256", f"{archive_hash}  spot-pilot.zip\n".encode())
        print(f"TERMINÉ : {archive} ({archive.stat().st_size} octets), SHA-256 {archive_hash}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2026-05-24T10:00:00Z")
    parser.add_argument("--end", default="2026-06-24T09:00:00Z", help="borne exclusive UTC")
    parser.add_argument("--warmup-days", type=int, default=35)
    parser.add_argument("--output", type=Path, default=Path("generated-artifacts/spot-pilot"))
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--dry-run", action="store_true", help="afficher le plan sans écrire ni télécharger")
    parser.add_argument("--verify-only", action="store_true", help="revérifier sans réseau et refaire le ZIP")
    args = parser.parse_args()
    try:
        if not math.isfinite(args.delay) or args.delay < 0.25:
            raise ValueError("Délai minimum : 0,25 seconde entre requêtes.")
        p = plan(utc(args.start), utc(args.end), args.warmup_days)
        print(json.dumps({"plan": p, "budget": describe(p)}, indent=2))
        if not args.dry_run:
            run(args.output.resolve(), p, args.delay, args.verify_only)
    except KeyboardInterrupt:
        print("Collecte interrompue. Relancer la même commande pour reprendre.", file=sys.stderr)
        return 130
    except Exception as e:
        print(f"ÉCHEC : {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
