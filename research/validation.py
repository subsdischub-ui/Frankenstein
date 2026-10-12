"""Validation temporelle sans dépendance ML ; utilisable et testable séparément."""
import math

FEATURES = ["volumeRatio", "relativeStrength", "compression", "rsi", "vwapGap",
            "deltaOi", "fundingRate", "cvd", "btcShock"]


def validate_rows(rows):
    if len(rows) < 500:
        raise ValueError("500 labels de marché complets minimum. Aucun entraînement synthétique.")
    ordered = sorted(rows, key=lambda r: r["time"])
    ids = set()
    for row in ordered:
        if row.get("source") != "binance_shadow":
            raise ValueError("Provenance réelle Binance shadow exigée ; démo interdite.")
        if row["id"] in ids:
            raise ValueError("Identifiant de signal dupliqué.")
        ids.add(row["id"])
        for key in FEATURES + ["time", "label_end", "net_r"]:
            if not isinstance(row.get(key), (int, float)) or not math.isfinite(row[key]):
                raise ValueError(f"Valeur absente/non finie : {key}")
        if row["target"] not in (0, 1) or row["label_end"] <= row["time"]:
            raise ValueError("Label invalide ou clôture antérieure au signal.")
    return ordered


def purged_splits(rows, embargo_ms=86_400_000):
    """Split par timestamp unique, purge labels touchant prochaine fenêtre + embargo."""
    timestamps = sorted(set(row["time"] for row in rows))
    if len(timestamps) < 100:
        raise ValueError("Nombre de timestamps distincts insuffisant.")
    bounds = [timestamps[int(len(timestamps) * x)] for x in (.55, .70, .85)]
    train = [r for r in rows if r["time"] < bounds[0] and r["label_end"] < bounds[0] - embargo_ms]
    calibration = [r for r in rows if bounds[0] <= r["time"] < bounds[1]
                   and r["label_end"] < bounds[1] - embargo_ms]
    validation = [r for r in rows if bounds[1] <= r["time"] < bounds[2]
                  and r["label_end"] < bounds[2] - embargo_ms]
    test = [r for r in rows if r["time"] >= bounds[2]]
    for name, part in zip(("train", "calibration", "validation", "test"),
                          (train, calibration, validation, test)):
        if len(part) < 40 or len(set(r["target"] for r in part)) < 2:
            raise ValueError(f"Fenêtre {name} insuffisante après purge/embargo, ou une seule classe.")
    return train, calibration, validation, test