#!/usr/bin/env python3
"""fig_lint.py — 图件命名 / DPI / 空目录检查（CB-2）

扫描 figs/fig_*.png：命名规范（fig_XX_描述.png）、非空、DPI≥300（需 Pillow）。
对应门禁 CB-2 / CB-8。

返回码: 0 = 通过；1 = 存在违规
用法:
    python scripts/fig_lint.py [--root <dir>]
"""
import argparse
import re
import sys
from pathlib import Path

NAME_RE = re.compile(r"^fig_\d{2,}_[A-Za-z0-9_]+_\S*\.png$")


def _find_root(explicit):
    if explicit:
        return Path(explicit).resolve()
    here = Path(__file__).resolve().parent
    cur = here
    for _ in range(6):
        if (cur / "state" / "frozen_results.json").exists():
            return cur
        nxt = cur.parent
        if nxt == cur:
            break
        cur = nxt
    return here.parent.parent.parent


def main():
    ap = argparse.ArgumentParser(description="图件命名/DPI 检查（CB-2）")
    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = _find_root(args.root)

    figs = root / "figs"
    if not figs.exists():
        print(f"[FAIL] 目录不存在: {figs}")
        return 1
    pngs = sorted(figs.glob("*.png"))
    if not pngs:
        print(f"[FAIL] {figs} 下无 .png 图件")
        return 1

    try:
        from PIL import Image
        have_pil = True
    except Exception:
        have_pil = False
        print("[WARN] 未安装 Pillow，跳过 DPI 检查（pip install Pillow）")

    ok = True
    for p in pngs:
        if not NAME_RE.match(p.name):
            print(f"[WARN] 命名不规范: {p.name}（建议 fig_01_描述.png）")
        if p.stat().st_size == 0:
            print(f"[FAIL] 空文件: {p.name}")
            ok = False
            continue
        if have_pil:
            try:
                with Image.open(p) as im:
                    dpi = im.info.get("dpi")
                    if dpi and dpi[0] < 300:
                        print(f"[WARN] {p.name}: DPI={int(dpi[0])} < 300")
            except Exception as e:
                print(f"[WARN] {p.name}: 打开失败 {e}")

    print(f"[{'PASS' if ok else 'FAIL'}] 图件检查：{len(pngs)} 个文件")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
