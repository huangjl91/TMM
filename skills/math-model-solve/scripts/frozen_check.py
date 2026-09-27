#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""frozen_check.py — state/frozen_results.json 冻结清单机检工具（仅标准库）。

用途:
    对 G3 阶段“唯一数值真相源” <project-root>/state/frozen_results.json 做三种模式检查:
      1) --verify-hash : 按哈希协议重算 SHA-256 并与文件内 hash_sha256 比对,
                         输出 HASH OK / HASH MISMATCH（退出码 0 / 1）;
      2) --list        : 表格列出全部 metrics / decisions
                         (id / label / value / unit / precision);
      2b) --check-required : 按 CANON §3.4 必填项机检（顶层 6 字段 / metrics 至少 1 条 /
                         metrics[].id 全文件唯一且与 decisions[].id 不撞号 /
                         sensitivity 同时含 p1 与 sp / 占位符已替换）;
      3) --tex <path>  : 扫描 LaTeX 正文数字与冻结数值的粗匹配（同一 precision 下）,
                         报告疑似不一致处 —— 宽松启发式，只作 warning，不影响退出码。

协议出处:
    math-model-solve/SKILL.md §1.2「哈希协议」（与 scripts/CANON.md §3.4 schema 一致）:
    对“除去 hash_sha256 字段本身后的规范化 JSON”
    （sort_keys=True, separators=(",", ":"), ensure_ascii=False）计算 SHA-256。
    校验时机: ① 冻结落盘后立即自校验 ② G6 终检时独立重算比对;
    不匹配 → 判定 CB-7 失败, 打回重新冻结。

用法:
    python scripts/frozen_check.py [--file state/frozen_results.json] \
        [--verify-hash] [--check-required] [--list] [--tex paper/main.tex]
    未给出任何模式参数时输出文件概要 (schema_version / frozen_at / 计数)。

退出码:
    0 = 通过（允许 --tex 产生 warning）
    1 = 哈希不匹配 或 必填项校验不合格（均触发 CB-7 打回）
    2 = 文件缺失 / JSON 非法 / 参数错误
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata

DEFAULT_FILE = "state/frozen_results.json"


# --------------------------------------------------------------------------
# 输出辅助
# --------------------------------------------------------------------------

def _setup_stream() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass


def _disp_width(text: str) -> int:
    """终端显示宽度（东亚全角字符按 2 列计），仅用于表格对齐。"""
    width = 0
    for ch in text:
        width += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
    return width


def _pad(text: str, width: int) -> str:
    return text + " " * max(0, width - _disp_width(text))


def _print_table(headers, rows) -> None:
    widths = [_disp_width(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], _disp_width(str(cell)))
    line = "  ".join(_pad(h, widths[i]) for i, h in enumerate(headers))
    print(line)
    print("-" * min(120, _disp_width(line)))
    for row in rows:
        print("  ".join(_pad(str(c), widths[i]) for i, c in enumerate(row)))


# --------------------------------------------------------------------------
# 加载与哈希
# --------------------------------------------------------------------------

def load_obj(path: str) -> dict:
    if not os.path.isfile(path):
        print("[ERROR] 文件不存在: %s" % path, file=sys.stderr)
        print("        路径基准为项目工作区根，可用 --file 显式指定。", file=sys.stderr)
        raise SystemExit(2)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            obj = json.load(fh)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        print("[ERROR] JSON 解析失败: %s" % exc, file=sys.stderr)
        raise SystemExit(2)
    if not isinstance(obj, dict):
        print("[ERROR] 顶层必须是 JSON 对象。", file=sys.stderr)
        raise SystemExit(2)
    return obj


