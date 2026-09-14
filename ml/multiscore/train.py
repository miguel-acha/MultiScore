"""Train and compare the 6 xG model variants:

    {logistic regression, XGBoost, LightGBM} x {geo-only, geo+defenders}

Design decisions (documented here so they can be cited directly in the
"Desarrollo e Implementación" section of the report):

- ALL variants (including geo-only) are trained and evaluated on the SAME
  subset of shots that have a usable freeze frame. This is what makes the
  "with vs without defenders" comparison fair: both models see literally
  the same shots, so any difference in log-loss/AUC is attributable to the
  extra defender-context features, not to a different (larger) sample for
  the geo model. Shots without a freeze frame are still counted and
  reported (see dataset_summary.json) but excluded from model
  training/comparison.
- Hyperparameter selection and early stopping both use the dedicated
  validation split (not k-fold CV). With gradient boosting + early
  stopping this is standard practice and keeps training time tractable
  on a laptop; the random search config (n_hyperparam_trials) is defined
  in configs/train.yaml.
- The final "production" model is the best "full" variant by validation
  log-loss. If its probabilities are poorly calibrated (ECE above the val
  set's raw ECE), isotonic calibration is fit on the validation split and
  compared before/after.
"""

from __future__ import annotations

import itertools
import json
import time
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
import yaml
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, roc_auc_score

from multiscore.modeling import (
    build_preprocessor,
    get_onehot_feature_names,
    monotonic_constraints_vector,
    prepare_frame,
)
from multiscore.synthetic import build_synthetic_empty_net

ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
CURVES_DIR = REPORTS_DIR / "training_curves"
CONFIG_PATH = ROOT / "configs" / "train.yaml"

for d in (MODELS_DIR, REPORTS_DIR, CURVES_DIR):
    d.mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def load_splits() -> dict[str, pd.DataFrame]:
    la_liga = pd.read_parquet(PROCESSED_DIR / "la_liga_features.parquet")
    wc = pd.read_parquet(PROCESSED_DIR / "world_cup_2022_features.parquet")

    # Fairness rule: only rows with a usable freeze frame are used for
    # model training/comparison across ALL variants (geo and full alike).
    la_liga_ff = la_liga[la_liga["has_freeze_frame"]].copy()
    wc_ff = wc[wc["has_freeze_frame"]].copy()

    return {
        "train": la_liga_ff[la_liga_ff["split"] == "train"].reset_index(drop=True),
        "val": la_liga_ff[la_liga_ff["split"] == "val"].reset_index(drop=True),
        "test": la_liga_ff[la_liga_ff["split"] == "test"].reset_index(drop=True),
        "external_test": wc_ff.reset_index(drop=True),
        "la_liga_all_rows": len(la_liga),
        "la_liga_with_freeze_frame_rows": len(la_liga_ff),
        "wc_all_rows": len(wc),
        "wc_with_freeze_frame_rows": len(wc_ff),
    }


def _fit_transform(preprocessor, feature_set_name, df):
    X = prepare_frame(df, feature_set_name)
    return preprocessor.fit_transform(X)


def _transform(preprocessor, feature_set_name, df):
    X = prepare_frame(df, feature_set_name)
    return preprocessor.transform(X)


def _lr_candidates(cfg: dict) -> list[dict]:
    return [{"C": c} for c in cfg["logistic_regression"]["C"]]


def _grid_sample(cfg: dict, rng: np.random.Generator, n_trials: int) -> list[dict]:
    keys = [k for k in cfg if isinstance(cfg[k], list)]
    all_combos = list(itertools.product(*[cfg[k] for k in keys]))
    rng.shuffle(all_combos)
    combos = all_combos[:n_trials]
    return [dict(zip(keys, combo)) for combo in combos]


