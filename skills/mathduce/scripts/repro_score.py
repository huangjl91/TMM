#!/usr/bin/env python3
"""repro_score.py — 六维复现度评分卡生成器

读取 state/frozen_results.json 与项目制品，按附录 A 的六维定义计算评分，
写出 review/G6_复现度评分卡.md。对应门禁 CB-12（复现度评分卡）。

返回码: 0 = 评分 ≥ 70（报告已生成，可复现 / 部分可复现）
        1 = 评分 < 70（不可复现，熔断）
用法:
    python scripts/repro_score.py [--root <dir>] [--out <path>]
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

DIMS = [  # (名称, 满分)
    ("数据溯源度", 22),
    ("代码纯净度", 18),
    ("图件复用度", 18),
    ("论文数值一致度", 22),
    ("评审召回完成度", 10),
    ("统计严谨度", 10),
]

DEBUG_PAT = [r"\bprint\s*\(", r"\bTODO\b", r"\bFIXME\b", r"#\s*noqa"]
AI_TONE = ["我们可以看到", "值得注意的是", "显然", "易得", "不难"]
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


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def compute_hash(obj):
    payload = {k: v for k, v in obj.items() if k != "hash_sha256"}
    s = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


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


def score(root):
    res = {}

    # 1 数据溯源度
    fr = root / "state" / "frozen_results.json"
    if fr.exists():
        try:
            obj = json.loads(fr.read_text(encoding="utf-8"))
            hash_ok = str(obj.get("hash_sha256", "")) == compute_hash(obj)
            metrics = obj.get("metrics", [])
            n = len(metrics) if isinstance(metrics, list) else 0
            res["数据溯源度"] = 22 if (hash_ok and n >= 1) else (11 if hash_ok else 0)
        except Exception:
            res["数据溯源度"] = 0
    else:
        res["数据溯源度"] = 0

    # 2 代码纯净度
    code_dir = root / "code"
    if code_dir.exists():
        penalty = 0
        for py in code_dir.rglob("*.py"):
            try:
                txt = py.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for pat in DEBUG_PAT:
                if re.search(pat, txt):
                    penalty += 3
            for tone in AI_TONE:
                if tone in txt:
                    penalty += 3
        res["代码纯净度"] = max(0, 18 - penalty)
    else:
        res["代码纯净度"] = 0

    # 3 图件复用度
    figs = root / "figs"
    figs_repro = root / "figs_repro"
    if figs.exists() and list(figs.glob("fig_*.png")):
        if figs_repro.exists() and list(figs_repro.glob("fig_*.png")):
            res["图件复用度"] = 18
        else:
            res["图件复用度"] = 9
    else:
        res["图件复用度"] = 0

    # 4 论文数值一致度
    tex = root / "paper" / "main.tex"
    if fr.exists() and tex.exists():
        try:
            obj = json.loads(fr.read_text(encoding="utf-8"))
            frozen = collect_numbers(obj)
            paper = set(NUM_PAT.findall(tex.read_text(encoding="utf-8")))
            res["论文数值一致度"] = 22 if (not (paper - frozen) and not (frozen - paper)) else 0
        except Exception:
            res["论文数值一致度"] = 0
    else:
        res["论文数值一致度"] = 0

    # 5 评审召回完成度
    gl = root / "state" / "gate_log.jsonl"
    rep = root / "review" / "reproduce_report.md"
    if gl.exists() and sum(1 for _ in gl.open(encoding="utf-8")) >= 4:
        res["评审召回完成度"] = 10
    elif rep.exists():
        res["评审召回完成度"] = 5
    else:
        res["评审召回完成度"] = 0

    # 6 统计严谨度
    blob = ""
    if fr.exists():
        blob += fr.read_text(encoding="utf-8", errors="ignore")
    if tex.exists():
        blob += tex.read_text(encoding="utf-8", errors="ignore")
    hits = 0
    for kw in ["Sobol", "Morris", "总效应", "mean±std", "95%", "置信区间",
               "跨种子", "seed variance", "条件数", "κ", "condition"]:
        if kw.lower() in blob.lower():
            hits += 1
    res["统计严谨度"] = min(10, hits * 3)

    return res


def main():
    ap = argparse.ArgumentParser(description="六维复现度评分卡生成器")
    ap.add_argument("--root", default=None, help="项目根目录（默认自动探测）")
    ap.add_argument("--out", default=None, help="输出 markdown 路径")
    args = ap.parse_args()
    root = _find_root(args.root)
    out = Path(args.out) if args.out else (root / "review" / "G6_复现度评分卡.md")

    res = score(root)
    total = sum(res.values())
    verdict = "可复现" if total >= 90 else ("部分可复现" if total >= 70 else "不可复现（熔断）")

    lines = ["# 复现度评分卡（六维）", "",
             f"- 项目根: `{root}`", f"- 总评: **{total} / 100** — {verdict}", "",
             "| 维度 | 得分 | 满分 |", "|---|---|---|"]
    for name, full in DIMS:
        lines.append(f"| {name} | {res[name]} | {full} |")
    lines += ["", f"**判定**: {verdict}", ""]

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"[PASS] 评分卡已写出: {out}")
    print(f"[INFO] 总分 {total}/100 → {verdict}")
    for name, full in DIMS:
        print(f"  {name}: {res[name]}/{full}")
    return 0 if total >= 70 else 1


if __name__ == "__main__":
    sys.exit(main())
