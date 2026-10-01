#!/usr/bin/env python3
# reproduce/reproduce.py — 跨平台一键复现（与 reproduce.sh 等价）
"""
跨平台复现编排器：纯 Windows（无 WSL/Git Bash）走 `python reproduce/reproduce.py`，
三平台行为与 reproduce.sh 一致（附录 AA §AA.4 / C.1）。

本脚本是 reproduce.sh 的超集：
  - 覆盖 reproduce.sh 的 5 步（冻结哈希→求解→图件→数值比对→编译论文）；
  - 额外覆盖 C.1 的 CC-2 训练产物复现（仅当项目含 DL 训练产物时启用）。

返回码:
    0 = REPRODUCE PASS（全部门禁通过，或可选步骤被安全跳过）
    1 = 任一强制闸门 FAIL（铁律：exit 1，绝不带病签发）

确定性编码环境（与 CI / Dockerfile / reproduce.sh 一致，附录 Z 铁律）：
    PYTHONUTF8=1 / PYTHONIOENCODING=utf-8 / LC_ALL=C.UTF-8
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 确定性编码环境（附录 Z 铁律：与 CI/Dockerfile/reproduce.sh 统一）
os.environ.setdefault("PYTHONUTF8", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("LC_ALL", "C.UTF-8")


def _fail(name: str, gate: str) -> bool:
    """记录一次闸门失败。"""
    print(f"[FAIL] {name} → {gate} FAIL", flush=True)
    return False


def _run(name: str, gate: str, argv, *, optional: bool = False) -> bool:
    """运行一步复现子命令。

    argv 形如 ["scripts/frozen_check.py", "--check"] 或 ["xelatex", ...]。
    - .py 入口统一走 sys.executable，并基于 ROOT 解析路径；
    - 非 .py 命令（如 xelatex）按 PATH 查找；
    - optional=True 时：文件/命令缺失即安全跳过（返回 True），不阻断整条链路；
    - optional=False 时：缺失或非零退出即判 FAIL（返回 False）。
    返回 True=PASS，False=FAIL。
    """
    print(f"[run] {name} ({gate})", flush=True)
    exe, *rest = argv
    is_py = exe.endswith(".py")
    path = ROOT / exe if is_py else exe

    if is_py and not path.exists():
        note = f"  跳过：文件不存在 {Path(exe)}"
        print(note if optional else f"[WARN] {note}", flush=True)
        return True if optional else _fail(name, gate)

    if is_py:
        cmd = [sys.executable, str(path)] + rest
    else:
        if shutil.which(exe) is None:
            note = f"  跳过：命令不可用 {exe}"
            print(note if optional else f"[WARN] {note}", flush=True)
            return True if optional else _fail(name, gate)
        cmd = [exe, *rest]

    sys.stdout.flush()
    try:
        rc = subprocess.run(cmd, cwd=str(ROOT), encoding="utf-8", bufsize=1).returncode
    except FileNotFoundError:
        return True if optional else _fail(name, gate)

    if rc != 0:
        return _fail(name, gate)
    return True


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(
        prog="reproduce.py",
        description=(
            "mathduce 跨平台一键复现编排器（与 reproduce.sh 等价）。\n"
            "依次执行 CB-7 冻结哈希 → CB-6 重跑求解 → CB-8 图件复现 → "
            "CB-10 数值比对 →（可选）CC-2 训练产物复现 / 论文编译。\n"
            "返回码 0=PASS（或可选步骤安全跳过），1=任一强制闸门 FAIL。"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--version", action="version", version="reproduce.py (mathduce v1.4.1)"
    )
    parser.parse_known_args()

    # 0) 环境预检（preflight，仅提示，不阻断整条链路）
    #    在任何重算前先跑 env_doctor，把最常见的阻断项一次性列出，
    #    让「所有情况都能被定位与解决」——失败也不影响后续强制闸门。
    print("[run] 环境预检 (ENV / preflight)", flush=True)
    try:
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "env_doctor.py")],
            cwd=str(ROOT), encoding="utf-8", bufsize=1,
        )
    except Exception as e:  # 极端情况下医生脚本自身异常也不应阻断复现
        print(f"[WARN] 预检脚本未执行: {e}", flush=True)

    ok = True

    # 1) CB-7 冻结清单哈希 + 必填项机检（复现前置铁律）
    ok &= _run("冻结清单哈希", "CB-7", ["scripts/frozen_check.py", "--check"])

    # 2) CB-6 重跑求解（复现核心，缺此即无复现可言）
    ok &= _run("重跑求解", "CB-6", ["code/solve_main.py"])

    # 3) CB-8 重生成图件
    ok &= _run("图件复现", "CB-8", ["code/make_figs.py"])

    # 4) CB-10 论文数值双向比对
    ok &= _run("论文数值比对", "CB-10", ["scripts/paper_number_diff.py"])

    # 5) CC-2 训练产物复现（仅当项目确含 DL 训练产物时启用）
    train_py = ROOT / "code" / "train_distill.py"
    checksum = ROOT / "expected" / "model_checksums.txt"
    if train_py.exists() or checksum.exists():
        if train_py.exists():
            ok &= _run("训练蒸馏模型", "CC-2", ["code/train_distill.py"])
        # model_check.py 内部对非 DL 赛题 / 无 manifest 自动跳过（返回 0）
        ok &= _run("训练产物哈希校验", "CC-2", ["scripts/model_check.py"])
    else:
        print("[skip] CC-2 训练产物复现：未检测到 DL 训练产物，跳过", flush=True)

    # 6) CB-10 编译论文（xelatex 缺失则安全跳过，不阻断纯数值复现）
    main_tex = ROOT / "paper" / "main.tex"
    if shutil.which("xelatex") and main_tex.exists():
        ok &= _run(
            "编译论文",
            "CB-10",
            ["xelatex", "-interaction=nonstopmode", str(main_tex)],
            optional=True,
        )
    else:
        print("[skip] CB-10 论文编译：xelatex 不可用或 paper/main.tex 缺失，跳过", flush=True)

    if ok:
        print("REPRODUCE: PASS", flush=True)
        return 0
    print("REPRODUCE: FAIL", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
