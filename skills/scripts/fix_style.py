#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fix_style.py — 为 math 家族 SKILL.md 补齐文风 A 特征（ASCII 门禁框 + 【铁律】段）"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (关键词, 标题, 阶段, 铁律正文)
ROLE_BY_KW = [
    ("decomp",    "赛题解构引擎", "G1",    "出题人意图四问溯源，破除上帝视角，禁用元语言"),
    ("formulate", "机理建模引擎", "G2",    "第一性原理推导，量纲严谨，假设全生命周期闭环"),
    ("paper",     "论文排版引擎", "G5/G6", "法定八大结构，26–40 页受控，18 种 AI 腔调零容忍"),
    ("solve",     "数值求解引擎", "G3",    "结果绝对冻结，附录代码纯净化，边界断言不可逾越"),
    ("strategy",  "选题决议引擎", "G0/G7", "五维评分锁题，复盘闭环回写年迭代"),
    ("visualize", "可视化引擎",   "G4",    "顶刊级图件，DPI ≥ 300，双基准路径严禁混用"),
]

W = 62  # 框内宽度


def pad_display(text: str, width: int) -> str:
    disp = sum(2 if ord(c) > 127 else 1 for c in text)
    return text + " " * max(0, width - disp)


def make_box(dirname: str, title: str, phase: str, iron: str) -> str:
    line1 = f"{dirname} · {title}（{phase}）"
    line2 = f"铁律：{iron}"
    return (
        "```\n"
        "┌" + "─" * W + "┐\n"
        "│ " + pad_display(line1, W - 2) + " │\n"
        "├" + "─" * W + "┤\n"
        "│ " + pad_display(line2, W - 2) + " │\n"
        "└" + "─" * W + "┘\n"
        "```"
    )


def make_iron(title: str) -> str:
    return (
        "## 【铁律】核心禁令\n"
        "\n"
        f"- **【铁律】** 本技能（{title}）所有产物必须可追溯、可复算、可复现；"
        "任何无法回溯到源头的数字一律视为无效。\n"
        "- **【铁律】** 阶段收口处必须通过 `scripts/validate_skills.py` 机检，"
        "未通过不得进入下游阶段。\n"
        "- **【严禁】** 交付物中出现调试残留与 AI 解释口吻。\n"
        "- **【严禁】** 裸写相对路径；`<project>` 与 `<skill>` 两套基准严禁混用。"
    )


def match_role(dirname: str):
    for kw, title, phase, iron in ROLE_BY_KW:
        if kw in dirname.lower():
            return (title, phase, iron)
    return None


def fix_file(f: Path) -> bool:
    d = f.parent.name
    role = match_role(d)
    if not role:
        return False
    title, phase, iron = role
    t = f.read_text(encoding="utf-8")
    orig = t
    changed = False

    if "│" not in t:
        m = re.search(r"^# .+$", t, re.M)
        if m:
            t = t[:m.end()] + "\n\n" + make_box(d, title, phase, iron) + t[m.end():]
            changed = True

    if "【铁律】" not in t:
        block = make_iron(title)
        mbox = re.search(r"└─+┘\n```\n", t)
        if mbox:
            t = t[:mbox.end()] + "\n" + block + "\n" + t[mbox.end():]
        else:
            m = re.search(r"^# .+$", t, re.M)
            if m:
                t = t[:m.end()] + "\n\n" + block + t[m.end():]
        changed = True

    if changed and t != orig:
        f.write_text(t, encoding="utf-8")
        return True
    return False


def main():
    n = 0
    for f in sorted(ROOT.rglob("SKILL.md")):
        s = str(f)
        if ".git" in s or "node_modules" in s:
            continue
        if fix_file(f):
            print(f"[FIXED] {f.parent.name}")
            n += 1
    print(f"\n{n} file(s) fixed.")


if __name__ == "__main__":
    main()
