#!/usr/bin/env python3
"""claim_evidence_check.py — 论文数值→证据可追溯核验（CC-3）

提取 paper/main.tex 中的数值 token，逐条核对是否能在
state/frozen_results.json 的复算数值集中找到支撑。
任何论文数值无代码/计算证据支撑即标「AI 臆造嫌疑」并判失败。

返回码: 0 = 全部数值有证据支撑；1 = 存在无支撑数值
用法:
    python scripts/claim_evidence_check.py [--root <dir>]
"""
import argparse
import json
import re
import sys
from pathlib import Path

NUM_PAT = re.compile(r"\d+\.\d+|\d+%")


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


def collect_numbers(obj):
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
    ap = argparse.ArgumentParser(description="论文数值→证据可追溯核验（CC-3）")
    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = _find_root(args.root)

    fr = root / "state" / "frozen_results.json"
    tex = root / "paper" / "main.tex"
    if not fr.exists():
        print(f"[FAIL] 缺少 {fr}")
        return 1
    if not tex.exists():
        print(f"[FAIL] 缺少 {tex}")
        return 1

    try:
        obj = json.loads(fr.read_text(encoding="utf-8"))
        txt = tex.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[FAIL] 读取失败: {e}")
        return 1

    frozen = collect_numbers(obj)
    paper = set(NUM_PAT.findall(txt))
    unsupported = sorted(paper - frozen)

    print(f"[INFO] 论文数值 {len(paper)} 项 / 复算数值 {len(frozen)} 项")
    if not unsupported:
        print("[PASS] 全部论文数值均有 frozen_results 证据支撑")
        return 0
    print(f"[FAIL] 发现 {len(unsupported)} 个无证据支撑的数值（AI 臆造嫌疑）：")
    for n in unsupported[:20]:
        print(f"   - {n}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
