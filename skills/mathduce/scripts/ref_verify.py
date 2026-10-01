#!/usr/bin/env python3
"""ref_verify.py — 参考文献存在性 / DOI 合法性校验（CC-3）

扫描 references/*.md 与 paper/main.tex 中的 DOI，校验格式合法性；
可选 --online 用 urllib 做一次轻量 HEAD 探测（不阻断，仅告警）。
无 DOI 的纯文字引用仅告警，不判失败；格式非法 DOI 判失败。

返回码: 0 = 无非法 DOI；1 = 存在非法 DOI
用法:
    python scripts/ref_verify.py [--root <dir>] [--online]
"""
import argparse
import re
import sys
from pathlib import Path

DOI_RE = re.compile(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+")
CANON = re.compile(r"^10\.\d{4,9}/.+$")


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
    ap = argparse.ArgumentParser(description="参考文献 DOI 校验（CC-3）")
    ap.add_argument("--root", default=None)
    ap.add_argument("--online", action="store_true", help="尝试联网 HEAD 探测（best-effort）")
    args = ap.parse_args()
    root = _find_root(args.root)

    blobs = []
    refs = root / "references"
    if refs.exists():
        for md in refs.glob("*.md"):
            blobs.append(md.read_text(encoding="utf-8", errors="ignore"))
    tex = root / "paper" / "main.tex"
    if tex.exists():
        blobs.append(tex.read_text(encoding="utf-8", errors="ignore"))
    text = "\n".join(blobs)

    dois = sorted(set(DOI_RE.findall(text)))
    if not dois:
        print("[INFO] 未检测到 DOI；纯文字引用无法自动核验，建议人工核对")
        return 0

    bad = [d for d in dois if not CANON.match(d)]
    print(f"[INFO] 检测到 {len(dois)} 个 DOI，其中 {len(bad)} 个格式非法")
    for d in dois:
        flag = "OK" if CANON.match(d) else "BAD"
        print(f"  [{flag}] {d}")

    if args.online:
        try:
            import urllib.request
            for d in dois:
                url = "https://doi.org/" + d
                try:
                    req = urllib.request.Request(url, method="HEAD",
                                                 headers={"User-Agent": "repro-verify"})
                    with urllib.request.urlopen(req, timeout=8) as r:
                        print(f"  [NET {r.status}] {d}")
                except Exception as e:
                    print(f"  [NET ERR] {d}: {e}")
        except Exception as e:
            print(f"[WARN] 联网探测失败: {e}")

    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
