#!/usr/bin/env python3
"""tex_num_extract.py — 从 LaTeX 论文提取数值 token

输出: JSON 数组（去重排序）到 stdout
返回码: 0 = 成功, 1 = 失败
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TEX = ROOT / "paper" / "main.tex"
PATTERN = r"\d+\.\d+|\d+%"


def main():
    import argparse
    argparse.ArgumentParser(
        description="tex_num_extract.py — 从 LaTeX 论文提取数值 token（去重排序 JSON 到 stdout）"
    ).parse_known_args()
    if not TEX.exists():
        print(f"[FAIL] 文件不存在: {TEX}", file=sys.stderr)
        return 1
    try:
        txt = TEX.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[FAIL] 读取失败: {e}", file=sys.stderr)
        return 1
    nums = sorted(set(re.findall(PATTERN, txt)))
    print(json.dumps(nums, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
