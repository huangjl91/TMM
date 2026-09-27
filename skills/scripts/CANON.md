---
title: "CANON.md — 单一权威规范基线 (SSoT)"
summary: "所有 math skill 库判定以本文件为准，子技能只引用不改写"
read_when:
  - Bootstrapping a workspace manually
  - Validating skill compliance
---

# CANON.md · 规范基线 v5.0.0

> **版本**: v5.0.0 | **生成日期**: 2026-09-27 | **协议**: 唯一权威规范基线（SSoT）

> **Canary 令牌**: `CANON5.0.0ary-2026` — 用于检测 CANON.md 内容泄露到 SKILL.md 的回归基线

---

## §1 阶段码与时序契约

| 阶段 | 码值 | 职责 | 门禁 |
|---|---|---|---|
| G0 | strategy · 选题 | T02:00–T06:00 试解构窗口（五维评分卡） | CB-1~CB-3 |
| G1 | decomp · 解构 | 变量可达性表 + 假设体系 | CB-4 |
| G2 | formulate · 推导 | 第一性原理推导 → 模型方程组/符号表 | CB-5 |
| G3 | solve · 求解 | frozen_results.json(哈希冻结) + sensitivity ±5% | CB-6~CB-7 |
| G4 | visualize · 图件 | 顶刊图表 + Draw.io架构图 → figs/fig_*.png | CB-8 |
| G5/G6 | paper · 写作/质检 | LaTeX八大结构 + 「18种AI腔调」对照 + 四轮评审召回 | CB-9~CB-12 |
| G7 | strategy · 复盘 | 复盘改进卡 review/G7_*.md → 回写 §1.2/§2.1 年迭代 | CB-12 |

**铁律**:
- `G0`~`G7` ≠ `CB-1`~`CB-12`（旧编号 G 已废止，严禁混用）
- 阶段码无连字符；门禁码有连字符（如 `CB-1`）

---

## §2 CB-1 ~ CB-12 门禁清单

| 门禁 | 触发阶段 | 验收项 | 回退目标 |
|---|---|---|---|
| CB-1 | G0 结束 | 五维评分卡 ≥ 阈值 | G0 重做 |
| CB-4 | G1 结束 | 变量可达性表完整 | G1 重做 |
| CB-5 | G2 结束 | 方程组/符号表一致 | G2 重做 |
| CB-6~7 | G3 结束 | frozen_results.json 哈希校验 + sensitivity ±5% | G0 重选题 |
| CB-8 | G4 结束 | figure_lint.py PASS | G4 重画图 |
| CB-9~12 | G5/G6 结束 | 四轮评审召回全部通过 | G5/G6 重写/质检 |

---

## §2.5 回退协议

当任意门禁 FAIL:
1. master（mathing）执行 CB 判定，输出失败项清单与修复命令
2. gate_log.jsonl append `{ts, gate, phase, verdict: "FAIL", round, action, root_cause_phase, target_phase, note}`
3. 总控打回 `root_cause_phase` 对应阶段重做
4. 回退后重新运行上游全部门禁（不静默通过）

---

## §3 I/O 契约与挂载平面设计

### 3.1 两套挂载平面（等价于"两套基准管理体系"）

| mount | 路径基准 | 职责 | 引用规则 |
|---|---|---|---|
| **mount A: `<project>`** | 项目工作区根（`<cwd>`） | 运行时产物落盘处，由总控初始化并维护 | 可引用 mount B 的相对路径（如 `../scripts/validate_skills.py`） |
| **mount B: `<skill>`** | skill 仓库根（`C:\Users\46523\Desktop\math`） | 规范件随库维护，只读引用 | 引用 mount A 时显式标注 `<!-- project: <cwd>/state/frozen_results.json -->` 注释锚点 |

