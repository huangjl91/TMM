#!/usr/bin/env python3
"""fig_diff.py — 图件像素与尺寸比对

比对 figs/ 与 figs_repro/ 下同名 fig_*.png，像素差异 < 0.1% 视为通过。
返回码: 0 = PASS, 1 = FAIL
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
FIGS = ROOT / "figs"
REPRO = ROOT / "figs_repro"
PIXEL_TOL = 0.001


def main():
    import argparse
    argparse.ArgumentParser(
        description="fig_diff.py — 图件像素与尺寸比对（figs/ vs figs_repro/，像素差 <0.1% 通过）"
    ).parse_known_args()
    try:
        from PIL import Image, ImageChops
    except ImportError:
        print("[FAIL] 需要 Pillow：pip install Pillow")
        return 1

    if not FIGS.exists() or not REPRO.exists():
        print(f"[FAIL] 目录缺失: {FIGS} 或 {REPRO}")
        return 1

    fails = 0
    pngs = sorted(FIGS.glob("fig_*.png"))
    if not pngs:
        print(f"[FAIL] {FIGS} 下没有 fig_*.png")
        return 1

    for p in pngs:
        q = REPRO / p.name
        if not q.exists():
            print(f"[FAIL] {p.name}: 复现图缺失")
            fails += 1
            continue
        try:
            a = Image.open(p).convert("RGB")
            b = Image.open(q).convert("RGB")
        except Exception as e:
            print(f"[FAIL] {p.name}: 打开失败 {e}")
            fails += 1
            continue
        if a.size != b.size:
            print(f"[FAIL] {p.name}: 尺寸不同 {a.size} vs {b.size}")
            fails += 1
            continue
        diff = ImageChops.difference(a, b)
        total = a.size[0] * a.size[1]
        changed = 0
        if diff.getbbox() is not None:
            changed = sum(1 for px in diff.getdata() if px != (0, 0, 0))
        ratio = (changed / total) if total else 0.0
        ok = ratio < PIXEL_TOL
        print(f"[{'PASS' if ok else 'FAIL'}] {p.name}: 像素差异 {ratio:.4%}")
        if not ok:
            fails += 1
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
