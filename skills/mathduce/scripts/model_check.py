#!/usr/bin/env python3
"""model_check.py — 深度学习训练产物复现校验（CC-2）

校验 adapter / 权重 / checkpoint 等训练产物可被加载且 SHA-256 与
state/frozen_results.json 的 dl_artifacts（或 expected/model_checksums.txt）一致。
非深度学习赛题自动跳过（返回 0）。

返回码: 0 = 一致 / 跳过；1 = 不一致 / 加载失败
用法:
    python scripts/model_check.py [--root <dir>]
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


def tensor_hash(path):
    """优先按张量内容哈希（与框架/磁盘格式无关）；失败则退回文件字节哈希。"""
    try:
        from safetensors.torch import load_file
        import torch  # noqa: F401
        tensors = load_file(str(path))
        h = hashlib.sha256()
        for k in sorted(tensors.keys()):
            h.update(k.encode("utf-8"))
            h.update(tensors[k].cpu().numpy().tobytes())
        return h.hexdigest()
    except Exception:
        pass
    try:
        import torch
        sd = torch.load(str(path), map_location="cpu")
        h = hashlib.sha256()
        if isinstance(sd, dict):
            for k in sorted(sd.keys()):
                h.update(k.encode("utf-8"))
                v = sd[k]
                h.update(v.cpu().numpy().tobytes() if hasattr(v, "cpu") else bytes(str(v), "utf-8"))
            return h.hexdigest()
    except Exception:
        pass
    return sha256_file(path)


def main():
    ap = argparse.ArgumentParser(description="训练产物复现校验（CC-2）")
    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = _find_root(args.root)

    fr = root / "state" / "frozen_results.json"
    train = root / "code" / "train_distill.py"
    # 非 DL 赛题豁免
    if not train.exists():
        if fr.exists():
            try:
                obj = json.loads(fr.read_text(encoding="utf-8"))
                if "dl_artifacts" not in obj:
                    print("[SKIP] 未检测到深度学习训练脚本与 dl_artifacts，CC-2 豁免")
                    return 0
            except Exception:
                pass
        else:
            print("[SKIP] 无训练脚本，CC-2 豁免")
            return 0

    expected = root / "expected" / "model_checksums.txt"
    if not expected.exists():
        print(f"[FAIL] 缺少 expected/model_checksums.txt: {expected}")
        return 1

    # 读取期望哈希：格式 <相对路径>\t<sha256>，路径相对项目根
    exp = {}
    for line in expected.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            exp[parts[0]] = parts[1].lower()

    ok = True
    for rel, want in exp.items():
        fp = root / rel
        if not fp.exists():
            print(f"[FAIL] 训练产物缺失: {rel}")
            ok = False
            continue
        got = tensor_hash(fp).lower()
        match = got == want
        print(f"[{'PASS' if match else 'FAIL'}] {rel}: {got[:16]} vs {want[:16]}")
        if not match:
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