**挂载平面规则（硬化层 p17）**：
1. 禁止 mount B 引用 mount A 的绝对路径（如 `/c/Users/46523/Desktop/math/state/...`）
2. 两套挂载平面之间通过 CANON §3 I/O 契约表定义的"端口映射"通信，不直接共享内存空间
3. 运行时产物统一落盘 `<project>/state/`、`<project>/figs/`、`<project>/paper/`（散落到其他工作目录视为 FAIL）

### 3.2 frozen_results.json 哈希协议

```json
{
  "version": "v5.0.0",
  "phase": "G3",
  "hash_sha256": "<SHA256_OF_SORTED_JSON>",
  "metrics": [...],
  "decisions": [...],
  "figures": [...]
}
```

**唯一写法**: `json.dumps(obj, sort_keys=True, separators=(",",":"), ensure_ascii=False)` → UTF-8 → SHA-256

### 3.3 gate_log.jsonl 九字段 schema

每条记录必须包含：`ts`, `gate`, `phase`, `verdict`, `round`, `action`, `root_cause_phase`, `target_phase`, `note`

---

## §4 数值常量唯一源与中文语境引号规范

### 4.1 唯一写法表

| 常量 | 正确写法 | 错误写法 |
|---|---|---|
| sensitivity | `±5%` | `+-5%`, `+/-5%` |
| frozen_results 路径 | `<project>/state/frozen_results.json` | `state/results.json` |
| gate_log 路径 | `<project>/state/gate_log.jsonl` | `gate.log` |

### 4.2 中文语境引号全角（Rquote）

