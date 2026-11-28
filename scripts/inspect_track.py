"""Write a standalone engineering drawing from native spatial samples."""

import argparse
from html import escape
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.race.layouts import (  # noqa: E402
    LINE_CLASSES,
    VERSION,
    Road,
    base_lines,
    geometry_snapshot,
    layout_ids,
    load_layout,
)


def drawing(layout_id, vehicle_class, series, samples, detail_at=None, grid_count=None):
    if grid_count is None:
        grid_count = 34 if vehicle_class == "kart" else 20
    view = geometry_snapshot(
        layout_id, VERSION, series, vehicle_class, samples, grid_count
    )
    layout = load_layout(layout_id)
    road, pit = (layout.track.ribbon(r) for r in (Road.circuit, Road.pit))
    main, branch = view["circuit"], view["pit"]
    distances = [road.length * i / samples for i in range(samples)]
    left = road.sample([(s, row[7]) for s, row in zip(distances, main, strict=True)])
    right = road.sample([(s, -row[8]) for s, row in zip(distances, main, strict=True)])
    rows = left + right + branch
    xmin, xmax = min(r[0] for r in rows), max(r[0] for r in rows)
    ymin, ymax = min(r[1] for r in rows), max(r[1] for r in rows)
    scale = min(1100 / (xmax - xmin), 555 / (ymax - ymin))

    def xy(row):
        return (
            600 + (row[0] - (xmax + xmin) / 2) * scale,
            350 - (row[1] - (ymax + ymin) / 2) * scale,
        )

    out = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1080">',
        '<rect width="1200" height="1080" fill="white"/>',
        '<g font-family="DejaVu Sans, Arial, sans-serif" fill="#172631">',
    ]

    def label(x, y, value, size=15):
        out.append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}">{escape(str(value))}</text>'
        )

    def path(points, color, width=1, close=False, fill="none", dash=""):
        pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
        tag = "polygon" if close else "polyline"
        out.append(
            f'<{tag} points="{pts}" fill="{fill}" stroke="{color}" stroke-width="{width}" '
            f'stroke-dasharray="{dash or "none"}" stroke-linejoin="round"/>'
        )

    label(35, 33, f"{view['name']} · {layout_id.split(':')[1]}", 25)
    label(
        35,
        57,
        f"Версия {VERSION}  ·  {vehicle_class}  ·  длина оси в плане {road.length:,.1f} м  ·  паспорт {view['length_m']} м",
    )
    # Opposite windings leave the infield empty. Use a path per edge so
    # disconnected parts of a figure-eight are filled in the correct order.
    rings = []
    for edge in (left, list(reversed(right))):
        rings.append(
            "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in map(xy, edge)) + " Z"
        )
    out.append(f'<path d="{" ".join(rings)}" fill="#e2e8e9" fill-rule="evenodd"/>')
    for edge in (left, right):
        path(map(xy, edge), "#253641", 1.3, True)
    for key, color in (("left", "#888197"), ("right", "#43798d"), ("dry", "#b75913")):
        points = road.sample(
            list(zip(distances, view["line_offsets_m"][key], strict=True))
        )
        path(map(xy, points), color, 1.1, True)
    path(map(xy, branch), "#257148", 2.1)
    for s, d in layout.boxes():
        x, y = xy(pit.sample([(s, d)])[0])
        out.append(
            f'<rect x="{x:.2f}" y="{y:.2f}" width="2" height="2" fill="#183e2e"/>'
        )
    for s, d in view["grid_coordinates_m"]:
        x, y = xy(road.sample([(s, d)])[0])
        out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="1.1"/>')
    for i, s in enumerate([0, *view["sector_gates_m"]]):
        row = road.sample([(s, 0)])[0]
        gate = road.sample([(s, row[7] + 4), (s, -row[8] - 4)])
        path(map(xy, gate), "#213141", 2)
        x, y = xy(gate[0])
        label(x + 3, y - 5, "Старт / финиш" if i == 0 else f"S{i + 1}", 13)
    for a, b in view["drs"]:
        run = road.sample(
            [(((a + (b - a) % 1 * i / 100) % 1) * road.length, -5) for i in range(101)]
        )
        path(map(xy, run), "#21655d", 1.5, dash="3 2")
    for i, (txt, color) in enumerate(
        [
            ("Сухая линия", "#b75913"),
            ("Альтернатива слева", "#888197"),
            ("Альтернатива справа", "#43798d"),
            ("Пит-лейн и боксы", "#257148"),
            ("DRS", "#21655d"),
        ]
    ):
        x = 36 + i * 226
        path([(x, 652), (x + 26, 652)], color, 2, dash="3 2" if txt == "DRS" else "")
        label(x + 32, 657, txt)
    zs = [r[2] - main[0][2] for r in main] + [0]
    lo, hi = min(zs), max(zs)
    den = max(1, hi - lo)
    path([(42, 804), (1160, 804)], "#a6afb1")
    path(
        [
            (42 + 1118 * i / samples, 800 - 82 * (z - lo) / den)
            for i, z in enumerate(zs)
        ],
        "#253b52",
        2,
    )
    label(36, 698, f"Высота относительно линии финиша · от {lo:.1f} до {hi:.1f} м")
    label(42, 826, "0 м")
    label(1075, 826, f"{road.length:.0f} м")
    # Unroll a selected part of the road in (s,d) to make metre-scale
    # separations visible even on a 13 km overview.
    if detail_at is None:
        detail_at = distances[max(range(samples), key=lambda i: abs(main[i][5]))]
    span = min(180.0, road.length / 6)
    section_s = [(detail_at + span * (i / 180 - 0.5)) % road.length for i in range(181)]
    sections = road.sample([(s, 0.0) for s in section_s])
    lines = base_lines(layout_id, VERSION, LINE_CLASSES[vehicle_class])
    lateral = max(max(r[7], r[8]) for r in sections)

    def detail_xy(i, offset):
        return (42 + 1118 * i / 180, 933 - 48 * offset / lateral)

    label(
        36,
        865,
        f"Поперечное положение линий · участок {section_s[0]:.0f}–{section_s[-1]:.0f} м · поперечный масштаб увеличен",
    )
    for sign, column in ((1, 7), (-1, 8)):
        path(
            [detail_xy(i, sign * r[column]) for i, r in enumerate(sections)],
            "#253641",
            1.4,
        )
    for p, color in ((1, "#888197"), (-1, "#43798d"), (0, "#b75913")):
        path(
            [
                detail_xy(i, d)
                for i, d in enumerate(lines.offsets([(s, p) for s in section_s]))
            ],
            color,
            2,
        )
    label(42, 1003, f"Слева +{lateral:.1f} м   /   справа −{lateral:.1f} м")
    label(36, 1031, "Источник высот · " + view["quality"]["elevation"], 13)
    label(
        36,
        1056,
        "Геометрия © OpenStreetMap contributors, OpenTrackData и авторы, указанные в паспорте конфигурации.",
        13,
    )
    return "\n".join([*out, "</g></svg>"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("layout", choices=layout_ids())
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--class", dest="vehicle_class", choices=LINE_CLASSES, default="formula"
    )
    parser.add_argument("--series", default="f1")
    parser.add_argument("--samples", type=int, default=1200)
    parser.add_argument(
        "--detail-at", type=float, help="Центр увеличенного участка в метрах от старта"
    )
    parser.add_argument(
        "--grid-count", type=int, help="Число стартовых позиций на чертеже"
    )
    args = parser.parse_args()
    args.output.write_text(
        drawing(
            args.layout,
            args.vehicle_class,
            args.series,
            args.samples,
            args.detail_at,
            args.grid_count,
        ),
        encoding="utf-8",
    )
