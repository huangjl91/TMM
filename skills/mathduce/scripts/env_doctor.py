#!/usr/bin/env python3
"""env_doctor.py — 复现环境预检 / 诊疗（preflight diagnostic）

在跑 heavy 复现链（reproduce.py / reproduce.sh）之前，一次性扫描 13 类最常见阻断项，
逐项给出 [OK / WARN / FAIL] 与可执行的修复命令，并回指对应附录条目（R-/Q/AB/AA）。
只读诊断，不做任何破坏性修改；适合作为「确保所有情况都能解决」的第一道防线。

用法:
    python scripts/env_doctor.py            # 终端可读报告
    python scripts/env_doctor.py --json     # 机器可读 JSON 数组
返回码:
    0 = 无 FAIL（仅有 OK / WARN），可继续复现
    1 = 存在 FAIL（阻断项，须先修复后再跑复现链）
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

SEED_RE = re.compile(
    r"\b(np\.random\.(seed|default_rng|RandomState)|"
    r"random\.seed|torch\.manual_seed|tf\.random\.set_seed|"
    r"set\.seed|rng\(|RandomState|seed_worker|set_epoch|"
    r"PYTHONHASHSEED|check_random_state)\b"
)
ENCODING_RE = re.compile(r"encoding\s*=\s*[\"']utf-?8", re.IGNORECASE)
REQUIRED_TOP = ["version", "phase", "hash_sha256", "metrics"]


def read_text_safe(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return ""


def collect_py_files():
    files = []
    for base in ("code", "scripts"):
        d = ROOT / base
        if d.is_dir():
            files += list(d.rglob("*.py"))
    files += list(ROOT.glob("*.py"))
    # 去重
    seen, out = set(), []
    for f in files:
        k = str(f.resolve())
        if k not in seen:
            seen.add(k)
            out.append(f)
    return out


def check_python_version():
    import platform
    ver = platform.python_version()
    major_minor = tuple(int(x) for x in ver.split(".")[:2])
    if major_minor == (3, 11):
        return ("OK", f"Python {ver}（推荐 3.11.x，与 CI/Dockerfile 对齐，附录 O/AA）", "")
    if major_minor >= (3, 10):
        return ("WARN", f"Python {ver} 可用，但 CI/Dockerfile 锁定 3.11；跨次版本浮点序列化可能漂移（R-07）",
                "在 requirements.txt 固定 `python==3.11.*` 或用 reproduce/Dockerfile 复现")
    return ("FAIL", f"Python {ver} 过旧，可能触发 numpy/SDK 不兼容",
            "升级到 Python 3.11（附录 O/Dockerfile）")


def check_required_inputs():
    checks = [
        ("docs/G1_剖析卡.md", "G1 解构产物（§1.1）"),
        ("state/frozen_results.json", "唯一数值真相源（铁律/§1.1）"),
        ("paper/main.tex", "论文源文件（§1.1）"),
        ("requirements.txt", "冻结依赖（附录 AB）"),
    ]
    missing = [c for c, _ in checks if not (ROOT / c).exists()]
    optional = [
        ("code/solve_main.py", "主求解脚本（CB-6）"),
        ("code/make_figs.py", "图件生成脚本（CB-8）"),
        ("figs", "图件目录（CB-2）"),
    ]
    opt_missing = [c for c, _ in optional if not (ROOT / c).exists()]
    figs = list((ROOT / "figs").glob("fig_*.png")) if (ROOT / "figs").is_dir() else []
    if missing:
        return ("FAIL", f"缺失必需输入: {', '.join(missing)}",
                "补齐上述文件（见 §1.1 输入制品表）")
    notes = []
    if opt_missing:
        notes.append(f"可选脚本/目录缺失: {', '.join(opt_missing)}（非 DL/无图赛题可豁免，但 CB-6/CB-8 将 FAIL）")
    if "figs" not in opt_missing and not figs:
        notes.append("figs/ 存在但无 fig_*.png（命名须 fig_XX_desc.png，附录 R-11）")
    status = "OK" if not notes else "WARN"
    msg = "必需输入齐全" + ("" if not notes else "；" + "；".join(notes))
    return (status, msg, "补齐可选脚本或确认赛题类型豁免（§6）")


def check_frozen():
    f = ROOT / "state" / "frozen_results.json"
    if not f.exists():
        return ("WARN", "state/frozen_results.json 不存在（略过哈希校验）",
                "从 G3 重新生成冻结清单（matholve，§2.1）")
    try:
        obj = json.loads(read_text_safe(f))
    except Exception as e:
        return ("FAIL", f"frozen_results.json 解析失败: {e}",
                "修复 JSON 语法（R-01）")
    miss = [k for k in REQUIRED_TOP if k not in obj]
    if miss:
        return ("FAIL", f"frozen_results.json 缺顶层字段: {', '.join(miss)}",
                "补全字段（R-02 / §1.1）")
    # 哈希重算（与 frozen_check 同协议）
    import hashlib
    payload = {k: v for k, v in obj.items() if k != "hash_sha256"}
    calc = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    stored = str(obj.get("hash_sha256", ""))
    if calc != stored:
        return ("FAIL", f"哈希不一致 存储={stored[:16]} 重算={calc[:16]}",
                "统一 separators=(\",\",\":\")+ensure_ascii=False+NFC 归一（附录 Q / R-02~R-06）")
    return ("OK", "冻结清单哈希一致", "")


def check_requirements():
    f = ROOT / "requirements.txt"
    if not f.exists():
        return ("WARN", "requirements.txt 缺失，无法锁环境（附录 AB OP-1）",
                "用 `pip-compile --generate-hashes -o requirements.txt requirements.in` 生成")
    text = read_text_safe(f)
    lines = [l for l in text.splitlines() if l.strip() and not l.strip().startswith("#")]
    if not lines:
        return ("FAIL", "requirements.txt 为空", "填入顶层依赖")
    unpinned = [l for l in lines if "==" not in l and l.startswith((" ", "\t")) is False
                and not l.startswith("-") and "git+" not in l and "@" not in l and ">" not in l
                and "<" not in l]
    # 简化判断：含版本操作符才算 pin
    pinned = [l for l in lines if re.search(r"==\s*[^ ]", l)]
    hashes = len(re.findall(r"--hash=sha256:", text))
    notes = []
    if len(pinned) < len(lines) - len([l for l in lines if l.startswith(("-", "#"))]):
        notes.append("存在未锁定版本号的依赖（R-28 / 附录 G-5）")
    if hashes == 0:
        notes.append("缺少完整性哈希（附录 AB A1 / §5 红线 7）")
    if notes:
        return ("WARN", "依赖锁定不完整: " + "；".join(notes),
                "重新生成带哈希的冻结清单：`pip-compile --generate-hashes` 后 `pip install --require-hashes`")
    return ("OK", f"依赖已锁定（{len(pinned)} 项，含 {hashes} 条 --hash）", "")


def check_seeds():
    files = collect_py_files()
    hits = 0
    for f in files:
        if SEED_RE.search(read_text_safe(f)):
            hits += 1
    if hits == 0:
        return ("WARN", "在 code/ scripts/ 中未发现任何随机种子固定调用",
                "凡涉及随机的环节须显式 seed（np.random.seed / torch.manual_seed / set.seed），见附录 V / R-17")
    return ("OK", f"发现 {hits} 个文件含随机种子/确定性调用", "")


def check_gitattributes():
    f = ROOT / ".gitattributes"
    if not f.exists():
        return ("WARN", ".gitattributes 缺失，bash 脚本可能受 CRLF 破坏（R-32 / AA.4）",
                "添加 `*.sh text eol=lf` 与 `*.png binary`")
    text = read_text_safe(f)
    notes = []
    if "eol=lf" not in text and "text" not in text:
        notes.append("未强制 *.sh eol=lf")
    if "binary" not in text:
        notes.append("未标记二进制文件（PNG 等）")
    if notes:
        return ("WARN", " .gitattributes 不完整: " + "；".join(notes),
                "补充 `*.sh text eol=lf` 与 `*.png binary`（附录 AA.4 / R-32）")
    return ("OK", ".gitattributes 已配置行尾/二进制规则", "")


def check_data_manifest():
    d = ROOT / "data"
    if not d.is_dir():
        return (None, "", "")  # 沉默跳过（无数据目录）
    m = d / "data_manifest.json"
    if not m.exists():
        return ("WARN", "存在 data/ 但缺 data_manifest.json 哈希清单（R-59 / AB A11）",
                "生成 data_manifest.json（文件名→SHA-256→来源），脚本首步 assert 哈希")
    return ("OK", "data_manifest.json 存在", "")


def check_prompt_hashes():
    p = ROOT / "prompts"
    if not p.is_dir():
        return (None, "", "")
    h = ROOT / "expected" / "prompt_hashes.txt"
    if not h.exists():
        return ("WARN", "存在 prompts/ 但缺 expected/prompt_hashes.txt（附录 AE.2 / CC-3）",
                "用 scripts/prompt_verify.py 生成 prompt 哈希固化文件")
    return ("OK", "prompt 哈希已固化", "")


def check_encoding():
    files = collect_py_files()
    no_enc = 0
    for f in files:
        if "open(" in read_text_safe(f) and not ENCODING_RE.search(read_text_safe(f)):
            no_enc += 1
    if no_enc:
        return ("WARN", f"{no_enc} 个文件 open() 未显式 encoding='utf-8'（Windows 静默乱码风险，R-65/AA.1）",
                "统一 `open(..., encoding='utf-8')`")
    return ("OK", "脚本文件读写均显式 UTF-8", "")


def check_determinism_env():
    signals = []
    for rel in ("reproduce/Dockerfile", "reproduce/docker-compose.yml",
               ".github/workflows/reproduce.yml", "reproduce/reproduce.sh"):
        t = read_text_safe(ROOT / rel)
        if "PYTHONHASHSEED" in t:
            signals.append("PYTHONHASHSEED")
        if "OMP_NUM_THREADS" in t:
            signals.append("OMP_NUM_THREADS")
    if not signals:
        return ("WARN", "未发现 PYTHONHASHSEED / OMP_NUM_THREADS 固化（dict 迭代序 / BLAS 线程漂移，R-16/R-58/AA.3）",
                "在 Dockerfile/CI 固定 PYTHONHASHSEED=0 与 OMP_NUM_THREADS=1（附录 O / AA.3）")
    return ("OK", "确定性 ENV 已固化: " + ", ".join(sorted(set(signals))), "")


def check_bom_crlf():
    """R-86: 数据/源码含 BOM 或 CRLF（Windows 生成文件）致 pandas/正则解析错位"""
    targets = []
    for base in ("data", "code", "scripts", "paper"):
        d = ROOT / base
        if d.is_dir():
            targets += [p for p in d.rglob("*")
                        if p.suffix.lower() in (".csv", ".tsv", ".txt", ".py",
                                                ".tex", ".json", ".md")]
    targets += list(ROOT.glob("*.py"))
    bom = crlf = 0
    for p in targets:
        try:
            raw = p.read_bytes()
        except Exception:
            continue
        if raw.startswith(b"\xef\xbb\xbf"):
            bom += 1
        if b"\r\n" in raw:
            crlf += 1
    if bom == 0 and crlf == 0:
        return ("OK", "未发现 UTF-8 BOM / CRLF（Windows 生成文件常见陷阱，R-86）", "")
    notes = []
    if bom:
        notes.append(f"{bom} 个文件含 UTF-8 BOM")
    if crlf:
        notes.append(f"{crlf} 个文件含 CRLF 换行")
    return ("WARN", "；".join(notes) + "（解析易错位 / float() 易失败）",
            "用 `dos2unix` 去 CRLF；读取用 `encoding='utf-8-sig'` 兼容 BOM（R-86 / 附录 AA.1）")


def check_timezone_locale():
    """R-84: 容器/CI 时区与区域设置未固化致时间戳/排序/格式化漂移"""
    signals = set()
    for rel in ("reproduce/Dockerfile", "reproduce/docker-compose.yml",
               ".github/workflows/reproduce.yml", "reproduce/reproduce.sh", "Dockerfile"):
        t = read_text_safe(ROOT / rel)
        if "TZ=" in t or "TZ " in t:
            signals.add("TZ")
        if "LANG=" in t or "LC_ALL=" in t or "C.UTF-8" in t:
            signals.add("LANG")
    if not signals:
        return ("WARN", "未发现 TZ / LANG 固化（时区/区域差异致时间戳·排序·格式化漂移，R-84）",
                "Dockerfile 固定 `ENV TZ=UTC LANG=C.UTF-8 LC_ALL=C.UTF-8`（附录 O / AA.3）")
    return ("OK", "时区/区域已固化: " + ", ".join(sorted(signals)), "")


def check_fonts():
    """R-95: 图件依赖特定字体但复现环境缺失致渲染回退/位置漂移"""
    if not (ROOT / "figs").is_dir():
        return (None, "", "")  # 无图件则跳过
    signals = set()
    for rc in (ROOT / "matplotlibrc", ROOT / "reproduce" / "matplotlibrc"):
        t = read_text_safe(rc)
        if "font.family" in t or "font.sans-serif" in t:
            signals.add("matplotlibrc-font")
    for rel in ("reproduce/Dockerfile", "Dockerfile"):
        t = read_text_safe(ROOT / rel)
        if "fonts-" in t or "fc-cache" in t or "fontconfig" in t:
            signals.add("docker-fonts")
    if not signals:
        return ("WARN", "存在 figs/ 但未固化字体（CI 缺中文字体/数学字体致渲染回退，R-95）",
                "仓库 `matplotlibrc` 固化 font.family + Dockerfile 安装 fonts（如 fonts-dejavu/fonts-noto-cjk）（R-95 / 附录 AC.5）")
    return ("OK", "字体已固化: " + ", ".join(sorted(signals)), "")


def main():
    ap = argparse.ArgumentParser(description="复现环境预检 / 诊疗")
    ap.add_argument("--json", action="store_true", help="输出机器可读 JSON 数组")
    args = ap.parse_args()

    raw = [
        check_python_version(),
        check_required_inputs(),
        check_frozen(),
        check_requirements(),
        check_seeds(),
        check_gitattributes(),
        check_data_manifest(),
        check_prompt_hashes(),
        check_encoding(),
        check_determinism_env(),
        check_bom_crlf(),
        check_timezone_locale(),
        check_fonts(),
    ]
    findings = [{"status": s, "msg": m, "fix": fx} for (s, m, fx) in raw if s is not None]

    if args.json:
        print(json.dumps(findings, ensure_ascii=False, indent=2))
    else:
        counts = {"OK": 0, "WARN": 0, "FAIL": 0}
        for f in findings:
            counts[f["status"]] += 1
        print("=" * 64)
        print(" mathduce · 复现环境预检 (env_doctor)")
        print("=" * 64)
        print(f" 扫描根: {ROOT}")
        print("-" * 64)
        for f in findings:
            icon = {"OK": "✓", "WARN": "!", "FAIL": "✗"}[f["status"]]
            print(f" [{f['status']:4}] {icon} {f['msg']}")
            if f["fix"]:
                print(f"          ↳ 修复: {f['fix']}")
        print("-" * 64)
        print(f" 汇总: OK={counts['OK']}  WARN={counts['WARN']}  FAIL={counts['FAIL']}")
        verdict = "可继续复现链" if counts["FAIL"] == 0 else "须先修复 FAIL 项"
        print(f" 结论: {verdict}")
        print("=" * 64)

    return 1 if any(f["status"] == "FAIL" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
