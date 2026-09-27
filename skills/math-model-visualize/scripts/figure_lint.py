#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""figure_lint.py — G4 图件目录机检工具（标准库为主，Pillow/matplotlib 可选）。

用途:
    对 <project-root>/figs/ 下的 PNG 图件做交付前 lint:
      1) 报告文件尺寸 / DPI / 文件大小（Pillow 可用时）;
      2) DPI < --min-dpi（默认 300）报 WARN；目录为空或无 PNG 报 WARN;
      3) 检查命名是否符合 fig_XX_<slug>.png（两位序号，可选 ASCII slug）;
      4) 检查文件名是否含空格 / 中文（建议 ASCII slug）;
      5) 未安装 Pillow 时优雅降级：仅做命名与存在性检查，并打印 SKIP 提示。

规范依据: scripts/CANON.md §3.1（figs/fig_XX_<slug>.png，XX 两位序号，300 DPI）
         与 §4 数值常量（图片输出 300 DPI / PNG 正文格式）。

用法:
    python scripts/figure_lint.py [--dir figs] [--min-dpi 300]

退出码:
    0 = 无 WARN
    1 = 存在 WARN（低 DPI / 空目录 / 命名不合规）
    2 = 目录不存在或不可读
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata

try:
    from PIL import Image  # Pillow 可选
    _HAS_PIL = True
except Exception:
    Image = None
    _HAS_PIL = False

NAME_RE = re.compile(r"^fig_\d{2}_[A-Za-z0-9_\-]+\.png$")


def _setup_stream() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass


def _has_non_ascii(text: str) -> bool:
    return any(ord(ch) > 127 for ch in text)


def _has_space(text: str) -> bool:
    return any(ch.isspace() for ch in text)


def _num(value: float) -> str:
    return "%g" % value


def _human_size(nbytes: int) -> str:
    if nbytes < 1024:
        return "%d B" % nbytes
    if nbytes < 1024 * 1024:
        return "%.1f KB" % (nbytes / 1024.0)
    return "%.2f MB" % (nbytes / (1024.0 * 1024.0))


def _check_name(name: str) -> list:
    """返回该文件名触发的 WARN 列表。"""
    problems = []
    m = re.match(r"^fig_(\d+)_", name)
    if m is None:
        problems.append("命名不符合 fig_XX_<slug>.png（缺 fig_XX_ 序号前缀）")
    elif len(m.group(1)) != 2:
        problems.append("序号 %s 不是两位（应为 fig_01 … fig_99）" % m.group(1))
    if not NAME_RE.match(name):
        slug_ok = re.match(r"^fig_\d{2}_(.+)\.png$", name)
        if slug_ok and not re.match(r"^[A-Za-z0-9_\-]+$", slug_ok.group(1)):
            problems.append("slug 含非法字符，建议 ASCII slug（仅 A-Za-z0-9_ 与 -）")
    if _has_space(name):
        problems.append("文件名含空格，建议改用 ASCII slug（下划线连接）")
    if _has_non_ascii(name):
        problems.append("文件名含中文/全角字符，建议 ASCII slug")
    return problems


def lint(directory: str, min_dpi: float) -> int:
    if not os.path.isdir(directory):
        print("[ERROR] 目录不存在: %s（路径基准为项目工作区根）" % directory, file=sys.stderr)
        return 2

    entries = sorted(
        os.path.join(root, fn)
        for root, _dirs, files in os.walk(directory)
        for fn in files
    )
    pngs = [p for p in entries if p.lower().endswith(".png")]
    others = [p for p in entries if not p.lower().endswith(".png")]

    warns = 0
    print("dir     : %s" % os.path.abspath(directory))
    print("backend : %s" % ("Pillow " + getattr(Image, "__version__", "?")
                            if _HAS_PIL else "stdlib only"))
    print("")

    if not entries:
        print("WARN  空目录：未发现任何文件（应产出 figs/fig_XX_*.png，正文配图 15~25 幅（≥15））")
        return 1
    if not pngs:
        print("WARN  目录内无 PNG 图件（发现 %d 个非 PNG 文件）" % len(others))
        warns += 1

    if not _HAS_PIL:
        print("SKIP  未安装 Pillow，跳过尺寸/DPI 检查（仅做命名与存在性检查）。")
        print("")

    rows = []
    for path in pngs:
        rel = os.path.relpath(path, directory).replace(os.sep, "/")
        name = os.path.basename(path)
        size_bytes = os.path.getsize(path)
        problems = _check_name(name)

        dim = "-"
        dpi = "-"
        if _HAS_PIL:
            try:
                with Image.open(path) as img:
                    w, h = img.size
                    dim = "%dx%d" % (w, h)
                    raw_dpi = img.info.get("dpi")
                    if raw_dpi:
                        dpi_val = float(raw_dpi[0])
                        dpi = "%.0f" % dpi_val
                        # pHYs 以像素/米存储，300 DPI 往往回读为 299.9994，故取整比较
                        if round(dpi_val) < min_dpi:
                            problems.append("DPI %d < %s（需按 300 DPI 导出）"
                                            % (round(dpi_val), _num(min_dpi)))
                    else:
                        dpi = "n/a"
                        problems.append("缺少 DPI 元数据（导出时未设 dpi=%d）" % int(min_dpi))
            except Exception as exc:
                dim, dpi = "?", "?"
                problems.append("图片无法解析: %s" % exc)

        status = "OK" if not problems else "WARN"
        if problems:
            warns += len(problems)
        rows.append((status, rel, dim, dpi, _human_size(size_bytes)))
        for p in problems:
            print("WARN  %s: %s" % (rel, p))

    print("")
    _print_table(["STATUS", "FILE", "SIZE(px)", "DPI", "BYTES"], rows)
    print("")
    print("summary: %d png, %d warning(s)" % (len(pngs), warns))
    if others:
        print("note   : %d non-png file(s) in directory (未计入 lint)" % len(others))
    return 1 if warns else 0


def _print_table(headers, rows) -> None:
    def width(text):
        return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
                   for ch in str(text))
    widths = [width(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], width(cell))
    print("  ".join(str(h) + " " * (widths[i] - width(h)) for i, h in enumerate(headers)))
    print("-" * min(120, sum(widths) + 2 * (len(widths) - 1)))
    for row in rows:
        print("  ".join(str(c) + " " * (widths[i] - width(c)) for i, c in enumerate(row)))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="figure_lint.py",
        description="figs/ 图件目录 lint（命名 / 存在性 / 尺寸 / DPI，规范见 CANON §3.1、§4）",
    )
    parser.add_argument("--dir", default="figs",
                        help="图件目录（默认 figs，相对项目工作区根）")
    parser.add_argument("--min-dpi", type=float, default=300.0,
                        help="DPI 下限（默认 300）")
    return parser


def main(argv=None) -> int:
    _setup_stream()
    args = build_parser().parse_args(argv)
    return lint(args.dir, args.min_dpi)


if __name__ == "__main__":
    sys.exit(main())
