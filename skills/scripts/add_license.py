#!/usr/bin/env python3
"""add_license.py — 为所有缺少 license 字段的 SKILL.md 补 license: MIT"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    count = 0
    for f in sorted(ROOT.rglob("SKILL.md")):
        if "node_modules" in str(f) or ".git" in str(f):
            continue
        txt = f.read_text(encoding="utf-8")
        m = re.match(r"^---\n(.*?)\n---", txt, re.DOTALL)
        if not m:
            print(f"[NOM] {f.relative_to(ROOT)}")
            continue
        fm = m.group(1)
        if re.search(r"^license:", fm, re.M):
            print(f"[SKIP ] {f.relative_to(ROOT)}")
            continue
        # 在 name: 行之后插入 license: MIT
        if re.search(r"^name:", fm, re.M):
            new_fm = re.sub(r"(^name:[^\n]*\n)", r"\1license: MIT\n", fm, count=1, flags=re.M)
        else:
            new_fm = "license: MIT\n" + fm
        txt2 = "---\n" + new_fm + "\n---" + txt[m.end():]
        f.write_text(txt2, encoding="utf-8")
        print(f"[ADDED] {f.relative_to(ROOT)}")
        count += 1
    print(f"\nDone. {count} file(s) updated.")


if __name__ == "__main__":
    main()
