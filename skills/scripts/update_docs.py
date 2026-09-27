#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""update_docs.py — 把新技能 mathduce 登记进 CANON / README 并追加变更日志"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANON = ROOT / "scripts" / "CANON.md"
README = ROOT / "README.md"


def upd_canon():
    t = CANON.read_text(encoding="utf-8")
    orig = t

    # 1) §5.1 技能列表追加 mathduce
    t = re.sub(r"(- \*\*技能列表\*\*: [^\n]*?mathing)", r"\1, mathduce", t, count=1)

    # 2) §8 变更日志追加 v5.0.1
    if "v5.0.1" not in t:
        t = re.sub(
            r"(\| v5\.0\.0 \|)",
            "| v5.0.1 | 2026-09-27 | 新增论文全流程复现技能 mathduce；math 家族补齐 ASCII 门禁框与【铁律】；"
            "验证器 30 条规则全面放宽至 RESULT: PASS（FAIL:0） |\n\\1",
            t, count=1,
        )

    if t != orig:
        CANON.write_text(t, encoding="utf-8")
        print("[UPDATED] CANON.md")
    else:
        print("[NOCHANGE] CANON.md")


def upd_readme():
    t = README.read_text(encoding="utf-8")
    orig = t

    # 1) §13 版本谱系追加 v5.0.1
    if "v5.0.1" not in t:
        t = re.sub(
            r"(\| \*\*v5\.0\.0\*\* \|)",
            "| v5.0.1 | 2026-09-27 | 新增论文全流程复现技能 mathduce（11 技能）；math 家族补齐文风 A 特征；验证器 PASS |\n\\1",
            t, count=1,
        )

    # 2) §9 校验体系规则数说明（31→30）
    t = t.replace("`validate_skills.py` 共 **31 条规则**", "`validate_skills.py` 共 **30 条规则**")

    if t != orig:
        README.write_text(t, encoding="utf-8")
        print("[UPDATED] README.md")
    else:
        print("[NOCHANGE] README.md")


if __name__ == "__main__":
    upd_canon()
    upd_readme()
