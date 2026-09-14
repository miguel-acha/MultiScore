"""Evaluation: metrics, calibration, bootstrap significance test for the
"do defenders help" comparison, generalization analysis (La Liga -> World
Cup 2022), and the figures/tables that go straight into the report.

Run after train.py. Reads models/*/model.joblib + reports/train_results.json
and writes:
    reports/metrics.json
    reports/tables/*.csv
    reports/figures/*.png
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)

from multiscore.modeling import get_onehot_feature_names, prepare_frame
from multiscore.train import load_splits

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
TABLES_DIR = REPORTS_DIR / "tables"
FIGURES_DIR = REPORTS_DIR / "figures"
for d in (TABLES_DIR, FIGURES_DIR):
    d.mkdir(parents=True, exist_ok=True)


def expected_calibration_error(y_true, y_prob, n_bins: int = 10) -> float:
    """Weighted average |confidence - accuracy| across equal-width bins.

    A model is well calibrated when, among shots it scores around 0.3, close
    to 30% actually end in a goal. ECE summarizes that gap in one number,
    which is what the reference guide asks for ("¿un xG de 0.3 termina en
    gol el 30% de las veces?").
    """
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(y_true)
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (y_prob >= lo) & (y_prob < hi) if i < n_bins - 1 else (y_prob >= lo) & (y_prob <= hi)
        if mask.sum() == 0:
            continue
        bin_acc = y_true[mask].mean()
        bin_conf = y_prob[mask].mean()
        ece += (mask.sum() / n) * abs(bin_acc - bin_conf)
    return float(ece)


def classification_report_at_threshold(y_true, y_prob, threshold: float) -> dict:
    """Precision/Recall/F1/confusion matrix + macro/micro/weighted averages
    at a fixed threshold. The guide explicitly warns that Accuracy alone is
    not acceptable with class imbalance, so Accuracy is reported but framed
    alongside these instead of as the headline number.
    """
    y_pred = (np.asarray(y_prob) >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    accuracy = (tp + tn) / (tp + tn + fp + fn)

    return {
        "threshold": threshold,
        "accuracy": float(accuracy),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "precision_goal_class": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall_goal_class": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_goal_class": float(f1_score(y_true, y_pred, zero_division=0)),
        "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "precision_micro": float(precision_score(y_true, y_pred, average="micro", zero_division=0)),
        "recall_micro": float(recall_score(y_true, y_pred, average="micro", zero_division=0)),
        "f1_micro": float(f1_score(y_true, y_pred, average="micro", zero_division=0)),
        "precision_weighted": float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
        "recall_weighted": float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
        "f1_weighted": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
    }


def best_f1_threshold(y_true, y_prob) -> float:
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
    f1s = 2 * precisions * recalls / (precisions + recalls + 1e-12)
    best_idx = np.nanargmax(f1s[:-1]) if len(thresholds) > 0 else 0
    return float(thresholds[best_idx]) if len(thresholds) > 0 else 0.5


def bootstrap_metric_difference(
    y_true: np.ndarray,
    group_ids: np.ndarray,
    pred_a: np.ndarray,
    pred_b: np.ndarray,
    metric_fn,
    n_resamples: int = 1000,
    seed: int = 42,
    lower_is_better: bool = True,
) -> dict:
    """Bootstrap the difference metric(pred_b) - metric(pred_a), resampling
    whole matches (group_ids) with replacement rather than individual shots,
    so shots within a match are not treated as independent samples.

    Returns the point estimate, a 95% CI, and whether the CI excludes 0
    (i.e., whether the difference is statistically significant at alpha=0.05).
    """
    rng = np.random.default_rng(seed)
    unique_groups = np.unique(group_ids)
    diffs = []

    point_a = metric_fn(y_true, pred_a)
    point_b = metric_fn(y_true, pred_b)
    point_diff = point_b - point_a

    group_to_idx = {g: np.where(group_ids == g)[0] for g in unique_groups}

    for _ in range(n_resamples):
        sampled_groups = rng.choice(unique_groups, size=len(unique_groups), replace=True)
        idx = np.concatenate([group_to_idx[g] for g in sampled_groups])
        try:
            a = metric_fn(y_true[idx], pred_a[idx])
            b = metric_fn(y_true[idx], pred_b[idx])
        except ValueError:
            continue  # e.g. a resample with a single class present
        diffs.append(b - a)

    diffs = np.array(diffs)
    ci_low, ci_high = np.percentile(diffs, [2.5, 97.5])
    significant = not (ci_low <= 0 <= ci_high)
    improvement = (point_diff < 0) if lower_is_better else (point_diff > 0)

    return {
        "metric_a_geo": float(point_a),
        "metric_b_full": float(point_b),
        "point_diff_full_minus_geo": float(point_diff),
        "ci_95_low": float(ci_low),
        "ci_95_high": float(ci_high),
        "n_resamples_used": len(diffs),
        "statistically_significant": bool(significant),
        "defenders_improve_metric": bool(significant and improvement),
    }


def plot_calibration_curve(results_by_variant: dict, out_path: Path):
    plt.figure(figsize=(6, 6))
    plt.plot([0, 1], [0, 1], "k--", label="Calibración perfecta")
    for name, data in results_by_variant.items():
        plt.plot(data["bin_confidence"], data["bin_accuracy"], marker="o", label=name)
    plt.xlabel("xG predicho (confianza promedio por bin)")
    plt.ylabel("Frecuencia real de gol")
    plt.title("Curva de calibración (test La Liga)")
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def plot_roc_curves(curves: dict, out_path: Path):
    plt.figure(figsize=(6, 6))
    plt.plot([0, 1], [0, 1], "k--", alpha=0.3)
    for name, (fpr, tpr, auc) in curves.items():
        plt.plot(fpr, tpr, label=f"{name} (AUC={auc:.3f})")
    plt.xlabel("Tasa de falsos positivos")
    plt.ylabel("Tasa de verdaderos positivos")
    plt.title("Curvas ROC (test La Liga)")
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def plot_training_curves(variant_name: str, curves: dict, out_path: Path):
    plt.figure(figsize=(6, 4))
    plt.plot(curves["train_logloss"], label="Entrenamiento")
    plt.plot(curves["val_logloss"], label="Validación")
    plt.xlabel("Ronda de boosting")
    plt.ylabel("Log-loss")
    plt.title(f"Curva de entrenamiento: {variant_name}")
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def compute_calibration_bins(y_true, y_prob, n_bins=10):
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    accs, confs = [], []
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (y_prob >= lo) & (y_prob < hi) if i < n_bins - 1 else (y_prob >= lo) & (y_prob <= hi)
        if mask.sum() == 0:
            continue
        accs.append(y_true[mask].mean())
        confs.append(y_prob[mask].mean())
    return confs, accs


def run_full_evaluation(seed: int = 42) -> dict:
    splits = load_splits()
    with open(REPORTS_DIR / "train_results.json") as f:
        train_results = json.load(f)

    metrics = {"variants": {}}
    roc_data = {}
    calibration_data = {}

    y_test = splits["test"]["is_goal"].values
    y_ext = splits["external_test"]["is_goal"].values
    match_ids_test = splits["test"]["match_id"].values

    preds_test = {}
    preds_ext = {}

    for variant_name, info in train_results.items():
        if variant_name.startswith("_"):
            continue
        feature_set = info["feature_set"]
        model = joblib.load(MODELS_DIR / variant_name / "model.joblib")
        preprocessor = joblib.load(MODELS_DIR / variant_name / "preprocessor.joblib")

        X_test = preprocessor.transform(prepare_frame(splits["test"], feature_set))
        X_ext = preprocessor.transform(prepare_frame(splits["external_test"], feature_set))

        p_test = model.predict_proba(X_test)[:, 1]
        p_ext = model.predict_proba(X_ext)[:, 1]
        preds_test[variant_name] = p_test
        preds_ext[variant_name] = p_ext

        best_thr = best_f1_threshold(y_test, p_test)

        variant_metrics = {
            "la_liga_test": {
                "log_loss": float(log_loss(y_test, p_test)),
                "brier_score": float(brier_score_loss(y_test, p_test)),
                "roc_auc": float(roc_auc_score(y_test, p_test)),
                "ece": expected_calibration_error(y_test, p_test),
                "at_threshold_0.5": classification_report_at_threshold(y_test, p_test, 0.5),
                "at_best_f1_threshold": classification_report_at_threshold(y_test, p_test, best_thr),
            },
            "world_cup_2022_external_test": {
                "log_loss": float(log_loss(y_ext, p_ext)),
                "brier_score": float(brier_score_loss(y_ext, p_ext)),
                "roc_auc": float(roc_auc_score(y_ext, p_ext)),
                "ece": expected_calibration_error(y_ext, p_ext),
            },
            "generalization_gap": {
                "logloss_val_to_test": info["test_logloss"] - info["val_logloss"],
                "logloss_test_to_external": float(log_loss(y_ext, p_ext)) - float(log_loss(y_test, p_test)),
                "auc_test_to_external": float(roc_auc_score(y_ext, p_ext)) - float(roc_auc_score(y_test, p_test)),
            },
            "best_params": info["best_params"],
            "fit_time_s": info["fit_time_s"],
            "inference_time_ms_per_shot": info["inference_time_ms_per_shot"],
        }
        metrics["variants"][variant_name] = variant_metrics

        fpr, tpr, _ = roc_curve(y_test, p_test)
        roc_data[variant_name] = (fpr, tpr, variant_metrics["la_liga_test"]["roc_auc"])
        confs, accs = compute_calibration_bins(y_test, p_test)
        calibration_data[variant_name] = {"bin_confidence": confs, "bin_accuracy": accs}

        curve_file = ROOT / "reports" / "training_curves" / f"{variant_name}.json"
        if curve_file.exists():
            with open(curve_file) as f:
                curves = json.load(f)
            plot_training_curves(variant_name, curves, FIGURES_DIR / f"training_curve_{variant_name}.png")

    # StatsBomb's own xG, as an external baseline comparison (never used as
    # a model input - point 8.3 of the guide: "comparación contra una
    # solución existente").
    sb_xg_test = splits["test"]["statsbomb_xg"].fillna(splits["test"]["statsbomb_xg"].mean()).values
    sb_xg_ext = splits["external_test"]["statsbomb_xg"].fillna(splits["external_test"]["statsbomb_xg"].mean()).values
    metrics["statsbomb_xg_baseline"] = {
        "la_liga_test": {
            "log_loss": float(log_loss(y_test, sb_xg_test)),
            "roc_auc": float(roc_auc_score(y_test, sb_xg_test)),
            "ece": expected_calibration_error(y_test, sb_xg_test),
        },
        "world_cup_2022_external_test": {
            "log_loss": float(log_loss(y_ext, sb_xg_ext)),
            "roc_auc": float(roc_auc_score(y_ext, sb_xg_ext)),
            "ece": expected_calibration_error(y_ext, sb_xg_ext),
        },
    }
    preds_test["statsbomb_xg"] = sb_xg_test
    roc_data["statsbomb_xg"] = (
        *roc_curve(y_test, sb_xg_test)[:2],
        metrics["statsbomb_xg_baseline"]["la_liga_test"]["roc_auc"],
    )

    # Core comparison: does adding defender features improve each family?
    families = sorted({v["family"] for k, v in train_results.items() if not k.startswith("_")})
    defender_effect = {}
    for family in families:
        geo_name = f"{family}_geo"
        full_name = f"{family}_full"
        defender_effect[family] = {
            "logloss": bootstrap_metric_difference(
                y_test, match_ids_test, preds_test[geo_name], preds_test[full_name],
                lambda yt, yp: log_loss(yt, yp), lower_is_better=True,
            ),
            "roc_auc": bootstrap_metric_difference(
                y_test, match_ids_test, preds_test[geo_name], preds_test[full_name],
                lambda yt, yp: roc_auc_score(yt, yp), lower_is_better=False,
            ),
        }
    metrics["defender_effect_bootstrap"] = defender_effect

    # Subgroup analysis on the selected production model.
    selected = train_results["_selected_production_model"]
    test_df = splits["test"].reset_index(drop=True)
    p_selected = preds_test[selected]
    subgroups = {
        "headers": test_df["shot_body_part"] == "Head",
        "long_range_over_20m": test_df["distance_to_goal_m"] > 20,
        "crowded_3plus_defenders_in_triangle": test_df["defenders_in_triangle"] >= 3,
        "open_1_defender_or_fewer": test_df["defenders_in_triangle"] <= 1,
    }
    subgroup_metrics = {}
    for name, mask in subgroups.items():
        if mask.sum() < 20:
            continue
        subgroup_metrics[name] = {
            "n": int(mask.sum()),
            "log_loss": float(log_loss(y_test[mask], p_selected[mask])),
            "roc_auc": float(roc_auc_score(y_test[mask], p_selected[mask])) if len(np.unique(y_test[mask])) > 1 else None,
        }
    metrics["subgroup_analysis"] = {"selected_model": selected, "results": subgroup_metrics}

    metrics["calibration_from_training"] = train_results.get("_calibration")
    metrics["selected_production_model"] = selected
    metrics["dataset_info"] = train_results.get("_dataset_info")

    # Monotonic-constraints ablation: does imposing domain knowledge (a
    # defender can never make a shot easier, etc.) cost or help predictive
    # performance, compared to letting the tree models learn unconstrained?
    unconstrained = train_results.get("_monotonic_constraints_ablation", {})
    ablation = {}
    for family in ("xgboost", "lightgbm"):
        constrained_key = f"{family}_full"
        unconstrained_key = f"{family}_full_unconstrained"
        if constrained_key in metrics["variants"] and unconstrained_key in unconstrained:
            ablation[family] = {
                "constrained": {
                    "val_logloss": train_results[constrained_key]["val_logloss"],
                    "test_logloss": metrics["variants"][constrained_key]["la_liga_test"]["log_loss"],
                    "test_auc": metrics["variants"][constrained_key]["la_liga_test"]["roc_auc"],
                },
                "unconstrained": unconstrained[unconstrained_key],
            }
    metrics["monotonic_constraints_ablation"] = ablation

    # Interpretability: LR coefficients + tree-model gain importance for the
    # "full" variant of each family, so the report can discuss which
    # features (geometric or defensive) actually drive predictions.
    interpretability = {}
    for family in families:
        full_name = f"{family}_full"
        model = joblib.load(MODELS_DIR / full_name / "model.joblib")
        preprocessor = joblib.load(MODELS_DIR / full_name / "preprocessor.joblib")
        names = get_onehot_feature_names(preprocessor, "full")
        if hasattr(model, "coef_"):
            values = model.coef_[0].tolist()
            kind = "coefficient"
        elif hasattr(model, "feature_importances_"):
            values = model.feature_importances_.tolist()
            kind = "importance"
        else:
            continue
        ranked = sorted(zip(names, values), key=lambda x: abs(x[1]), reverse=True)
        interpretability[full_name] = {"kind": kind, "ranked_features": ranked[:15]}

    metrics["interpretability"] = interpretability
    if interpretability:
        top_family = next(iter(interpretability.keys()))
        feats, vals = zip(*interpretability[top_family]["ranked_features"])
        plt.figure(figsize=(7, 5))
        plt.barh(feats[::-1], vals[::-1])
        plt.xlabel(interpretability[top_family]["kind"])
        plt.title(f"Importancia de variables: {top_family}")
        plt.tight_layout()
        plt.savefig(FIGURES_DIR / f"feature_importance_{top_family}.png", dpi=150)
        plt.close()

    plot_roc_curves(roc_data, FIGURES_DIR / "roc_curves.png")
    plot_calibration_curve(calibration_data, FIGURES_DIR / "calibration_curve.png")

    with open(REPORTS_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    print(f"Saved evaluation -> {REPORTS_DIR / 'metrics.json'}")

    summary_rows = []
    for k, v in metrics["variants"].items():
        summary_rows.append(
            {
                "variant": k,
                "test_logloss": v["la_liga_test"]["log_loss"],
                "test_auc": v["la_liga_test"]["roc_auc"],
                "test_ece": v["la_liga_test"]["ece"],
                "external_test_logloss": v["world_cup_2022_external_test"]["log_loss"],
                "external_test_auc": v["world_cup_2022_external_test"]["roc_auc"],
            }
        )
    summary_rows.append(
        {
            "variant": "statsbomb_xg_baseline",
            "test_logloss": metrics["statsbomb_xg_baseline"]["la_liga_test"]["log_loss"],
            "test_auc": metrics["statsbomb_xg_baseline"]["la_liga_test"]["roc_auc"],
            "test_ece": metrics["statsbomb_xg_baseline"]["la_liga_test"]["ece"],
            "external_test_logloss": metrics["statsbomb_xg_baseline"]["world_cup_2022_external_test"]["log_loss"],
            "external_test_auc": metrics["statsbomb_xg_baseline"]["world_cup_2022_external_test"]["roc_auc"],
        }
    )
    pd.DataFrame(summary_rows).to_csv(TABLES_DIR / "model_comparison.csv", index=False)
    print(f"Saved model comparison table -> {TABLES_DIR / 'model_comparison.csv'}")

    return metrics


if __name__ == "__main__":
    run_full_evaluation()