def train_logistic_regression(X_train, y_train, X_val, y_val, cfg: dict, seed: int, sample_weight=None):
    candidates = _lr_candidates(cfg)
    best = None
    for params in candidates:
        model = LogisticRegression(
            C=params["C"],
            penalty=cfg["logistic_regression"]["penalty"],
            max_iter=cfg["logistic_regression"]["max_iter"],
            class_weight=cfg["logistic_regression"]["class_weight"],
            random_state=seed,
        )
        t0 = time.time()
        model.fit(X_train, y_train, sample_weight=sample_weight)
        fit_time = time.time() - t0
        val_pred = model.predict_proba(X_val)[:, 1]
        val_ll = log_loss(y_val, val_pred)
        if best is None or val_ll < best["val_logloss"]:
            best = {
                "model": model,
                "params": params,
                "val_logloss": val_ll,
                "fit_time_s": fit_time,
                "curves": None,
                "best_iteration": None,
            }
    return best


def train_xgboost(
    X_train, y_train, X_val, y_val, cfg: dict, seed: int, n_trials: int, rng, monotone_constraints=None,
    sample_weight=None,
):
    candidates = _grid_sample(cfg["xgboost"], rng, n_trials)
    best = None
    for params in candidates:
        model = xgb.XGBClassifier(
            n_estimators=cfg["xgboost"]["n_estimators"],
            learning_rate=params["learning_rate"],
            max_depth=params["max_depth"],
            subsample=params["subsample"],
            colsample_bytree=params["colsample_bytree"],
            min_child_weight=params["min_child_weight"],
            reg_lambda=params["reg_lambda"],
            objective=cfg["xgboost"]["objective"],
            eval_metric=cfg["xgboost"]["eval_metric"],
            early_stopping_rounds=cfg["xgboost"]["early_stopping_rounds"],
            monotone_constraints=monotone_constraints,
            random_state=seed,
            n_jobs=-1,
        )
        t0 = time.time()
        model.fit(
            X_train, y_train, sample_weight=sample_weight,
            eval_set=[(X_train, y_train), (X_val, y_val)], verbose=False,
        )
        fit_time = time.time() - t0
        val_pred = model.predict_proba(X_val)[:, 1]
        val_ll = log_loss(y_val, val_pred)
        if best is None or val_ll < best["val_logloss"]:
            evals_result = model.evals_result()
            best = {
                "model": model,
                "params": params,
                "val_logloss": val_ll,
                "fit_time_s": fit_time,
                "curves": {
                    "train_logloss": evals_result["validation_0"]["logloss"],
                    "val_logloss": evals_result["validation_1"]["logloss"],
                },
                "best_iteration": int(model.best_iteration) if model.best_iteration is not None else None,
            }
    return best


def train_lightgbm(
    X_train, y_train, X_val, y_val, cfg: dict, seed: int, n_trials: int, rng, monotone_constraints=None,
    sample_weight=None,
):
    candidates = _grid_sample(cfg["lightgbm"], rng, n_trials)
    best = None
    for params in candidates:
        model = lgb.LGBMClassifier(
            n_estimators=cfg["lightgbm"]["n_estimators"],
            learning_rate=params["learning_rate"],
            num_leaves=params["num_leaves"],
            max_depth=params["max_depth"],
            subsample=params["subsample"],
            colsample_bytree=params["colsample_bytree"],
            min_child_samples=params["min_child_samples"],
            reg_lambda=params["reg_lambda"],
            objective=cfg["lightgbm"]["objective"],
            monotone_constraints=list(monotone_constraints) if monotone_constraints else None,
            random_state=seed,
            n_jobs=-1,
            verbosity=-1,
        )
        t0 = time.time()
        model.fit(
            X_train,
            y_train,
            sample_weight=sample_weight,
            eval_set=[(X_train, y_train), (X_val, y_val)],
            eval_metric=cfg["lightgbm"]["metric"],
            callbacks=[lgb.early_stopping(cfg["lightgbm"]["early_stopping_rounds"], verbose=False)],
        )
        fit_time = time.time() - t0
        val_pred = model.predict_proba(X_val)[:, 1]
        val_ll = log_loss(y_val, val_pred)
        if best is None or val_ll < best["val_logloss"]:
            evals = model.evals_result_
            best = {
                "model": model,
                "params": params,
                "val_logloss": val_ll,
                "fit_time_s": fit_time,
                "curves": {
                    "train_logloss": evals["training"]["binary_logloss"],
                    "val_logloss": evals["valid_1"]["binary_logloss"],
                },
                "best_iteration": int(model.best_iteration_) if model.best_iteration_ else None,
            }
    return best


