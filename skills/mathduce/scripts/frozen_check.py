#!/usr/bin/env python3
"""frozen_check.py — 冻结清单哈希校验 + 必填项机检

用法:
    python scripts/frozen_check.py            # 仅哈希校验
    python scripts/frozen_check.py --check    # 哈希 + 必填项机检
返回码:
    0 = PASS, 1 = FAIL
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
REQUIRED_TOP = ["version", "phase", "hash_sha256", "metrics", "decisions", "figures"]


def compute_hash(obj):
    """按唯一写法重算 SHA-256（hash_sha256 字段自身排除在输入外）"""
    payload = {k: v for k, v in obj.items() if k != "hash_sha256"}
    s = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def main():
    ap = argparse.ArgumentParser(description="冻结清单哈希校验")
    ap.add_argument("--check", action="store_true", help="同时做必填项机检")
    ap.add_argument("--file", default="state/frozen_results.json")
    args = ap.parse_args()

    f = ROOT / args.file
    if not f.exists():
        print(f"[FAIL] 文件不存在: {f}")
        return 1
    try:
        obj = json.loads(f.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[FAIL] JSON 解析失败: {e}")
        return 1

    stored = str(obj.get("hash_sha256", ""))
    calc = compute_hash(obj)
    ok = (stored == calc)
    print(f"[{'PASS' if ok else 'FAIL'}] 哈希 存储={stored[:16]} 重算={calc[:16]}")

    if args.check:
        for k in REQUIRED_TOP:
            if k not in obj:
                print(f"[FAIL] 缺少顶层字段: {k}")
                ok = False
        metrics = obj.get("metrics", [])
        if not isinstance(metrics, list) or len(metrics) < 1:
            print("[FAIL] metrics 至少需要 1 条")
            ok = False
        else:
            ids = [m.get("id") for m in metrics if isinstance(m, dict)]
            if len(ids) != len(set(ids)):
                print("[FAIL] metrics 的 id 存在撞号")
                ok = False
            for m in metrics:
                if not isinstance(m, dict):
                    continue
                sen = m.get("sensitivity", {})
                if "p1" not in sen or "sp" not in sen:
                    print(f"[FAIL] metric {m.get('id')} 的 sensitivity 缺 p1 或 sp")
                    ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
