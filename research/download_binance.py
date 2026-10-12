#!/usr/bin/env python3
"""Download closed public Spot candles and optional Futures context; no credentials."""
import argparse
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

INTERVAL = 900_000


def get(base, path, params):
    url = base + path + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "FrankensteinResearch/1"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"HTTP {error.code} sur {base}. Ne pas contourner une restriction régionale.") from error


def history(symbol, start, end):
    result, cursor = [], start
    while cursor < end:
        rows = get("https://data-api.binance.vision", "/api/v3/klines",
                   {"symbol": symbol, "interval": "15m", "startTime": cursor,
                    "endTime": end - 1, "limit": 1000})
        if not rows:
            break
        for r in rows:
            if int(r[0]) + INTERVAL > end:
                continue
            result.append({"time": int(r[0]), "open": float(r[1]), "high": float(r[2]),
                           "low": float(r[3]), "close": float(r[4]), "volume": float(r[5]),
                           "quoteVolume": float(r[7]), "takerBuy": float(r[9])})
        cursor = int(rows[-1][0]) + INTERVAL
        time.sleep(.25)
    return result


def context(symbol, start, end):
    # Binance OI endpoint has limited retention. Missing historical context is NOT fabricated.
    oi = get("https://fapi.binance.com", "/futures/data/openInterestHist",
             {"symbol": symbol, "period": "1h", "limit": 500})
    funding = get("https://fapi.binance.com", "/fapi/v1/fundingRate",
                  {"symbol": symbol, "startTime": start, "endTime": end, "limit": 1000})
    observations = []
    for i in range(2, len(oi)):
        timestamp = int(oi[i]["timestamp"])
        if not start <= timestamp < end:
            continue
        known = [f for f in funding if int(f["fundingTime"]) <= timestamp]
        denominator = float(oi[i - 2]["sumOpenInterest"])
        if known and denominator > 0 and timestamp - int(oi[i - 2]["timestamp"]) == 7_200_000:
            observations.append({"time": timestamp, "deltaOi": float(oi[i]["sumOpenInterest"]) / denominator - 1,
                                 "fundingRate": float(known[-1]["fundingRate"])})
    return observations


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dataset de recherche public Binance, pas une validation de stratégie")
    parser.add_argument("--symbol", default="SOLUSDT")
    parser.add_argument("--bars", type=int, default=6000)
    parser.add_argument("--output", default="history.json")
    parser.add_argument("--with-derivatives", action="store_true")
    args = parser.parse_args()
    if not 3216 <= args.bars <= 20000 or not args.symbol.isalnum() or not args.symbol.endswith("USDT"):
        parser.error("3216 à 20000 bougies et symbole Spot USDT requis.")
    end = int(time.time() * 1000) // INTERVAL * INTERVAL
    start = end - args.bars * INTERVAL
    bars, btc = history(args.symbol, start, end), history("BTCUSDT", start, end)
    if len(bars) != args.bars or len(btc) != len(bars) or any(a["time"] != b["time"] for a, b in zip(bars, btc)):
        raise ValueError("Historique incomplet / benchmark mal aligné, import refusé.")
    observations, notes = [], ["Univers mono-actif actuel, biais de survivance possible. Aucun carnet historique."]
    if args.with_derivatives:
        try:
            observations = context(args.symbol, start, end)
        except RuntimeError as error:
            notes.append(str(error))
            print(str(error))
    bundle = {"source": "binance_public_unverified", "symbol": args.symbol, "candles": bars,
              "btcCandles": btc, "derivativeObservations": observations,
              "provenance": {"spot": "data-api.binance.vision", "interval": "15m", "downloadedAt": int(time.time() * 1000)},
              "notes": notes}
    Path(args.output).write_text(json.dumps(bundle))
    print(f"{len(bars)} bougies fermées / {len(observations)} observations dérivés écrites dans {args.output}.")