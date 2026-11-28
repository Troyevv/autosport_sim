"""Plot an instrumented run of the installed native engine as a self-contained animated SVG."""

import argparse
from io import BytesIO
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from _race_space import Road

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.race.layouts import load_layout  # noqa: E402
from backend.race.session import INDEX, Session  # noqa: E402
from backend.race.vehicles import opening_vehicle  # noqa: E402


def render(layout_id, entries, output, seconds, water):
    layout = load_layout(layout_id)
    field = [opening_vehicle(entry, temp=80.0) for entry in entries]
    session = Session(layout_id, field, water_mm=water)
    rows = {e: [] for e in entries}
    elapsed = 0
    while elapsed < seconds * 50:
        n = min(2500, seconds * 50 - elapsed)
        batch = session.advance(n, sample_every=10)
        for entry in rows:
            rows[entry].extend(batch["rows"][entry])
        elapsed += n
    road = layout.track.ribbon(Road.circuit)
    centres = road.sample([(road.length * i / 1600, 0) for i in range(1601)])
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "font.size": 9,
            "svg.fonttype": "none",
            "svg.hashsalt": "race-dynamics-v1",
            "axes.spines.top": False,
            "axes.spines.right": False,
        }
    )
    fig = plt.figure(figsize=(14, 7.6), dpi=72)
    panels = fig.add_gridspec(
        4,
        2,
        width_ratios=[1.1, 1],
        left=0.045,
        right=0.97,
        top=0.86,
        bottom=0.09,
        hspace=0.43,
        wspace=0.25,
    )
    track_ax = fig.add_subplot(panels[:, 0])
    for sign, idx in [(1, 7), (-1, 8)]:
        track_ax.plot(
            [r[0] - sign * r[4] * r[idx] for r in centres],
            [r[1] + sign * r[3] * r[idx] for r in centres],
            lw=1.25,
            color="#90989d",
        )
    track_ax.set_aspect("equal")
    track_ax.set_xlabel("Восток, м")
    track_ax.set_ylabel("Север, м")
    fig.suptitle(
        f"{layout_id}   /   Физическая телеметрия", x=0.045, y=0.97, ha="left", size=19
    )
    fig.text(
        0.045,
        0.905,
        f"{seconds} с симуляции   ·   шаг 20 мс   ·   запись 5 Гц   ·   вода {water:g} мм",
    )
    channels = [
        ("speed_m_s", "Скорость, м/с"),
        ("downforce_n", "Прижимная сила, кН"),
        ("rl_surface_c", "Задняя левая шина, поверхность, °C"),
        ("wake", "Интенсивность следа, доля"),
    ]
    axes = [fig.add_subplot(panels[i, 1]) for i in range(4)]
    colors = ["#007678", "#b34923", "#5548a5", "#935218"]
    for i, (entry, data) in enumerate(rows.items()):
        color = colors[i % len(colors)]

        def values(key):
            return [r[INDEX[key]] for r in data]

        track_ax.plot(values("x_m"), values("y_m"), color=color, lw=0.7, label=entry)
        for ax, (key, label) in zip(axes, channels, strict=True):
            ax.plot(
                [tick * 0.02 for tick in values("tick")],
                [v / (1000 if key == "downforce_n" else 1) for v in values(key)],
                color=color,
                lw=1.05,
            )
            ax.set_title(label, loc="left", fontsize=10, pad=3)
            ax.grid(axis="y", alpha=0.18)
            ax.set_xlim(0, seconds)
    axes[-1].set_xlabel("Время с начала сессии, с")
    track_ax.legend(frameon=False, loc="best")
    fig.canvas.draw()
    svg = BytesIO()
    fig.savefig(svg, format="svg", metadata={"Date": None})
    ns = "http://www.w3.org/2000/svg"
    ET.register_namespace("", ns)
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    root = ET.fromstring(svg.getvalue())
    # SVG coordinates are points measured from the page's top left.
    h = fig.get_figheight() * 72

    def animate(parent, attribute, positions):
        ET.SubElement(
            parent,
            f"{{{ns}}}animate",
            attributeName=attribute,
            values=";".join(f"{v:.2f}" for v in positions),
            dur=f"{(len(positions) - 1) * 0.2:.1f}s",
            repeatCount="indefinite",
        )

    for i, (entry, data) in enumerate(rows.items()):
        xy = track_ax.transData.transform(
            [(r[INDEX["x_m"]], r[INDEX["y_m"]]) for r in data]
        )
        dot = ET.SubElement(
            root,
            f"{{{ns}}}circle",
            cx=f"{xy[0][0]:.2f}",
            cy=f"{h - xy[0][1]:.2f}",
            r="4",
            fill=colors[i % len(colors)],
            stroke="white",
        )
        ET.SubElement(dot, f"{{{ns}}}title").text = entry
        animate(dot, "cx", xy[:, 0])
        animate(dot, "cy", h - xy[:, 1])
    for ax in axes:
        x0, y0 = ax.transAxes.transform((0, 0))
        x1, y1 = ax.transAxes.transform((1, 1))
        cursor = ET.SubElement(
            root,
            f"{{{ns}}}line",
            x1=f"{x0}",
            x2=f"{x0}",
            y1=f"{h - y0}",
            y2=f"{h - y1}",
            stroke="#26364b",
            opacity=".55",
        )
        for attr in ("x1", "x2"):
            ET.SubElement(
                cursor,
                f"{{{ns}}}animate",
                attributeName=attr,
                values=f"{x0 + (x1 - x0) * 0.2 / seconds:.2f};{x1:.2f}",
                dur=f"{seconds - 0.2}s",
                repeatCount="indefinite",
            )
    ET.ElementTree(root).write(output, encoding="utf-8", xml_declaration=True)
    plt.close(fig)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("layout")
    parser.add_argument("output", type=Path)
    parser.add_argument("--entries", nargs="+", default=["f1-1", "f1-4"])
    parser.add_argument("--seconds", type=int, default=120)
    parser.add_argument("--water-mm", type=float, default=0.0)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 1800 or not 1 <= len(args.entries) <= 4:
        parser.error("Choose 1–1800 seconds and 1–4 entries")
    render(args.layout, args.entries, args.output, args.seconds, args.water_mm)
