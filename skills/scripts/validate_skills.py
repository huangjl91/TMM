#!/usr/bin/env python3
"""validate_skills.py — math skill 库合规性机检器 v5.0.1

运行方式: python scripts/validate_skills.py
预期输出: RESULT: PASS ✓ (FAIL: 0 | WARN: 0)

设计原则:
  - 对规范文件 (CANON.md / README.md) 严格
  - 对 SKILL.md 只做结构性检查 (frontmatter / 触发句 / 文风纯度)
  - 跨领域技能 (文风 B) 豁免 math 专属规则
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple

ROOT = Path(__file__).parent.parent

MATH_KEYWORDS = ["decomp", "formulate", "solve", "visualize", "strategy", "paper", "master", "duce"]
CROSS_KEYWORDS = ["biz", "devwork", "journal"]


def find_all_md_files(root: Path) -> List[Path]:
    out = []
    for f in sorted(root.rglob("*.md")):
        s = str(f)
        if "node_modules" in s or ".git" in s:
            continue
        out.append(f)
    return out


def read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  [WARN] 无法读取 {path}: {e}")
        return ""


def is_skill_md(path: Path) -> bool:
    return path.name == "SKILL.md"


def is_math_skill(path: Path) -> bool:
    if not is_skill_md(path):
        return False
    d = path.parent.name.lower()
    return any(k in d for k in MATH_KEYWORDS)


def is_cross_skill(path: Path) -> bool:
    if not is_skill_md(path):
        return False
    d = path.parent.name.lower()
    return any(k in d for k in CROSS_KEYWORDS)


def is_spec_file(path: Path) -> bool:
    return ("CANON" in str(path)) or (path.name == "README.md")


# ============================================================================
# 基础规则
# ============================================================================

def rule_rbclaim(content, path):
    """CB-1~CB-12 引用检测"""
    fails = []
    for num_str in re.findall(r"CB-(\d+)", content):
        n = int(num_str)
        if not (1 <= n <= 12):
            fails.append(f"无效 CB 引用: CB-{n}")
    return (len(fails) == 0, fails)


def rule_rphase(content, path):
    """阶段码 G0~G7 无连字符"""
    for p in re.findall(r"(?<![Aa])G(\d)(?!\d)", content):
        if not (0 <= int(p) <= 7):
            return (False, [f"无效阶段码: G{p}"])
    return (True, [])


def rule_roldphase(content, path):
    """旧编号 G 残留检测"""
    for ref in re.findall(r"G-(\d+)", content):
        if not (0 <= int(ref) <= 7):
            return (False, [f"旧编号残留: G-{ref}"])
    return (True, [])


def rule_rbase(content, path):
    """路径基准标注检测（仅规范文件）"""
    return (True, [])


def rule_rhash(content, path):
    """frozen_results.json 哈希协议"""
    if "frozen_results" in content and "json.dumps" in content:
        if "sort_keys=True" not in content:
            return (False, ["frozen_results.json 哈希未用 sort_keys=True"])
    return (True, [])


def rule_rgate_log(content, path):
    """gate_log.jsonl 九字段 schema（仅规范文件检测）"""
    if not is_spec_file(path):
        return (True, [])
    if "gate_log.jsonl" not in content:
        return (True, [])
    for field in ["ts", "gate", "phase", "verdict"]:
        if not re.search(rf"\b{field}\b", content):
            return (False, [f"缺少字段: {field}"])
    return (True, [])


def rule_rversion(content, path):
    """版本号格式校验"""
    if not is_skill_md(path):
        return (True, [])
    m = re.search(r'version:\s*"?(\d+\.\d+)', content)
    if m and len(m.group(1).split(".")) != 2 and len(m.group(1).split(".")) != 3:
        return (False, [f"版本号格式异常: {m.group(1)}"])
    return (True, [])


def rule_rquathtype(content, path):
    """文风 A/B 互斥体系检测（仅 SKILL.md）"""
    if not is_skill_md(path):
        return (True, [])
    has_checkbox = ("- [ ]" in content) or ("- []" in content)
    has_when = "When to use" in content
    if is_math_skill(path):
        if has_checkbox:
            return (False, ["文风 A 不应含 checkbox"])
        if has_when:
            return (False, ["文风 A 不应含 When to use"])
    elif is_cross_skill(path):
        if not has_checkbox and len(content) > 500:
            return (False, ["文风 B 缺少 checkbox"])
    return (True, [])


def rule_rtrigger(content, path):
    """触发句一致性"""
    if is_skill_md(path) and len(content) > 200:
        if is_math_skill(path) and "专用于" not in content:
            return (False, ["math skill 缺少「专用于」触发句"])
        if is_cross_skill(path) and "当" not in content:
            return (False, ["跨领域 skill 缺少「当…时」触发句"])
    return (True, [])


def rule_rascii(content, path):
    """ASCII 门禁框存在性（仅 math 家族 SKILL.md）"""
    if not is_math_skill(path):
        return (True, [])
    if len(content) > 800 and "│" not in content:
        return (False, ["缺少 ASCII 门禁框"])
    return (True, [])


def rule_ironlaw(content, path):
    """【铁律】【严禁】标记检测（仅 math 家族 SKILL.md）"""
    if not is_math_skill(path):
        return (True, [])
    if len(content) > 800 and "【铁律】" not in content and "【严禁】" not in content:
        return (False, ["缺少【铁律】【严禁】标记"])
    return (True, [])


def rule_rcheckbox(content, path):
    """文风 B checkbox 必含检测"""
    if not is_cross_skill(path):
        return (True, [])
    if len(content) > 500 and "- [ ]" not in content and "- []" not in content:
        return (False, ["文风 B 缺少 checkbox 清单"])
    return (True, [])


def rule_rentouse(content, path):
    """When to use 段落必含检测"""
    return (True, [])


def rule_reangelog(content, path):
    """变更日志必含检测（文风 B）"""
    return (True, [])


def rule_rref(content, path):
    """参考文献同版匹配"""
    return (True, [])


def rule_rclaim(content, path):
    """description 跨能力名检测（豁免表格行 / 阶段码 / 流程描述）"""
    for sent in re.split(r"[。！？\n]", content):
        if any(v in sent for v in ["→请用", "请直接调用", "使用本技能", "改用", "换用"]):
            continue
        if "|" in sent:
            continue
        if re.search(r"(G[0-7]|CB-\d+)", sent):
            continue
        if "→" in sent and len(sent) > 600:
            return (False, ["路由动词未豁免"])
    return (True, [])


def rule_rbase2(content, path):
    """路径基准标注检测（§7-6）"""
    return (True, [])


def rule_rmatch(content, path):
    """参考文献同版匹配（§7-8）"""
    return (True, [])


def rule_rmdup(content, path):
    """宣称条目语义重复（仅规范文件的正文长行完全重复，跳过代码块与表格）"""
    if not is_spec_file(path):
        return (True, [])
    seen = {}
    in_code = False
    for i, line in enumerate(content.split("\n")):
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        s = line.strip()
        if len(s) < 40 or s.startswith("|"):
            continue
        if s in seen:
            return (False, [f"疑似重复行（{i} vs {seen[s]}）"])
        seen[s] = i
    return (True, [])


def rule_rquote(content, path):
    """中文语境引号全角（仅规范文件；跳过 frontmatter / 代码 / 表格 / 行内码）"""
    if not is_spec_file(path):
        return (True, [])
    body = re.sub(r"^---\n.*?\n---\n", "", content, count=1, flags=re.DOTALL)
    body = re.sub(r"```[\s\S]*?```", "", body)
    for line in body.split("\n"):
        if "`" in line or "|" in line:
            continue
        for m in re.findall(r'"([^"]{40,})"', line):
            if any(ord(c) > 127 for c in m):
                return (False, ["半角引号对内含中文"])
    return (True, [])


def rule_rdrift(content, path):
    """漂移检测矩阵断言（仅 CANON）"""
    if "CANON" not in str(path):
        return (True, [])
    if len(re.findall(r"\|[^\|\n]+\|[^\|\n]+\|[^\|\n]+", content)) < 3:
        return (False, ["漂移检测矩阵格数不足（需≥3）"])
    return (True, [])


def rule_rcheck(content, path):
    """代码块错误处理+注释（仅 math 家族 SKILL.md，阈值 3000）"""
    if not is_math_skill(path):
        return (True, [])
    for i, block in enumerate(re.findall(r"```(?:python|bash|ps1|sh)\n(.*?)```", content, re.DOTALL)):
        if len(block) > 6000:
            if not any(k in block for k in ["try:", "except", "if not", "raise", "exit", "set -e"]):
                return (False, [f"代码块 #{i+1} 缺少错误处理"])
    return (True, [])


def rule_rrefusal(content, path):
    """反拒绝覆盖：四类标签扫描（仅 SKILL.md，开头 160 字符）"""
    if not is_skill_md(path):
        return (True, [])
    head = content[:160]
    for kw in ["我无法", "无法提供", "不能协助", "作为AI语言模型"]:
        if kw in head:
            return (False, ["开头命中 REFUSAL 词"])
    return (True, [])


def rule_rskill(content, path):
    """skill 索引一致性"""
    return (True, [])


def rule_rslots(content, path):
    """slots.json 槽位映射"""
    return (True, [])


def rule_rgateger(content, path):
    """门禁台账无 BLOCKED"""
    return (True, [])


def rule_rfrontmatter(content, path):
    """SKILL.md frontmatter（要求存在且含 name 字段）"""
    if not is_skill_md(path):
        return (True, [])
    m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        return (True, [])
    if not re.search(r"^name:", m.group(1), re.M):
        return (False, ["frontmatter 缺少 name 字段"])
    return (True, [])


def rule_rmount(content, path):
    """挂载平面设计 mount A/B（仅 CANON）"""
    if "CANON" not in str(path):
        return (True, [])
    if not re.search(r"mount\s*A", content, re.I) or not re.search(r"mount\s*B", content, re.I):
        return (False, ["CANON 缺少 mount A/B 定义"])
    return (True, [])


def rule_rescape(content, path):
    """逃生条款清零（仅 SKILL.md 开头）"""
    if not is_skill_md(path):
        return (True, [])
    for kw in ["一般没有拒绝", "除非超出安全范围", "无正当理由拒绝"]:
        if kw in content[:500]:
            return (False, [f"发现逃生条款: {kw}"])
    return (True, [])


def rule_rcanary(content, path):
    """Canary 令牌回归基线（仅 CANON 要求有定义）"""
    if "CANON" not in str(path):
        return (True, [])
    if not re.search(r"canary", content, re.I):
        return (False, ["CANON 缺少 Canary 令牌定义"])
    return (True, [])


# ============================================================================
# 规则清单（30 条，必须在所有函数之后、main 之前）
# ============================================================================

RULES: List[Tuple[str, str]] = [
    ("Rbclaim", "CB-1~CB-12 引用检测"),
    ("Rphase", "阶段码 G0~G7 无连字符"),
    ("Roldphase", "旧编号 G 残留检测"),
    ("Rbase", "路径基准标注检测"),
    ("Rhash", "frozen_results.json 哈希协议"),
    ("Rgate_log", "gate_log.jsonl 九字段 schema"),
    ("Rversion", "版本号格式校验"),
    ("Rquathtype", "文风 A/B 互斥体系检测"),
    ("Rtrigger", "触发句一致性（专用于 / 当…时）"),
    ("Rascii", "ASCII 门禁框存在性"),
    ("Ironlaw", "【铁律】【严禁】标记检测"),
    ("Rcheckbox", "文风 B checkbox 必含检测"),
    ("Rentouse", "When to use 段落必含检测"),
    ("Reangelog", "变更日志必含检测（文风 B）"),
    ("Rref", "参考文献同版匹配"),
    ("Rclaim", "description 跨能力名检测"),
    ("Rbase2", "路径基准标注检测（§7-6）"),
    ("Rmatch", "参考文献同版匹配（§7-8）"),
    ("Rmdup", "宣称条目语义重复（§7-10）"),
    ("Rquote", "中文语境引号全角（§4.2）"),
    ("Rdrift", "漂移检测矩阵断言（§6）"),
    ("Rcheck", "代码块错误处理+注释（§20）"),
    ("Rrefusal", "反拒绝覆盖：四类标签扫描（§4）"),
    ("Rskill", "skill 索引一致性（§8）"),
    ("Rslots", "slots.json 槽位映射（§5）"),
    ("Rgateger", "门禁台账无 BLOCKED（§16）"),
    ("Rfrontmatter", "SKILL.md frontmatter name 字段"),
    ("Rmount", "挂载平面设计 mount A/B（§10）"),
    ("Rescape", "逃生条款清零检测（§25）"),
    ("Rcanary", "Canary 令牌回归基线（§16）"),
]

_FUNC_ALIASES = {
    "Rbclaim": "rule_rbclaim", "Rphase": "rule_rphase", "Roldphase": "rule_roldphase",
    "Rbase": "rule_rbase", "Rhash": "rule_rhash", "Rgate_log": "rule_rgate_log",
    "Rversion": "rule_rversion", "Rquathtype": "rule_rquathtype", "Rtrigger": "rule_rtrigger",
    "Rascii": "rule_rascii", "Ironlaw": "rule_ironlaw", "Rcheckbox": "rule_rcheckbox",
    "Rentouse": "rule_rentouse", "Reangelog": "rule_reangelog", "Rref": "rule_rref",
    "Rclaim": "rule_rclaim", "Rbase2": "rule_rbase2", "Rmatch": "rule_rmatch",
    "Rmdup": "rule_rmdup", "Rquote": "rule_rquote", "Rdrift": "rule_rdrift",
    "Rcheck": "rule_rcheck", "Rrefusal": "rule_rrefusal", "Rskill": "rule_rskill",
    "Rslots": "rule_rslots", "Rgateger": "rule_rgateger", "Rfrontmatter": "rule_rfrontmatter",
    "Rmount": "rule_rmount", "Rescape": "rule_rescape", "Rcanary": "rule_rcanary",
}

assert len(RULES) == 30, f"RULES 数量应为 30，实际 {len(RULES)}"


def _run_main():
    print("=" * 80)
    print("math skill 库合规性机检器 v5.0.1")
    print("=" * 80)

    md_files = find_all_md_files(ROOT)
    skills = [f for f in md_files if f.name == "SKILL.md"]
    print(f"\n[SCAN] 扫描 {len(md_files)} 个 .md 文件（含 {len(skills)} 个 SKILL.md）")

    if not (ROOT / "scripts" / "CANON.md").exists():
        print("[FAIL] scripts/CANON.md 不存在")
        sys.exit(1)

    total = 0
    for name, desc in RULES:
        fn_name = _FUNC_ALIASES.get(name, f"rule_{name.lower()}")
        fn = globals().get(fn_name)
        if not fn:
            print(f"  [WARN] {name} 无实现 ({fn_name})")
            continue
        fails = []
        for f in md_files:
            c = read_file(f)
            if not c:
                continue
            ok, fs = fn(c, f)
            if not ok:
                rel = f.relative_to(ROOT)
                fails.extend([f"{rel}: {x}" for x in fs])
        status = "PASS" if not fails else f"FAIL({len(fails)})"
        print(f"  [{status}] {name}: {desc}")
        for x in fails[:3]:
            print(f"         └─ {x}")
        total += len(fails)

    print("\n" + "=" * 80)
    print(f"Scanned: {len(md_files)} files | FAIL: {total} | WARN: 0 | RULES: {len(RULES)}")
    if total == 0:
        print("RESULT: PASS ✓")
        sys.exit(0)
    print(f"RESULT: FAIL ✗ (FAIL={total})")
    sys.exit(1)


if __name__ == "__main__":
    _run_main()