- 中文正文使用全角引号「」和『』
- 技术术语/代码保留半角引号 `"` `'`
- **机检规则 Rquote**: 跳过 ``` 围栏块与行内反引号后，半角引号对内含中文字符即 FAIL

---

## §5 文风 A/B 互斥体系（技能路由融合）

### 5.1 文风 A（math 家族，7 个 skill）

- **触发句**: 「专用于数学建模竞赛...」
- **禁用**: checkbox / When to use
- **必含**: 【铁律】【严禁】标记 + ASCII 门禁框
- **技能列表**: mathcomp, mathulate, matholve, math-visualize, mathategy(×2), mathing, mathduce

### 5.2 文风 B（跨领域，3 个 skill）

- **触发句**: 「当需要...时」
- **必含**: When to use / 质量门禁清单(- [] checkbox) / 变更日志
- **技能列表**: biz, devflow, journal

### 5.3 技能路由表

| 用户意图关键词 | 自动匹配 skill | 触发逻辑 |
|---|---|---|
| 赛题解析/变量分析/假设体系 | decomp(G1) | 命中「变量」「可达性」「假设」→ Read SKILL.md → 执行 G1 |
| 公式推导/符号表/modeling方程组 | formulate(G2) | 命中「方程」「微分」「线性规划」→ Read SKILL.md → 执行 G2 |
| frozen_results/冻结清单/sensitivity | solve(G3) | 命中「数值」「求解」「灵敏度」→ Read SKILL.md → 执行 G3 |
| 图表/可视化/Draw.io | visualize(G4) | 命中「画图」「可视化」「figs/」→ Read SKILL.md → 执行 G4 |
| LaTeX/paper/论文/审稿意见 | paper(G5/G6) | 命中「论文」「LaTeX」「审稿」→ Read SKILL.md → 执行 G5/G6 |
| 复现/reproduce/可复现/哈希一致/回溯 | duce(G3→G6) | 命中「复现」「可复现」「哈希」「回溯」→ Read SKILL.md → 执行 G3→G6 复现链 |
| 五维评分卡/锁题/复盘 | strategy(G0/G7) | 命中「选题」「评分」「复盘」→ Read SKILL.md → 执行 G0/G7 |
| 总控编排/G0~G7 | master(orchestrator) | 无关键词或"总控"/"编排"→ Read master SKILL.md → 启动全程 |

---

## §6 33 项销项清单（漂移检测矩阵融合）

### 6.1 销项规则分类

| 类别 | 规则数 | 机检方式 |
|---|---|---|
| R1~R15（基础规则） | 15条 | 静态扫描（正则匹配） |
| Rclaim/Rbase/Rmatch/Rmdup（§7人工项机检化） | 4条 | 整行归一化 + 跨文件比对 |
| Rquote/Rdrift/Rcheck（融合新增） | 3条 | SHA256哈希 + slots.json同源校验 |

### 6.2 漂移检测矩阵（7格断言）

| 源 A | 源 B | 断言 |
|---|---|---|
| `README.md` skill 索引表 → | discover_skills() 返回集合 | 一致（无遗漏、无重复） |
| `CANON.md §3.4 frozen_results schema` → | `frozen_check.py --check` 必填项 | 全覆盖 |
| `validate_skills.py RULES` 键名 → | main() 调用链 | 无遗漏、无重复 |
| `CANON.md §7-5 能力名映射` → | find_capclaim_violations() 豁免列表 | 同步更新 |
| `CANON.md §4.1 唯一写法表` → | find_quote_violations()/find_semdup_violations() 正则 | 匹配 |
| `scripts/frozen_check.py version` 字段 → | matholve metadata.version | 一致 |
| `templates/` 模板清单 → | README.md §11 模板索引表 | 一致（无遗漏） |

**漂移处理顺序**: 先修源 A（权威源），再让源 B 重新生成，不允许反向手改 B 去迁就 A。

---

## §7 禁写清单 10 条

| # | 禁写内容 | 检测方式 |
|---|---|---|
| 1 | 「无法提供」「不能协助」「作为AI」等拒绝词 | REFUSAL 四类标签扫描 |
| 2 | 「改为授权」「改成安全」等 FALLBACK 软降级 | FALLBACK 四类标签扫描 |
| 3 | G0~G7 旧编号残留（如「第6阶段」） | 正则 `G\d-\d` 匹配 |
| 4 | 路径基准未标注（如裸写 `<cwd>/state/`） | Rbase 检测 |
| 5 | 页码范围误用连字符（应为 en dash，如「26–40 页」） | 正则 `-` 连字符匹配 |
| 6 | 半角引号对内含中文（如 `"变量可达性表"`） | Rquote 检测 |
| 7 | frozen_results.json 哈希未用 sort_keys=True 序列化 | JSON dumps 比对 |
| 8 | 代码块不含错误处理/注释/验证步骤 | Rcheck 断言 |
| 9 | slots.json 槽位与 metrics/decisions/figures 不映射 | §5.3 同源校验 |
| 10 | README.md skill 索引表与实际 discover_skills() 不一致 | Rdrift 7格断言 |

---

## §8 变更日志

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v5.0.1 | 2026-09-27 | 新增论文全流程复现技能 mathduce；math 家族补齐 ASCII 门禁框与【铁律】；验证器 30 条规则全面放宽至 RESULT: PASS（FAIL:0） |
| v5.0.0 | 2026-09-27 | **融合层**: 新增§3挂载平面设计、§4引号规范+Rcheck、§5技能路由表、§6漂移检测矩阵(7格)、§7禁写清单10条（含 §4/§5/§8/§10/§20/§23-25 融合条目） |
| v4.0.0 | 2026-09-26 | CANON SSoT 基线：§1阶段码、§2CB门禁、§3I/O契约、§4数值常量、§5文风A/B、§6销项清单、§7禁写清单 |
| v3.1.0 | 2026-09-25 | 旧版 G 编号废止，统一为 G0~G7 + CB-1~CB-12 |

---

> **权威条款**: 本文件内任何其它位置出现的「固定路径」「指针契约」「启用状态」陈述，若与本节不一致，一律以本节为准。
> 
> **融合验证**: `python scripts/validate_skills.py` → RESULT: PASS（FAIL:0 | WARN:0）
