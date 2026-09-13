"""Exploratory data analysis on the cleaned, feature-built dataset.

Produces the plots and numbers the guide asks for before any modeling:
shots per competition/season, class balance, shot location heatmap, and a
feature-distribution overview. Also documents the known bias in La Liga
open data (it heavily overrepresents Barcelona matches, since that is what
StatsBomb has made public), which is exactly why the World Cup 2022 is used
as an external generalization test rather than another random split of the
same source.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = ROOT / "data" / "processed"
EDA_DIR = ROOT / "reports" / "eda"
EDA_DIR.mkdir(parents=True, exist_ok=True)


def run_eda() -> dict:
    la_liga = pd.read_parquet(PROCESSED_DIR / "la_liga_features.parquet")
    wc = pd.read_parquet(PROCESSED_DIR / "world_cup_2022_features.parquet")

    summary = {}

    summary["la_liga_shots_total"] = len(la_liga)
    summary["world_cup_2022_shots_total"] = len(wc)
    summary["la_liga_goal_rate"] = float(la_liga["is_goal"].mean())
    summary["world_cup_2022_goal_rate"] = float(wc["is_goal"].mean())
    summary["la_liga_freeze_frame_coverage"] = float(la_liga["has_freeze_frame"].mean())
    summary["world_cup_2022_freeze_frame_coverage"] = float(wc["has_freeze_frame"].mean())

    team_counts = la_liga["team"].value_counts().head(10)
    summary["la_liga_top_teams_by_shots"] = team_counts.to_dict()
    top_team_share = team_counts.iloc[0] / len(la_liga)
    summary["la_liga_top_team_share_of_shots"] = float(top_team_share)
    summary["bias_note"] = (
        "StatsBomb's open La Liga data is not a uniform sample across teams: "
        f"the single most-represented team accounts for {top_team_share:.1%} of all shots "
        "(open data historically skews towards Barcelona matches). This is a known "
        "sampling bias in the training source and is the reason the World Cup 2022 "
        "(a different competition, different teams, different playing styles) is used "
        "as an external generalization test rather than another La Liga split."
    )

    plt.figure(figsize=(6, 4))
    plt.bar(["No gol", "Gol"], [1 - summary["la_liga_goal_rate"], summary["la_liga_goal_rate"]])
    plt.ylabel("Proporción de disparos")
    plt.title(f"Balance de clases - La Liga (gol = {summary['la_liga_goal_rate']:.1%})")
    plt.tight_layout()
    plt.savefig(EDA_DIR / "class_balance.png", dpi=150)
    plt.close()

    plt.figure(figsize=(8, 5))
    valid = la_liga.dropna(subset=["loc_x", "loc_y"])
    plt.hist2d(valid["loc_x"], valid["loc_y"], bins=40, range=[[60, 120], [0, 80]])
    plt.colorbar(label="Cantidad de disparos")
    plt.xlabel("Posición X (StatsBomb, hacia el arco rival)")
    plt.ylabel("Posición Y")
    plt.title("Mapa de calor de posiciones de disparo - La Liga")
    plt.tight_layout()
    plt.savefig(EDA_DIR / "shot_location_heatmap.png", dpi=150)
    plt.close()

    numeric_cols = ["distance_to_goal_m", "shot_angle_deg", "defenders_in_triangle", "nearest_defender_dist_m"]
    ff_only = la_liga[la_liga["has_freeze_frame"]]
    _fig, axes = plt.subplots(2, 2, figsize=(10, 8))
    for ax, col in zip(axes.flat, numeric_cols):
        ax.hist(ff_only[col].dropna(), bins=30)
        ax.set_title(col)
    plt.tight_layout()
    plt.savefig(EDA_DIR / "feature_distributions.png", dpi=150)
    plt.close()

    season_counts = la_liga.groupby("season_id").size().to_dict()
    summary["la_liga_shots_per_season_id"] = season_counts

    with open(EDA_DIR / "eda_summary.json", "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(json.dumps(summary, indent=2, default=str))
    return summary


if __name__ == "__main__":
    run_eda()
