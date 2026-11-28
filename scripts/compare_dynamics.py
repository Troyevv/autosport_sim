"""Plot two 50 Hz audit recordings against a pinned, independently timed F1 lap."""

import argparse
import csv
import json
from pathlib import Path
import subprocess

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

REVISION = "dfb3ea3f50b69857fe8e40cabe5e899743c59f6a"
RACES = {
    "monza": (
        "Italian",
        16,
        "Монца",
        [
            (1, "Rettifilo"),
            (3, "Curva Grande"),
            (6, "Lesmo 1"),
            (8, "Ascari"),
            (11, "Alboreto"),
        ],
        (337, 89),
    ),
    "monaco": (
        "Monaco",
        27,
        "Монако",
        [
            (1, "Sainte Dévote"),
            (6, "Fairmont"),
            (10, "Nouvelle Chicane"),
            (13, "Piscine"),
            (19, "Anthony Noghès"),
        ],
        (250, 130),
    ),
}


def source(repo, event, name):
    path = f"{event} Grand Prix/Qualifying/{name}.json"
    return json.loads(
        subprocess.check_output(["git", "-C", str(repo), "show", f"{REVISION}:{path}"])
    )


def kinematic_g(t, speed, x, y):
    """Equal-time filtering for broadcast XY and the integrated vehicle path."""
    middle = np.arange(t[0] + 0.5, t[-1] - 0.5, 0.05)
    ax = (
        np.interp(middle + 0.5, t, speed) - np.interp(middle - 0.5, t, speed)
    ) / 9.80665
    x0, x1, x2 = (np.interp(middle + lag, t, x) for lag in [-0.5, 0, 0.5])
    y0, y1, y2 = (np.interp(middle + lag, t, y) for lag in [-0.5, 0, 0.5])
    heading_change = np.arctan2(y2 - y1, x2 - x1) - np.arctan2(y1 - y0, x1 - x0)
    dyaw = np.arctan2(np.sin(heading_change), np.cos(heading_change))
    ay = np.interp(middle, t, speed) * dyaw / (0.5 * 9.80665)
    return np.round(
        [np.percentile(ax, 5), np.percentile(ax, 95), np.percentile(abs(ay), 95)], 2
    )


def crossing_distance(v, distance, start, end):
    def cross(value, offset):
        i = next(j for j in range(max(1, offset), len(v)) if v[j - 1] > value >= v[j])
        return i, np.interp(-value, -v[i - 1 : i + 1], distance[i - 1 : i + 1])

    i, begin = cross(start, 1)
    return cross(end, i)[1] - begin


def read(folder, key):
    return np.genfromtxt(folder / f"{key}.csv", delimiter=",", names=True)


def compare(before, after, repo, out):
    out.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "svg.fonttype": "none",
            "svg.hashsalt": "physics-audit-2025",
        }
    )
    tables = []
    for label, folder in [("before", before), ("after", after)]:
        for row in json.loads((folder / "summary.json").read_text()):
            gates = row.pop("sectors_s")
            tables.append(
                dict(
                    version=label,
                    **row,
                    **{f"s{i + 1}_s": s for i, s in enumerate(gates)},
                )
            )
    fields = list(dict.fromkeys(k for r in tables for k in r))
    with (out / "measurements.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fields, lineterminator="\n")
        w.writeheader()
        w.writerows(
            {k: round(v, 6) if isinstance(v, float) else v for k, v in r.items()}
            for r in tables
        )
    for key, (event, number, title, turns, thresholds) in RACES.items():
        tel = source(repo, event, f"HAM/{number}_tel")["tel"]
        corners = source(repo, event, "corners")
        times = source(repo, event, "HAM/laptimes")
        d = np.asarray(tel["distance"])
        progress = d / d[-1]
        v = np.asarray(tel["speed"])
        t = np.asarray(tel["time"])
        sim = [read(folder, key) for folder in (before, after)]
        fig, axes = plt.subplots(
            4,
            1,
            figsize=(11.3, 8.6),
            sharex=True,
            layout="constrained",
            gridspec_kw={"height_ratios": [2, 1, 1, 1]},
        )
        fig.suptitle(
            f"{title} · Ferrari №44 · квалификация 2025", fontweight="bold", fontsize=16
        )
        colors = ["#985024", "#055878"]
        for r, label, color in zip(sim, ["До", "После"], colors, strict=True):
            x = r["progress"] * 100
            axes[0].plot(x, 3.6 * r["speed_m_s"], label=label, color=color, lw=1.5)
            axes[1].plot(
                x,
                r["time_s"] - np.interp(r["progress"], progress, t),
                color=color,
                lw=1.3,
            )
            axes[2].plot(x, r["ax_m_s2"] / 9.80665, color=color, lw=1)
            axes[3].plot(x, abs(r["ay_m_s2"]) / 9.80665, color=color, lw=1)
        axes[0].plot(
            progress * 100, v, label="Hamilton · Q3", color="#333333", lw=1.15, ls="--"
        )
        for ax, tag in zip(
            axes,
            ["Скорость, км/ч", "Отставание, с", "Продольное, g", "|Поперечное|, g"],
            strict=True,
        ):
            ax.set_ylabel(tag)
            ax.grid(alpha=0.20)
            ax.spines[["right", "top"]].set_visible(False)
        axes[0].legend(ncol=3, loc="lower left", framealpha=0.9)
        axes[0].set_ylim(
            0, 1.17 * max(v.max(), *(max(r["speed_m_s"]) * 3.6 for r in sim))
        )
        for n, name in turns:
            pos = corners["Distance"][corners["CornerNumber"].index(n)] / d[-1] * 100
            axes[0].text(
                pos,
                0.96,
                f"T{n}",
                transform=axes[0].get_xaxis_transform(),
                ha="center",
                va="top",
            )
            for ax in axes:
                ax.axvline(pos, color="#777", lw=0.6, alpha=0.5, ls=":")
        axes[-1].set_xlabel("Доля круга от линии хронометража, %")
        axes[-1].set_xlim(0, 100)
        fig.savefig(out / f"{key}-audit.svg", metadata={"Date": None})
        plt.close(fig)
        # Compare minima inside a common window around numbered corner stations.
        print(title, "reference", times["time"][number - 1], "vmax", round(max(v), 1))
        print("kinematic g (5th/95th longitudinal, 95th absolute lateral)")
        for r in sim:
            print(kinematic_g(r["time_s"], r["speed_m_s"], r["x_m"], r["y_m"]))
        print(
            kinematic_g(
                t, v / 3.6, np.asarray(tel["x"]) / 10, np.asarray(tel["y"]) / 10
            )
        )
        for n, name in turns:
            p = corners["Distance"][corners["CornerNumber"].index(n)] / d[-1]
            half = 65 / d[-1] if key == "monza" else 35 / d[-1]
            speeds = [
                min(r["speed_m_s"][abs(r["progress"] - p) <= half]) * 3.6 for r in sim
            ]
            print(
                name,
                *(round(x, 1) for x in [*speeds, min(v[abs(progress - p) <= half])]),
            )
        # The first descending speed crossings select the first braking zone.
        print(
            "braking",
            thresholds,
            *(
                round(
                    crossing_distance(
                        r["speed_m_s"] * 3.6, r["distance_m"], *thresholds
                    ),
                    1,
                )
                for r in sim
            ),
            round(crossing_distance(v, d, *thresholds), 1),
        )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ("before", "after", "reference", "output"):
        p.add_argument(arg, type=Path)
    args = p.parse_args()
    compare(args.before, args.after, args.reference, args.output)