def measure_inference_time_ms(model, X_sample) -> float:
    """Average per-shot inference time in milliseconds, over a batch."""
    n = min(len(X_sample), 500)
    sample = X_sample[:n]
    t0 = time.time()
    model.predict_proba(sample)
    elapsed = time.time() - t0
    return (elapsed / n) * 1000


def run_all_variants(seed: int = 42) -> dict:
    cfg = load_config()
    rng = np.random.default_rng(seed)
    splits = load_splits()

    y_train = splits["train"]["is_goal"].values
    y_val = splits["val"]["is_goal"].values
    y_test = splits["test"]["is_goal"].values
    y_ext = splits["external_test"]["is_goal"].values

    results = {}
    ablation_results = {}
    synthetic_ablation = {}

    # Synthetic empty-net rows: computed once (feature extraction doesn't
    # depend on feature_set_name), added to the "full" TRAINING split only.
    # See ml/multiscore/synthetic.py for why - real "open goal" shots in the
    # data almost never mean a genuinely empty net from distance.
    synth_cfg = cfg.get("synthetic_empty_net", {})
    synthetic_df = build_synthetic_empty_net(synth_cfg, seed=seed) if synth_cfg.get("enabled") else None
    if synthetic_df is not None:
        print(f"\nSynthetic empty-net augmentation: {len(synthetic_df)} rows ({synth_cfg['n']} positions x 2 soft labels)")

    for feature_set_name in ("geo", "full"):
        preprocessor = build_preprocessor(feature_set_name)
        X_train = _fit_transform(preprocessor, feature_set_name, splits["train"])
        X_val = _transform(preprocessor, feature_set_name, splits["val"])
        X_test = _transform(preprocessor, feature_set_name, splits["test"])
        X_ext = _transform(preprocessor, feature_set_name, splits["external_test"])

        feature_names = get_onehot_feature_names(preprocessor, feature_set_name)
        constraints = monotonic_constraints_vector(feature_set_name, feature_names)

        # Augment TRAIN ONLY, and only for "full" (the geo model has no
        # defender features, so "empty net" isn't representable for it).
        # val/test/external_test are never touched - every reported metric
        # is measured on real shots only.
        X_train_aug, y_train_aug, weight_aug = X_train, y_train, np.ones(len(y_train))
        if feature_set_name == "full" and synthetic_df is not None:
            X_synth = preprocessor.transform(prepare_frame(synthetic_df, "full"))
            X_train_aug = np.vstack([X_train, X_synth])
            y_train_aug = np.concatenate([y_train, synthetic_df["is_goal"].values])
            weight_aug = np.concatenate([np.ones(len(y_train)), synthetic_df["sample_weight"].values])

        trainers = {
            "logistic_regression": lambda Xtr, Xv, yt=y_train_aug, w=weight_aug: train_logistic_regression(
                Xtr, yt, Xv, y_val, cfg, seed, sample_weight=w
            ),
            "xgboost": lambda Xtr, Xv, mc=constraints, yt=y_train_aug, w=weight_aug: train_xgboost(
                Xtr, yt, Xv, y_val, cfg, seed, cfg["n_hyperparam_trials"], rng, monotone_constraints=mc,
                sample_weight=w,
            ),
            "lightgbm": lambda Xtr, Xv, mc=constraints, yt=y_train_aug, w=weight_aug: train_lightgbm(
                Xtr, yt, Xv, y_val, cfg, seed, cfg["n_hyperparam_trials"], rng, monotone_constraints=mc,
                sample_weight=w,
            ),
        }

        for family, trainer in trainers.items():
            variant_name = f"{family}_{feature_set_name}"
            print(f"\n=== Training {variant_name} ===")
            result = trainer(X_train_aug, X_val)
            model = result["model"]

            inference_ms = measure_inference_time_ms(model, X_test)
            test_pred = model.predict_proba(X_test)[:, 1]
            ext_pred = model.predict_proba(X_ext)[:, 1]

            variant_dir = MODELS_DIR / variant_name
            variant_dir.mkdir(exist_ok=True)
            joblib.dump(model, variant_dir / "model.joblib")
            joblib.dump(preprocessor, variant_dir / "preprocessor.joblib")

            if result["curves"] is not None:
                curve_path = CURVES_DIR / f"{variant_name}.json"
                with open(curve_path, "w") as f:
                    json.dump(result["curves"], f)

            results[variant_name] = {
                "family": family,
                "feature_set": feature_set_name,
                "best_params": result["params"],
                "val_logloss": result["val_logloss"],
                "test_logloss": float(log_loss(y_test, test_pred)),
                "test_auc": float(roc_auc_score(y_test, test_pred)),
                "external_test_logloss": float(log_loss(y_ext, ext_pred)),
                "external_test_auc": float(roc_auc_score(y_ext, ext_pred)),
                "fit_time_s": result["fit_time_s"],
                "inference_time_ms_per_shot": inference_ms,
                "best_iteration": result["best_iteration"],
                "n_train": len(y_train_aug),
                "n_train_real": len(y_train),
                "n_train_synthetic": len(y_train_aug) - len(y_train),
                "n_val": len(y_val),
                "n_test": len(y_test),
                "n_external_test": len(y_ext),
            }
            print(
                f"{variant_name}: val_logloss={result['val_logloss']:.4f} "
                f"test_auc={results[variant_name]['test_auc']:.4f}"
            )

        # Ablation: for the "full" feature set, also train the tree models
        # WITHOUT monotonic constraints (same augmented training data as the
        # constrained variant above, so this isolates the constraint effect
        # alone), so the report can show whether imposing domain knowledge
        # costs or helps predictive performance (not just whether it fixes
        # the sanity-check failures).
        if feature_set_name == "full":
            for family in ("xgboost", "lightgbm"):
                print(f"\n=== Training {family}_full (ablation: no monotonic constraints) ===")
                trainer_fn = train_xgboost if family == "xgboost" else train_lightgbm
                result = trainer_fn(
                    X_train_aug, y_train_aug, X_val, y_val, cfg, seed, cfg["n_hyperparam_trials"], rng,
                    monotone_constraints=None, sample_weight=weight_aug,
                )
                model = result["model"]
                test_pred = model.predict_proba(X_test)[:, 1]
                ext_pred = model.predict_proba(X_ext)[:, 1]
                ablation_results[f"{family}_full_unconstrained"] = {
                    "val_logloss": result["val_logloss"],
                    "test_logloss": float(log_loss(y_test, test_pred)),
                    "test_auc": float(roc_auc_score(y_test, test_pred)),
                    "external_test_logloss": float(log_loss(y_ext, ext_pred)),
                    "external_test_auc": float(roc_auc_score(y_ext, ext_pred)),
                }
                print(
                    f"{family}_full_unconstrained: val_logloss={result['val_logloss']:.4f} "
                    f"(constrained was {results[f'{family}_full']['val_logloss']:.4f})"
                )

            # Ablation: the same constrained "full" models, but trained
            # WITHOUT the synthetic empty-net rows - isolates what the
            # augmentation itself buys/costs on real (test + external)
            # metrics, cited in the report's results-analysis section.
            if synthetic_df is not None:
                for family in ("logistic_regression", "xgboost", "lightgbm"):
                    print(f"\n=== Training {family}_full (ablation: no synthetic augmentation) ===")
                    if family == "logistic_regression":
                        result = train_logistic_regression(X_train, y_train, X_val, y_val, cfg, seed)
                    else:
                        trainer_fn = train_xgboost if family == "xgboost" else train_lightgbm
                        result = trainer_fn(
                            X_train, y_train, X_val, y_val, cfg, seed, cfg["n_hyperparam_trials"], rng,
                            monotone_constraints=constraints,
                        )
                    model = result["model"]
                    test_pred = model.predict_proba(X_test)[:, 1]
                    ext_pred = model.predict_proba(X_ext)[:, 1]
                    synthetic_ablation[f"{family}_full_no_synthetic"] = {
                        "val_logloss": result["val_logloss"],
                        "test_logloss": float(log_loss(y_test, test_pred)),
                        "test_auc": float(roc_auc_score(y_test, test_pred)),
                        "external_test_logloss": float(log_loss(y_ext, ext_pred)),
                        "external_test_auc": float(roc_auc_score(y_ext, ext_pred)),
                    }
                    print(
                        f"{family}_full_no_synthetic: test_logloss={synthetic_ablation[f'{family}_full_no_synthetic']['test_logloss']:.4f} "
                        f"(with synthetic was {results[f'{family}_full']['test_logloss']:.4f})"
                    )

    # Pick the production model: best "full" variant by validation log-loss.
    full_variants = {k: v for k, v in results.items() if v["feature_set"] == "full"}
    best_variant_name = min(full_variants, key=lambda k: full_variants[k]["val_logloss"])
    results["_selected_production_model"] = best_variant_name
    print(f"\nSelected production model: {best_variant_name}")

    # Calibration check + optional isotonic calibration on the selected model.
    # The isotonic calibrator is FIT on validation, but its improvement is
    # judged on the held-out TEST split - fitting and evaluating calibration
    # on the same rows would trivially drive ECE towards 0 (the isotonic
    # curve just memorizes that exact sample) and say nothing about whether
    # calibration actually generalizes.
    preprocessor = joblib.load(MODELS_DIR / best_variant_name / "preprocessor.joblib")
    model = joblib.load(MODELS_DIR / best_variant_name / "model.joblib")
    X_val_full = _transform(preprocessor, "full", splits["val"])
    X_test_full = _transform(preprocessor, "full", splits["test"])
    test_pred_raw = model.predict_proba(X_test_full)[:, 1]

    from multiscore.evaluate import expected_calibration_error

    ece_raw = expected_calibration_error(y_test, test_pred_raw)
    # sklearn >=1.6 replaced CalibratedClassifierCV(estimator, cv="prefit")
    # with wrapping the already-fitted estimator in FrozenEstimator.
    from sklearn.frozen import FrozenEstimator

    calibrated = CalibratedClassifierCV(FrozenEstimator(model), method="isotonic")
    calibrated.fit(X_val_full, y_val)
    test_pred_cal = calibrated.predict_proba(X_test_full)[:, 1]
    ece_cal = expected_calibration_error(y_test, test_pred_cal)

    results["_calibration"] = {
        "ece_raw": float(ece_raw),
        "ece_calibrated": float(ece_cal),
        "evaluated_on": "test split (calibrator fit on validation only, to avoid an optimistic in-sample ECE)",
    }
    use_calibrated = ece_cal < ece_raw
    results["_calibration"]["calibration_applied"] = bool(use_calibrated)
    if use_calibrated:
        joblib.dump(calibrated, MODELS_DIR / best_variant_name / "model_calibrated.joblib")
        print(f"Isotonic calibration improved ECE ({ece_raw:.4f} -> {ece_cal:.4f}); saved calibrated model.")
    else:
        print(f"Isotonic calibration did not improve ECE ({ece_raw:.4f} -> {ece_cal:.4f}); keeping raw model.")

    results["_monotonic_constraints_ablation"] = ablation_results
    results["_synthetic_augmentation_ablation"] = synthetic_ablation

    results["_dataset_info"] = {
        "la_liga_all_rows": splits["la_liga_all_rows"],
        "la_liga_with_freeze_frame_rows": splits["la_liga_with_freeze_frame_rows"],
        "wc_all_rows": splits["wc_all_rows"],
        "wc_with_freeze_frame_rows": splits["wc_with_freeze_frame_rows"],
        "note": "All variants (geo and full) trained/evaluated only on shots with a usable freeze frame, for a fair comparison.",
        "synthetic_empty_net": {
            **synth_cfg,
            "note": "Added to the 'full' model's TRAINING split only (soft-labeled via sample_weight, see multiscore/synthetic.py); val/test/external_test are always 100% real shots.",
        }
        if synthetic_df is not None
        else {"enabled": False},
    }

    with open(REPORTS_DIR / "train_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nSaved training results -> {REPORTS_DIR / 'train_results.json'}")

    return results


if __name__ == "__main__":
    run_all_variants()
