#!/usr/bin/env python3
"""data_check.py — 原始数据文件哈希校验（附录 AB A11）

读取 data/data_manifest.json（{文件名: {sha256, source}} 或 {文件名: sha256}），
对 data/ 下每个原始文件重算 SHA-256 并断言一致。无 manifest 时跳过（不视为失败）。

返回码: 0 = 一致 / 跳过；1 = 哈希不符 / 文件缺失
用法:
    python scripts/data_check.py [--root <dir>] [--manifest <path>]
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path


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


def main():
    ap = argparse.ArgumentParser(description="原始数据哈希校验（附录 AB A11）")
    ap.add_argument("--root", default=None)
    ap.add_argument("--manifest", default=None, help="默认 data/data_manifest.json")
    args = ap.parse_args()
    root = _find_root(args.root)
    manifest = Path(args.manifest) if args.manifest else (root / "data" / "data_manifest.json")

    if not manifest.exists():
        print(f"[SKIP] 无 {manifest}，跳过数据哈希校验")
        return 0

    try:
        m = json.loads(manifest.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[FAIL] manifest 解析失败: {e}")
        return 1

    if not isinstance(m, dict):
        print("[FAIL] manifest 顶层须为对象 {文件名: sha256 或 {sha256, source}}")
        return 1

    ok = True
    for name, meta in m.items():
        want = meta.get("sha256") if isinstance(meta, dict) else meta
        fp = root / "data" / name
        if not fp.exists():
            print(f"[FAIL] 缺失数据文件: {name}")
            ok = False
            continue
        got = sha256_file(fp)
        match = got.lower() == str(want).lower()
        print(f"[{'PASS' if match else 'FAIL'}] {name}: {got[:16]} vs {str(want)[:16]}")
        if not match:
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
