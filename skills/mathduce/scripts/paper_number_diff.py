#!/usr/bin/env python3
"""paper_number_diff.py — 论文数值双向子集比对

校验: 论文数值集合 ⊆ 复算数值集合 且 复算数值集合 ⊆ 论文数值集合
返回码: 0 = PASS, 1 = FAIL
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TEX = ROOT / "paper" / "main.tex"
FROZEN = ROOT / "state" / "frozen_results.json"
PATTERN = r"\d+\.\d+|\d+%"


def collect_numbers(obj):
    """递归收集冻结清单中的全部数值（规范化为 %g）"""
    out = set()

    def walk(x):
        if isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
        elif isinstance(x, bool):
            return
        elif isinstance(x, (int, float)):
            out.add(f"{x:g}")

    walk(obj)
    return out


def main():
    import argparse
    argparse.ArgumentParser(
        description="paper_number_diff.py — 论文数值双向子集比对（论文 ⊆ 复算 且 复算 ⊆ 论文）"
    ).parse_known_args()
    try:
        obj = json.loads(FROZEN.read_text(encoding="utf-8"))
        txt = TEX.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[FAIL] 读取失败: {e}")
        return 1

    frozen = collect_numbers(obj)
    paper = set(re.findall(PATTERN, txt))
    only_paper = paper - frozen
    only_frozen = frozen - paper
    ok = not only_paper and not only_frozen
    print(f"[{'PASS' if ok else 'FAIL'}] 论文数值 {len(paper)} 项 / 复算数值 {len(frozen)} 项")
    if only_paper:
        print(f"  仅论文出现: {sorted(only_paper)[:10]}")
    if only_frozen:
        print(f"  仅复算出现: {sorted(only_frozen)[:10]}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
