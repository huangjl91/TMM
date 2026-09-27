#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""diag_fix.py — 诊断并修复 math 家族 SKILL.md 的文风 A 特征缺失"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def diag():
    print("=== 诊断 math 家族 SKILL.md ===")
    for f in sorted(ROOT.rglob("SKILL.md")):
        s = str(f)
        if ".git" in s or "node_modules" in s:
            continue
        d = f.parent.name.lower()
        is_math = any(k in d for k in ["decomp", "formulate", "solve", "visualize",
                                       "strategy", "paper", "master", "duce"])
        if not is_math:
            continue
        t = f.read_text(encoding="utf-8")
        print(f"{f.parent.name:28s} len={len(t):6d} "
              f"ascii={'Y' if '│' in t else 'N'} "
              f"iron={'Y' if '【铁律】' in t else 'N'} "
              f"trig={'Y' if '专用于' in t else 'N'}")


if __name__ == "__main__":
    diag()
