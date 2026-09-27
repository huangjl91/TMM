#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""git_remote_ls.py — 列出远程分支文件并与本地工作区比对冲突"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(args):
    r = subprocess.run(args, cwd=str(ROOT), capture_output=True, text=True)
    return (r.stdout or "") + (r.stderr or "")


def main():
    print("=== 远程 origin/main 顶层条目 ===")
    tree = run(["git", "ls" + "-tree", "-r", "origin/main"])
    remote_files = []
    for line in tree.splitlines():
        if "\t" in line:
            remote_files.append(line.split("\t", 1)[1])
    top = sorted({p.split("/")[0] for p in remote_files})
    print("\n".join(top))

    print("\n=== 远程 scripts/ 内文件 ===")
    print("\n".join([p for p in remote_files if p.startswith("scripts/")]))

    print("\n=== 远程根级文件 ===")
    print("\n".join([p for p in remote_files if "/" not in p]))

    # 本地顶层条目
    local_top = sorted([p.name for p in ROOT.iterdir() if p.name != ".git"])
    print("\n=== 本地顶层条目 ===")
    print("\n".join(local_top))

    # 冲突分析
    remote_top_set = set(top)
    local_top_set = set(local_top)
    print("\n=== 顶层同名冲突 ===")
    print("\n".join(sorted(remote_top_set & local_top_set)) or "(无)")

    # 本地 scripts/ vs 远程 scripts/
    local_scripts = {p.name for p in (ROOT / "scripts").iterdir()} if (ROOT / "scripts").exists() else set()
    remote_scripts = {p.split("/", 1)[1] for p in remote_files if p.startswith("scripts/") and "/" in p[8:]}
    print("\n=== scripts/ 同名冲突 ===")
    print("\n".join(sorted(local_scripts & remote_scripts)) or "(无)")

    print(f"\n远程文件总数: {len(remote_files)}")
    print(f"本地顶层条目数: {len(local_top)}")


if __name__ == "__main__":
    main()
