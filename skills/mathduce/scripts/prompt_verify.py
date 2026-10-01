#!/usr/bin/env python3
"""prompt_verify.py — AI 辅助推导的 prompt 工件哈希固化与一致性校验（附录 AE）

对 prompts/*.md 计算 SHA-256；若 expected/prompt_hashes.txt 不存在则生成之，
否则逐文件比对。同时核对 frozen_results.json 的 llm_registry.prompt_sha256
是否指向已登记的 prompt 工件。

返回码: 0 = 一致 / 已生成 / 无 prompts 跳过；1 = 哈希不一致 / 缺失
用法:
    python scripts/prompt_verify.py [--root <dir>]
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
    ap = argparse.ArgumentParser(description="prompt 工件哈希固化与校验（附录 AE）")
    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = _find_root(args.root)

    prompts_dir = root / "prompts"
    expected = root / "expected" / "prompt_hashes.txt"

    if not prompts_dir.exists():
        print("[SKIP] 无 prompts/ 目录，跳过 prompt 校验")
        return 0

    files = sorted(prompts_dir.glob("*.md"))
    actual = {f.name: sha256_file(f) for f in files}

    if not expected.exists():
        with expected.open("w", encoding="utf-8") as fh:
            for name, h in actual.items():
                fh.write(f"{name}\t{h}\n")
        print(f"[GEN] 已生成 {expected}（{len(actual)} 条）")
        return 0

    exp = {}
    for line in expected.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            exp[parts[0]] = parts[1].lower()

    ok = True
    for name, h in actual.items():
        if exp.get(name) != h:
            print(f"[FAIL] {name}: 哈希变更 {exp.get(name, '-')[:16]} -> {h[:16]}")
            ok = False
    for name in exp:
        if name not in actual:
            print(f"[FAIL] 缺失 prompt 文件: {name}")
            ok = False

    # 核对 llm_registry.prompt_sha256
    fr = root / "state" / "frozen_results.json"
    if fr.exists():
        try:
            obj = json.loads(fr.read_text(encoding="utf-8"))
            reg = obj.get("llm_registry", {})
            psha = reg.get("prompt_sha256") if isinstance(reg, dict) else None
            if psha and psha.lower() not in {h.lower() for h in actual.values()}:
                print(f"[FAIL] llm_registry.prompt_sha256 未匹配任何 prompts/ 工件")
                ok = False
        except Exception:
            pass

    if ok:
        print(f"[PASS] {len(actual)} 个 prompt 工件哈希一致")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