def canonical_text(obj: dict) -> str:
    return json.dumps(
        {k: v for k, v in obj.items() if k != "hash_sha256"},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def computed_hash(obj: dict) -> str:
    return hashlib.sha256(canonical_text(obj).encode("utf-8")).hexdigest()


def verify_hash(obj: dict) -> int:
    stored = obj.get("hash_sha256")
    calc = computed_hash(obj)
    if not isinstance(stored, str) or not stored:
        print("HASH MISSING: 文件缺少 hash_sha256 字段（冻结时未回填）")
        print("calc   : %s" % calc)
        return 1
    print("stored : %s" % stored)
    print("calc   : %s" % calc)
    if calc == stored:
        print("HASH OK")
        return 0
    print("HASH MISMATCH")
    print("        → 触发 CB-7：先更新冻结清单并重算哈希，再级联更新论文/图件，严禁反向。")
    return 1


# --------------------------------------------------------------------------
# --check-required 必填项机检 (CANON §3.4 必填说明 / 占位符声明)
# --------------------------------------------------------------------------

REQUIRED_TOP_FIELDS = (
    "schema_version", "frozen_at", "hash_sha256",
    "metrics", "decisions", "figures",
)

PLACEHOLDER_VALUES = {
    "frozen_at": ("YYYY-MM-DDTHH:MM:SS",),
    "hash_sha256": ("<本文件规范化序列化后的 sha256>",),
}


def check_required(obj: dict) -> int:
    """必填项机检: 顶层 6 字段 / metrics 至少 1 条 / id 唯一不撞号 /
    sensitivity 同时含 p1 与 sp / 占位符已替换。

    返回 0 = 通过 (REQUIRED OK); 1 = 不合格 (触发 CB-7 打回)。
    """
    errors = []

    for key in REQUIRED_TOP_FIELDS:
        if key not in obj or obj[key] is None:
            errors.append("顶层缺必填字段 `%s`（顶层 6 字段: %s）"
                          % (key, ", ".join(REQUIRED_TOP_FIELDS)))

    for key, placeholders in PLACEHOLDER_VALUES.items():
        val = obj.get(key)
        if isinstance(val, str) and val.strip() in placeholders:
            errors.append("`%s` 仍为占位符 `%s`，禁止原样落盘" % (key, val))

    metrics = obj.get("metrics")
    decisions = obj.get("decisions")
    if not isinstance(metrics, list):
        errors.append("`metrics` 必须是数组")
        metrics = []
    elif not metrics:
        errors.append("`metrics` 至少 1 条（当前 0 条）")
    if not isinstance(decisions, list):
        errors.append("`decisions` 必须是数组")
        decisions = []

    seen = {}
    for kind, seq in (("metrics", metrics), ("decisions", decisions)):
        for i, entry in enumerate(seq):
            if not isinstance(entry, dict):
                errors.append("`%s[%d]` 必须是对象" % (kind, i))
                continue
            eid = entry.get("id")
            if not isinstance(eid, str) or not eid:
                errors.append("`%s[%d]` 缺 `id`" % (kind, i))
                continue
            if eid in seen:
                errors.append(
                    "`id` 撞号: `%s` 同时出现于 %s 与 `%s[%d]`"
                    "（metrics[].id 须全文件唯一，且与 decisions[].id 不得撞号）"
                    % (eid, seen[eid], kind, i))
            else:
                seen[eid] = "`%s[%d]`" % (kind, i)

    for i, metric in enumerate(metrics):
        if not isinstance(metric, dict):
            continue
        sens = metric.get("sensitivity")
        if sens is None:
            errors.append("`metrics[%d].sensitivity` 缺失（须含 `p1` 与 `sp` 两键）" % i)
            continue
        if not isinstance(sens, dict):
            errors.append("`metrics[%d].sensitivity` 必须是对象" % i)
            continue
        missing = [k for k in ("p1", "sp") if k not in sens]
        if missing:
            errors.append("`metrics[%d].sensitivity` 缺键 %s（`p1` 与 `sp` 缺一即不合格）"
                          % (i, "、".join("`%s`" % k for k in missing)))

    if not errors:
        print("REQUIRED OK（顶层 6 字段齐备 / metrics≥1 / id 唯一不撞号 / sensitivity 含 p1 与 sp）")
        return 0
    for err in errors:
        print("REQUIRED FAIL  %s" % err)
    print("        → 触发 CB-7：补齐必填项并重算哈希后重新冻结。")
    return 1


# --------------------------------------------------------------------------
# --list
# --------------------------------------------------------------------------

def _fmt_value(value, precision) -> str:
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        prec = int(precision) if isinstance(precision, int) else 0
        return "%.*f" % (prec, float(value))
    return str(value)


def list_rows(obj: dict) -> int:
    rows = []
    metrics = obj.get("metrics") or []
    decisions = obj.get("decisions") or []
    if not isinstance(metrics, list) or not isinstance(decisions, list):
        print("[ERROR] metrics / decisions 必须是数组。", file=sys.stderr)
        return 2
    for m in metrics:
        rows.append([
            "metric",
            str(m.get("id", "")),
            str(m.get("label", "-")),
            _fmt_value(m.get("value"), m.get("precision", 0)),
            str(m.get("unit", "-")),
            str(m.get("precision", "-")),
        ])
    for d in decisions:
        rows.append([
            "decision",
            str(d.get("id", "")),
            "-",
            _fmt_value(d.get("value"), d.get("precision", 0)),
            str(d.get("unit", "-")),
            str(d.get("precision", "-")),
        ])
    if not rows:
        print("metrics / decisions 均为空，冻结清单无条目。")
        return 0
    _print_table(["KIND", "ID", "LABEL", "VALUE", "UNIT", "PREC"], rows)
    print("")
    print("total: %d metrics, %d decisions" % (len(metrics), len(decisions)))
    return 0


# --------------------------------------------------------------------------
# --tex（宽松启发式，只 warning 不 fail）
# --------------------------------------------------------------------------

_NUM_RE = re.compile(r"[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")


def _strip_tex_comments(text: str) -> str:
    out = []
    for line in text.splitlines():
        cut = len(line)
        for i, ch in enumerate(line):
            if ch == "%" and (i == 0 or line[i - 1] != "\\"):
                cut = i
                break
        out.append(line[:cut])
    return "\n".join(out)


def _tokens(text: str):
    tokens = []
    for m in _NUM_RE.finditer(text):
        raw = m.group(0)
        try:
            tokens.append((raw, float(raw.replace(",", ""))))
        except ValueError:
            continue
    return tokens


def scan_tex(obj: dict, tex_path: str) -> int:
    if not os.path.isfile(tex_path):
        print("WARN  --tex 文件不存在，已跳过扫描: %s" % tex_path)
        return 0
    with open(tex_path, "r", encoding="utf-8", errors="replace") as fh:
        text = _strip_tex_comments(fh.read())
    tokens = _tokens(text)
    if not tokens:
        print("WARN  --tex 未在正文解析到任何数字，跳过匹配。")
        return 0

    items = []
    for kind in ("metrics", "decisions"):
        for entry in obj.get(kind) or []:
            if isinstance(entry, dict) and isinstance(entry.get("value"), (int, float)) \
                    and not isinstance(entry.get("value"), bool):
                items.append((kind, entry))

    # 每个条目按自身 precision 的"标准写法"；若某数字恰好等于另一条目的标准写法，
    # 则归属另一条目，不作为本条目的疑似不一致候选（减少误报）。
    fmt_of = {}
    for kind, entry in items:
        prec = entry.get("precision")
        prec = int(prec) if isinstance(prec, int) else 0
        fmt_of[id(entry)] = "%.*f" % (prec, float(entry["value"]))
    claimed = {f for f in fmt_of.values()}

    n_warn = 0
    n_note = 0
    seen = set()
    for kind, entry in items:
        value = float(entry["value"])
        prec = entry.get("precision")
        prec = int(prec) if isinstance(prec, int) else 0
        fmt = fmt_of[id(entry)]
        eid = entry.get("id", "?")
        if any(raw.replace(",", "") == fmt for raw, _ in tokens):
            continue
        # 容差: 1 个精度单位与 0.1% 相对量取大者（宽松启发式）
        tol = max(10.0 ** (-prec), 1e-3 * max(abs(value), 1.0))
        cands = sorted({raw for raw, val in tokens if abs(val - value) <= tol})
        cands = [c for c in cands
                 if c.replace(",", "") != fmt and c.replace(",", "") not in claimed]
        if cands:
            key = (eid, tuple(cands))
            if key in seen:
                continue
            seen.add(key)
            n_warn += 1
            print("WARN  %s/%s: 正文出现 %s，按 precision=%d 应写 %s（单位 %s）"
                  % (kind, eid, ", ".join(cands), prec, fmt, entry.get("unit", "-")))
        else:
            n_note += 1
            print("NOTE  %s/%s: 正文未检出（期望写法 %s）" % (kind, eid, fmt))

    print("")
    print("tex scan: %d warning(s), %d note(s) —— 仅提示，不计入退出码。" % (n_warn, n_note))
    return 0


# --------------------------------------------------------------------------
# 概要（无模式参数时）
# --------------------------------------------------------------------------

def summary(obj: dict, path: str) -> int:
    metrics = obj.get("metrics") or []
    decisions = obj.get("decisions") or []
    figures = obj.get("figures") or []
    print("file          : %s" % path)
    print("schema_version: %s" % obj.get("schema_version", "<missing>"))
    print("frozen_at     : %s" % obj.get("frozen_at", "<missing>"))
    print("hash_sha256   : %s" % obj.get("hash_sha256", "<missing>"))
    print("counts        : %d metrics, %d decisions, %d figures"
          % (len(metrics), len(decisions), len(figures)))
    print("")
    print("提示: 用 --verify-hash 校验哈希 / --check-required 校验必填项 / --list 列条目 "
          "/ --tex paper/main.tex 扫描正文。")
    return 0


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="frozen_check.py",
        description="state/frozen_results.json 冻结清单机检（协议出处: math-model-solve §1.2）",
    )
    parser.add_argument("--file", default=DEFAULT_FILE,
                        help="冻结清单路径（默认 %s，相对项目工作区根）" % DEFAULT_FILE)
    parser.add_argument("--verify-hash", action="store_true",
                        help="按协议重算 SHA-256 并比对，输出 HASH OK / HASH MISMATCH")
    parser.add_argument("--check-required", action="store_true",
                        help="按 CANON §3.4 校验必填项（顶层 6 字段 / metrics 至少 1 条 / "
                             "id 唯一不撞号 / sensitivity 含 p1 与 sp / 占位符已替换）")
    parser.add_argument("--list", dest="do_list", action="store_true",
                        help="表格列出全部 metrics / decisions")
    parser.add_argument("--tex", default=None, metavar="PATH",
                        help="扫描 LaTeX 正文数字与冻结值的粗匹配（仅 warning）")
    return parser


def main(argv=None) -> int:
    _setup_stream()
    args = build_parser().parse_args(argv)
    obj = load_obj(args.file)

    requested = args.verify_hash or args.check_required or args.do_list or bool(args.tex)
    rc = 0

    if not requested:
        return summary(obj, args.file)

    if args.check_required:
        rc = max(rc, check_required(obj))
        print("")

    if args.verify_hash:
        rc = verify_hash(obj)
        print("")

    if args.do_list:
        list_rc = list_rows(obj)
        if list_rc:
            return list_rc
        print("")

    if args.tex:
        scan_tex(obj, args.tex)

    return rc


if __name__ == "__main__":
    sys.exit(main())
