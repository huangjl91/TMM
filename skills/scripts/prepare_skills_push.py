#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""prepare_skills_push.py — 把 skill 库复制进 TMM 克隆的 skills/ 子目录（不改远程）"""
import shutil
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent          # math/
CLONE = SRC / "TMM"                                    # TMM 克隆（= origin/main）
DST = CLONE / "skills"

# 排除项：嵌套仓库、工作数据、缓存
EXCLUDE = {"TMM", ".workbuddy", ".git", "node_modules", "__pycache__", ".DS_Store",
           ".venv", "venv", "dist", "build"}


def main():
    if not (CLONE / ".git").exists():
        print(f"[FAIL] 克隆目录不存在或非 git 仓库: {CLONE}")
        return

    DST.mkdir(parents=True, exist_ok=True)
    n = 0
    for item in sorted(SRC.iterdir()):
        if item.name in EXCLUDE:
            continue
        target = DST / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns(*EXCLUDE))
            print(f"[DIR ] {item.name}/ -> skills/{item.name}/")
        else:
            shutil.copy2(item, target)
            print(f"[FILE] {item.name} -> skills/{item.name}")
        n += 1
    print(f"\n共复制 {n} 个顶层条目到 {DST}")


if __name__ == "__main__":
    main()
