#!/usr/bin/env python3
"""Entraîne un candidat XGBoost natif, jamais un modèle automatiquement homologué."""
import argparse
import hashlib
import json
from pathlib import Path
from validation import FEATURES, validate_rows, purged_splits


def train(bundle_path, output):
    bundle_bytes = Path(bundle_path).read_bytes()
    bundle = json.loads(bundle_bytes)
    if bundle.get("schemaVersion") != 1 or bundle.get("featureOrder") != FEATURES:
        raise ValueError("Version de schéma ou ordre des features incompatible.")
    rows = validate_rows(bundle.get("trainingRows", []))
    train_rows, cal_rows, val_rows, test_rows = purged_splits(rows)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    dataset_hash = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    lock = output / "consumed_holdouts.json"
    consumed = json.loads(lock.read_text()) if lock.exists() else []
    # Freeze by holdout content, not entire dataset, so train mutations cannot reuse it.
    holdout_hash = hashlib.sha256(json.dumps(test_rows, sort_keys=True).encode()).hexdigest()
    if holdout_hash in consumed:
        raise ValueError("Ce holdout a déjà été consulté. Collecter une nouvelle période forward.")
    # Import only after provenance/data validation; small datasets fail without needing ML installed.
    import numpy as np
    import xgboost as xgb
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

    def arrays(part):
        return np.asarray([[r[k] for k in FEATURES] for r in part], dtype=float), np.asarray([r["target"] for r in part])

    x_train, y_train = arrays(train_rows)
    x_cal, y_cal = arrays(cal_rows)
    x_val, y_val = arrays(val_rows)
    x_test, y_test = arrays(test_rows)
    model = xgb.XGBClassifier(n_estimators=150, max_depth=3, learning_rate=.03,
                             subsample=.8, colsample_bytree=.8, tree_method="hist",
                             n_jobs=-1, random_state=42, eval_metric="logloss")
    model.fit(x_train, y_train)

    def logits(x):
        p = np.clip(model.predict_proba(x)[:, 1], 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p)).reshape(-1, 1)

    calibrator = LogisticRegression(C=1.0)
    calibrator.fit(logits(x_cal), y_cal)
    threshold = .5  # predeclared, not optimized on test

    def metrics(x, y, part):
        p = calibrator.predict_proba(logits(x))[:, 1]
        net = np.array([r["net_r"] for r in part])
        selected = p >= threshold
        return {"count": len(part), "selected": int(selected.sum()),
                "brier": float(brier_score_loss(y, p)), "log_loss": float(log_loss(y, p)),
                "auc": float(roc_auc_score(y, p)),
                "baseline_mean_net_r": float(net.mean()),
                "selected_mean_net_r": float(net[selected].mean()) if selected.any() else None,
                "note": "R shadow OHLC modélisé, pas PnL réellement exécuté ; pas de preuve causale."}

    validation_metrics = metrics(x_val, y_val, val_rows)
    # Mark holdout consumed BEFORE measuring it. No auto-search/repeated test evaluation.
    lock.write_text(json.dumps(consumed + [holdout_hash], indent=2))
    test_metrics = metrics(x_test, y_test, test_rows)
    model_path = output / "candidate_xgboost.json"
    model.save_model(model_path)
    manifest = {
        "schemaVersion": 1, "featureOrder": FEATURES, "datasetHash": dataset_hash,
        "holdoutHash": holdout_hash, "modelHash": hashlib.sha256(model_path.read_bytes()).hexdigest(),
        "calibration": {"method": "platt_logit", "slope": float(calibrator.coef_[0, 0]),
                        "intercept": float(calibrator.intercept_[0])},
        "threshold": threshold, "split": "chronological_55_15_15_15_purged_24h_embargo",
        "trialCount": 1, "status": "CANDIDATE_EXTERNAL_NOT_PROMOTED",
        "validation": validation_metrics, "test": test_metrics,
        "promotion": "INTERDITE automatiquement. Nouveau forward shadow et revue humaine requis.",
        "limitations": ["Dépendance inter-actifs et changements de régime.",
                       "Features requises pour tous les candidats, pas seulement les trades acceptés.",
                       "Labels shadow ne garantissent pas les fills ni la rentabilité."],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", help="Export JSON du laboratoire")
    parser.add_argument("--output", default="candidate")
    args = parser.parse_args()
    train(args.bundle, args.output)