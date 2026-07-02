#!/usr/bin/env python3
"""Render a PNG contact sheet from create-contact-sheet.cjs JSON output."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError as exc:  # pragma: no cover - exercised by CLI environments
    raise SystemExit(
        "Pillow is required for PNG contact sheets. Install pillow or omit --png-out."
    ) from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render contact-sheet.json to PNG.")
    parser.add_argument("--map", required=True, help="Path to contact-sheet.json")
    parser.add_argument("--out", required=True, help="Output PNG path")
    parser.add_argument("--max-slots", type=int, default=15)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    map_path = Path(args.map)
    out_path = Path(args.out)
    data = json.loads(map_path.read_text(encoding="utf-8"))
    students = data.get("students") or []
    max_slots = max(1, min(15, args.max_slots))
    slot_count = max(
        1,
        min(max_slots, max((len(student.get("selections") or []) for student in students), default=1)),
    )
    cols = 1 if slot_count >= 10 else 2 if slot_count >= 5 else 4
    thumb_w = 150
    thumb_h = 110
    pad = 14
    title_h = 28
    cell_w = (thumb_w * slot_count) + (pad * (slot_count + 1))
    cell_h = thumb_h + title_h + (pad * 3)
    rows = max(1, (len(students) + cols - 1) // cols)

    canvas = Image.new("RGB", (cell_w * cols, cell_h * rows), "white")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()

    for index, student in enumerate(students):
        col = index % cols
        row = index // cols
        x0 = col * cell_w
        y0 = row * cell_h
        draw.rectangle([x0, y0, x0 + cell_w - 1, y0 + cell_h - 1], outline="#d0d7de")
        label = str(student.get("studentKey") or f"local-{index + 1:03d}")[:28]
        draw.text((x0 + pad, y0 + pad), label, fill="#24292f", font=font)

        selections = student.get("selections") or []
        if not selections and student.get("sourceImage"):
            selections = [{"sourceImage": student["sourceImage"], "role": "representative"}]
        for slot_index, selection in enumerate(selections[:slot_count]):
            image_x = x0 + pad + slot_index * (thumb_w + pad)
            image_y = y0 + title_h + pad
            source = selection.get("sourceImage") or ""
            render_thumbnail(canvas, draw, source, image_x, image_y, thumb_w, thumb_h, font)
            role = str(selection.get("role") or selection.get("label") or "")[:18]
            if role:
                draw.text((image_x, image_y + thumb_h + 3), role, fill="#57606a", font=font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)


def render_thumbnail(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    source: str,
    x: int,
    y: int,
    width: int,
    height: int,
    font: ImageFont.ImageFont,
) -> None:
    path = Path(source)
    try:
        with Image.open(path) as image:
            thumbnail = ImageOps.contain(image.convert("RGB"), (width, height))
    except Exception:
        draw.rectangle([x, y, x + width, y + height], fill="#f6f8fa", outline="#d0d7de")
        draw.text((x + 8, y + 8), "unreadable", fill="#57606a", font=font)
        return

    px = x + (width - thumbnail.width) // 2
    py = y + (height - thumbnail.height) // 2
    canvas.paste(thumbnail, (px, py))
    draw.rectangle([x, y, x + width, y + height], outline="#d0d7de")


if __name__ == "__main__":
    main()
