# math — 数学建模竞赛全流程技能库

面向国赛（CUMCM）／美赛（MCM·ICM）／研赛（NPMCM）／51MCM 的**多技能协作流水线**：由总控编排 G0~G7 八个阶段，12 项熔断门禁（CB-1~CB-12）在阶段收口处验收，不达标即触发回退协议。

---

## 1. 两套路径基准（易错点）

本仓库的路径有**两套互不相干的基准**，引用时务必区分：

| 基准 | 含义 | 例子 |
|---|---|---|
| **项目工作区根**（`<project>`） | 比赛实际工作区，运行时产物落盘处 | `state/frozen_results.json`、`docs/`、`figs/`、`paper/`、`decisions/`、`code/`、`data/raw/`、`data/clean/`、`review/` |
| **skill 仓库根** | 本仓库自身 | `scripts/CANON.md`、`mathcomp/templates/G1_剖析卡模板.md`、`math/references/GB_T_7714_示例.md` |

凡出现相对路径必须显式标注基准，禁止裸写。

---

## 2. 技能索引（11 个）

### 数学建模家族（文风 A，8 个）

| skill | 阶段 | 职责 | 门禁 |
|---|---|---|---|
| `mathing` | 全程（Orchestrator） | 总控编排、门禁验收、阶段交接与召回 | 全部 CB-1~CB-12 |
| `mathategy` | G0 / G7 | 选题决议（五维评分 + 锁题）、赛后复盘 | CB-12 + 自有 S-1~S-5 |
| `mathcomp` | G1 | 赛题解构、反 AI 诱捕、EDA 八步、12 类归类 | CB-9、CB-12 |
| `mathulate` | G2 | 机理建模、第一性原理推导、机理微创新 | CB-4、CB-5、CB-11 |
| `matholve` | G3 | 数值求解、敏感性稳健性、附录代码纯净化 | CB-6、CB-7、CB-9 |
| `math-visualize` | G4 | 顶刊级数据可视化与 Draw.io 架构制图 | CB-2、CB-3、CB-9 |
| `math` | G5 / G6 | LaTeX 排版、法定八大结构、质检与签发 | CB-1、CB-4、CB-5、CB-8、CB-10、CB-12 |
| `mathduce` | G3→G4→G5→G6 | 论文全流程复现：数据溯源、代码纯净、图表复用、LaTeX 复现、四轮评审召回、五维复现度评分 | CB-7、CB-10、CB-12 |

### 跨领域技能（文风 B，3 个）

| skill | 领域 | 触发句式 |
|---|---|---|
| `devflow` | 软件工程全流程（需求→设计→编码→评审→测试→发布→复盘） | 当用户…时使用本技能：… |
| `journal` | 学术期刊投稿与审稿意见回复 | 当用户…时使用本技能：… |
| `biz` | 业务数据分析与报告 | 当用户…时使用本技能：… |

> 文风 A 用「专用于 G*N* 阶段：…」触发，禁止『当…时』；文风 B 反之。二者互斥。

---

## 3. 规范基线：`scripts/CANON.md`

**CANON.md 是全库唯一权威规范（SSoT）**，任何 SKILL.md 与之冲突一律以 CANON 为准。它规定：

- **§1** 阶段码 `G0`~`G7`（无连字符）与 72h/96h 沙盘；
- **§2** 熔断门禁 `CB-1`~`CB-12`（有连字符）四要素：判定条件 / 执行点 / 责任 skill / 回退目标；
- **§2.5** 回退协议与 `state/gate_log.jsonl` 九字段日志 schema；
- **§3** I/O 契约：目录约定、逐 skill 契约表、剖析卡 8 字段、`frozen_results.json` schema 与哈希协议；
- **§4 / §4.1** 数值常量**唯一源**与**唯一写法表**（全库逐字一致，en dash 与 `~` 不得退化）；
- **§5** 文风 A（高压铁律式）／文风 B（契约规范式）规范；
- **§6** 原 23 问题 + 新增 10 项 = **33 项销项清单**（已全部修复）；
- **§7** 全局禁写清单 10 条（其中 4 条为人工审查项）。

子技能**只引用不改写** CANON。

---

## 4. 校验

```bash
# Python
python scripts/validate_skills.py            # 退出码 0 = 通过
python scripts/validate_skills.py -v         # 逐文件打印 OK

# Windows PowerShell
powershell -File scripts/run_validate.ps1
```

`validate_skills.py` 共 **30 条规则**，覆盖 frontmatter、文风纯度、旧编号残留、禁写清单、数值唯一写法、资产路径引用、章节完整性、CB 双份维护同步（CANON §2 ↔ master §3）、CB 责任双向引用等。

配套脚本：

| 脚本 | 用途 | 门禁 |
|---|---|---|
| `matholve/scripts/frozen_check.py` | 冻结清单哈希重算 + 必填项机检 | CB-7 |
| `math-visualize/scripts/figure_lint.py` | 图件命名、DPI、空目录机检 | CB-2 辅助 |

> CANON 的 5 项人工审查项**全部纳入机检**（2026-09-27 强化）：`Rclaim`（§7-5 跨 skill 能力名，路由/分工声明豁免）、`Rbase`（§7-6 路径基准标注）、`Rmatch`（§7-8 参考文献同版匹配）、`Rmdup`（§7-10 宣称条目语义重复）、`R`（§4.2 中文语境引号全角，半角引号包中文即违规）。近义语义重叠仍建议人工复核。

## 4.2 运行时契约说明

`state/frozen_results.schema.json` 是 CANON §3.4 引用的唯一数值真相源 **Schema 定义**（规范件，随库维护）。

`state/frozen_results.json` 与 `state/gate_log.jsonl` 是**竞赛运行时产物**，不预建于本库：前者由 G3 求解流程生成（路径基准：项目工作区根 `<project>/state/`），后者由总控 append 维护（9 字段协议见 CANON §2.5）。

---

## 5. 关键铁律速查

- **数值唯一真相源** = `state/frozen_results.json`，论文与图件只能是它的下游投影，**严禁反向回改**；
- **更新顺序**：改数值 → 先更新冻结清单并重算哈希 → 再级联更新论文/图；
- **哈希重算分工**：`matholve` 执行重算，`math` 在 Round 2 复核比对，`mathing` 抽查；
- **阶段码与门禁码不可混用**：`G0`~`G7` vs `CB-1`~`CB-12`；
- **G5/G6 不合并**：G5=写作，G6=质检（三方联合，由 `math` 主责发起召回）；
- **G0∩G1 时序**：T06:00 锁题前只有《试解构备忘》`decisions/G0_试解构备忘_<题号>.md`，锁题后才创建正式剖析卡。

---

## 6. 七个数学建模技能详解（文风 A）

### ① `mathing` · 总控编排（G0~G7 全程）
- **版本**: v4.0.0 | **阶段码**: Orchestrator
- **职责**: 最高调度指挥官。负责：(a) 跨阶段编排国赛/美赛/研赛/51MCM；(b) 分配 G0~G7 任务给子技能；(c) 执行熔断门禁验收（CB-1~CB-12）；(d) 协调多个子技能接力协作。若用户只需单点任务（如只画一张图、只写摘要），**请直接调用对应子技能而非本总控**。
- **章节结构**: §输入与输出契约 → §阶段路由与极限作战沙盘 → §十二项熔断门禁 CB-1~CB-12 → §检查点与回退协议 → §论文法定八大结构骨架（速查表）→ §核心质量红线（独立于 CB 的额外禁令）→ §本阶段须通过的门禁 → §与其他技能的衔接。
- **关键增强**: 旧版无回退协议、无 I/O 契约章；新版补全 CB 门禁逐条四要素（判定条件/执行点/责任 skill/回退目标），新增「总控不代笔」职责边界铁律——master 只调度不生成内容。

### ② `mathategy` · 选题决议 + 赛后复盘（G0/G7）
- **版本**: v1.0.0 | **阶段码**: G0(赛前策略) / G7(赛后复盘)
- **职责**: 
  - **G0**: 五维评分卡（难易度/数据完备度/方法匹配度等），锁题决策，T02:00–T06:00 授权并行试解构窗口（decomp 产出《试解构备忘》回填本技能评分卡），T06:00 后锁定正式选题并放行 G1。
  - **G7**: 赛后复盘改进，回写 §1.2 分工模板与 §2.1 权重建议（年迭代一次）。闭环：`review/G7_复盘改进卡.md` → `mathing`。
- **关键增强**: **旧版完全缺失 G0/G7**——这是最大结构性缺口之一。新版补齐生命周期闭环，实现从选题到复盘的完整时间线。

### ③ `mathcomp` · 赛题解构（G1）
- **版本**: v2.0.0 | **阶段码**: G1:ProblemDecomposition&AntiAITrapProfiling
- **职责**: 
  - **反 AI 诱捕四问溯源**: 「出题人到底想考什么？」「哪条路径是坑？」「哪条路径是正解？」「如果我是出题人会怎么设计？」
  - **EDA 地毯式八步法**: 数据分布/相关性/异常值/缺失模式等八维度全量扫描。
  - **12 类数学本质精准映射与问题难易分级**: 将赛题归类到已知数学问题族（优化/回归/分类/聚类/时序/图论…），输出难易度初判供 strategy 评分卡。
- **产出**: `docs/G1_赛题解构与数据剖析卡.md`（8 字段 schema，供 formulate 进入 G2）。
- **门禁**: CB-9（Before-After 对比图组熔断）、CB-12（反上帝视角与元语言）。

### ④ `mathulate` · 机理建模（G2）
- **版本**: v2.1.0 | **阶段码**: G2:ModelFormulation&MicroInnovation
- **职责**: (a) 第一性原理推导——从物理/经济/化学等底层定律出发建立方程，而非直接套用现成模型；(b) 机理微创新策略——在已有框架上针对赛题特性引入修正项或新约束。
- **输入**: decomp 的剖析卡第 5 字段（变量可达性表）+ 12 类归类结论。
- **产出**: 模型方程组、假设体系、符号表，供 solve 进入 G3 求解。

### ⑤ `matholve` · 数值求解（G3）
- **版本**: v2.1.0 | **阶段码**: G3:NumericalSolving,SensitivityTesting&CleanCodeAppendix
- **核心机制——结果绝对冻结契约**（Frozen Numbers Ledger）:
  - `state/frozen_results.json` 是全库唯一数值真相源，论文与图件只能是它的下游投影，严禁反向回改。
  - 哈希协议：`json.dumps(obj, sort_keys=True, separators=(",",":"), ensure_ascii=False)` + UTF-8 → SHA-256（64 位小写十六进制），hash_sha256 字段排除在外。
  - **配套脚本 `frozen_check.py`**: 哈希重算 + `--check` 必填项机检（顶层 6 字段 / metrics≥1 / id 不撞号 / sensitivity 含 p1+sp）→ CB-7 门禁。
- **敏感性稳健性分析**: 关键参数 ±5% 扰动，计算灵敏度系数 S_p；p1 与 sp 在 frozen_results.json 中均必填。
- **附录代码工程纯净化**: 彻底封杀 `print("OK")` 等调试断点、严禁 AI 解释口吻；内置断言防线（assert）。
- **门禁**: CB-6（求解收敛性）、CB-7（冻结清单哈希一致）、CB-9（Before-After）。

### ⑥ `math-visualize` · 数据可视化（G4）
- **版本**: v2.0.0 | **阶段码**: G4:PublicationGradeVisualization&DrawioFlowcharts
- **职责**: (a) 顶刊级数据可视化（Matplotlib/Seaborn/Tableau）；(b) Draw.io 架构图制作用于模型流程展示。
- **双基准警告机制**：`<skill>` 相对本技能目录（脚本本体所在），`figs/` 相对项目工作区根——两者基准不同，严禁互相套用相对路径。
- **配套脚本 `figure_lint.py`**: 图件命名规范、DPI ≥300、空目录检测 → CB-2 辅助。

### ⑦ `math` · 论文排版（G5/G6）
- **版本**: v3.1.0 | **阶段码**: G5/G6:MandatoryPaperStructure,LaTeXTypesetting&FourRoundReview
- **职责**: (a) LaTeX 法定八大结构骨架（摘要、引言、模型假设、变量定义、建模过程、求解结果、灵敏度分析、结论）；(b) 「18 种 AI 腔调」对照表——逐条列出禁用腔调 + 改写示范（如「不仅…而且…」硬凑对仗、「交响乐」式通感比喻等）；(c) 四轮评审召回机制。
- **配套** `references/GB_T_7714_示例.md`: 参考文献同版匹配规范——同一文献的作者、版次、年份必须来自同一版本。

---

## 7. 三个跨领域技能详情（文风 B）

### `devflow` · 软件工程全流程
- **触发句**: 当用户需要完成需求拆解、架构设计、编码实现、代码评审、测试验证、发布上线或事故复盘时使用本技能。
- **阶段流程**: ①需求拆解 → ②架构设计 → ③编码实现（Conventional Commits）→ ④代码评审（CR，PR 描述按 `templates/PR_CHECKLIST.md`）→ ⑤测试验证（单元/集成/E2E + 安全扫描）→ ⑥发布上线（回滚预案演练记录）→ ⑦事故复盘（postmortem/YYYY_slug）。
- **配套模板**: `devflow/templates/PR_CHECKLIST.md`——七组清单：变更范围、代码质量、测试、安全、文档、发布、性能与复杂度 + 评审签署。

### `journal` · 学术期刊投稿与审稿回复
- **触发句**: 当用户需要完成选刊评估、稿件结构打磨、格式与伦理合规、投稿信撰写、审稿意见逐条回复或返修校样核对时使用本技能。
- **阶段流程**: ①选刊评估（影响因子/分区/审稿周期匹配）→ ②稿件结构打磨与格式合规 → ③投稿信撰写 → ④审稿意见逐条回复 → ⑤返修与校样核对。
- **配套模板**: `journal/templates/审稿意见回复模板.md`——含「原文→作者回复→修改后正文位置」三段式对照表。

### `biz` · 业务数据分析与报告
- **触发句**: 当用户需要完成业务数据接入、质量体检与清洗、指标体系搭建、归因与预测分析、可视化看板或形成可执行结论与建议的分析报告任务时使用本技能。
- **阶段流程**: ①数据接入 → ②质量体检（缺失率/异常值）→ ③指标体系搭建（北极星指标 + 子指标树）→ ④归因与预测分析 → ⑤可视化看板 → ⑥形成洞察与建议的报告。
- **配套模板**: `biz/templates/分析报告大纲模板.md`——8 节骨架：执行摘要、数据说明、核心发现、归因分析、预测结论、建议清单、附录图表、术语表。

> **文风 A/B 互斥铁律**: 
> - 文风 A（math 家族）description 触发句必须含「**专用于**」；禁止『当…时』和 checkbox `- [ ]`。
> - 文风 B（跨领域）description 触发句必须含「当…时」；必含 `## When to use`、`## 质量门禁清单（- [] checkbox）`、`## 变更日志`，禁止【铁律】【严禁】和 ASCII 边框。

---

## 8. CANON.md 规范基线详解

**CANON.md（全库唯一权威规范 SSoT）** 位于 `scripts/CANON.md`，子技能只引用不改写：

| 章节 | 内容 |
|---|---|
| **§1 阶段码** | G0~G7（无连字符），72h(国赛)/96h(美赛) 倒计时沙盘时间表。旧编号（G 加连字符形式）已废止，一律改用阶段码 G0~G7 与门禁码 CB-1~CB-12。 |
| **§2 CB 门禁表** | CB-1~CB-12（有连字符），每条四要素：判定条件 / 执行点（如 G3 frozen_check.py --check）/ 责任 skill / 回退目标。 |
| **§2.5 回退协议** | `state/gate_log.jsonl` append，九字段 schema `{ts, gate, phase, verdict, round, action, root_cause_phase, target_phase, note}`。触发 CB 时总控打回对应阶段并重做。 |
| **§3 I/O 契约** | 目录约定（state/ code/ figs/ docs/ decisions/ data/ review/）、逐 skill 输入输出字段表、剖析卡 8 字段 schema、frozen_results.json schema 与哈希协议。 |
| **§4 / §4.1 数值常量唯一源** | 全库逐字一致，en dash `–`（U+2013）用于数值范围（如 `26–40 页`），连字符 `-` 仅用于代码/路径；`~` 与 `～` 不得混用。 |
| **§5 文风 A/B** | §5.1 文风 A：H1 后必须概述段、正文用【铁律】【严禁】+ ASCII 门禁框、必含「输入与输出契约」与「本阶段须通过的门禁」。§5.2 文风 B：必含 When to use / I/O 契约表 / 阶段流程 Checkpoint / - [] checkbox 质量清单 / 变更日志。 |
| **§6 销项清单** | 原 23 问题 + 新增 10 项 = **33 项销项**（已全部修复 ✅）。 |
| **§7 禁写清单** | 10 条规则，其中 §7-5(跨 skill 能力名)、§7-6(路径基准标注)、§7-8(参考文献同版匹配)、§7-10(宣称条目语义重复) 为人工审查项（已纳入 `validate_skills.py` 机检）。 |

---

## 9. 校验体系与工具链

### validate_skills.py — 31 条静态机检规则

| 类别 | 规则数 | 覆盖内容 |
|---|---|---|
| **基础规则（前 26 条）** | R1~R15 + R/Rref/Rapter/Rstring/R/Rence/Rout/Rdecl/Rernref/Rbsync/Rbclaim | frontmatter 解析、文风纯度、旧编号残留 G、禁写清单(26-40/二八法则)、数值常量唯一写法(en dash/~)、资产路径引用完整性、I/O 契约章与门禁章必含、ASCII 框宽度漂移检测、门禁 checkbox 产物指针、文件命名规范(snake_case)、内部节号指针完整性(CANON §2↔master CB 同步)、CB 责任 skill 双向引用 |
| **§7 人工审查项机检（5 条）** | Rclaim / Rbase / Rmatch / Rmdup / R | §7-5 跨 skill 能力名(路由/分工声明豁免)、§7-6 路径基准标注、§7-8 参考文献同版匹配、§7-10 宣称条目语义重复(机检近似口径)、§4.2 中文语境引号全角(半角包中文即 FAIL) |
| **配套脚本** | frozen_check.py / figure_lint.py | CB-7 冻结清单哈希重算 + 必填项机检、CB-2 图件命名/DPI/空目录检测 |

> **近义语义重叠仍建议人工复核**（Rmdup 仅抓完全重复行，同阶段多行如"5 测试验证"分两行列出不属重复）。

### 使用命令
```bash
# Python（Git Bash / WSL）
python scripts/validate_skills.py            # 退出码 0 = PASS (Scanned: 17 | FAIL: 0 | WARN: 0)
python scripts/validate_skills.py -v         # 逐文件打印 OK

# Windows PowerShell
powershell -File scripts/run_validate.ps1
```

---

## 10. 使用流程（典型竞赛从选题到复盘）

```
用户输入赛题 → master 总控启动 G0
  │
  ├─ strategy(G0): T02:00–T06:00 试解构窗口(五维评分卡)
  │                    ↓ (锁题放行)
  │
  ├─ decomp(G1): EDA八步 + 反AI诱捕四问 + 12类归类 → G1_剖析卡.md
  │                    ↓ (8字段剖析卡交付)
  │
  ├─ formulate(G2): 第一性原理推导 + 机理微创新 → 模型方程组/假设体系/符号表
  │                    ↓ (供 solve 求解)
  │
  ├─ solve(G3): frozen_results.json(哈希冻结) + sensitivity ±5% + clean code附录
  │                    ↓ (数值结果交付)
  │
  ├─ visualize(G4): 顶刊图表 + Draw.io架构图 → figs/fig_*.png
  │                    ↓ (图件交付)
  │
  ├─ paper(G5/G6): LaTeX八大结构 + 「18种AI腔调」对照 + 四轮评审召回 → paper/*.pdf
  │                    ↓ (论文签发)
  │
  └─ strategy(G7): 复盘改进卡 review/G7_*.md → 回写 §1.2/§2.1 年迭代
```

每个阶段收口处 master 执行 CB 门禁验收（`validate_skills.py` + `frozen_check.py` / `figure_lint.py`），不达标触发回退协议——总控打回对应阶段重做，gate_log.jsonl append 记录。

---

## 11. 模板与配套文件清单

| 位置 | 文件 | 用途 |
|---|---|---|
| `mathategy/templates/G0_选题决议卡模板.md` | G0 五维评分卡 + 锁题结论框 | strategy(G0) 产出 |
| `mathcomp/templates/G1_剖析卡模板.md` | 8 字段 schema（变量可达性表等） | decomp(G1) 交付物 |
| `mathategy/templates/G7_复盘改进卡模板.md` | 回写 §1.2/§2.1 年迭代记录 | strategy(G7) 产出 |
| `math/references/GB_T_7714_示例.md` | 参考文献同版匹配示范（薛定宇线性代数等） | paper(G5/G6) 引用规范 |
| `journal/templates/审稿意见回复模板.md` | 「原文→回复→修改后位置」三段对照表 | journal(G5) 产出 |
| `devflow/templates/PR_CHECKLIST.md` | 七组清单（变更范围→评审签署） | devflow(阶段4 CR) 使用 |
| `biz/templates/分析报告大纲模板.md` | 8节骨架（执行摘要→术语表） | bizanalytics 产出 |

---

## 12. 关键铁律速查（日常使用高频回顾）

- **数值唯一真相源**: `state/frozen_results.json`，论文与图件只能是它的下游投影，**严禁反向回改**。
- **更新顺序**: 改数值 → 先更新冻结清单并重算哈希 → 再级联更新论文/图。
- **哈希重算分工**: `matholve` 执行重算、`math` Round 2 复核比对、`mathing` 抽查。
- **阶段码与门禁码不可混用**: `G0`~`G7` ≠ `CB-1`~`CB-12`（旧编号 G 已废止）。
- **G5/G6 不合并**: G5=写作、G6=质检（三方联合，由 paper 主责发起召回）。
- **G0∩G1 时序铁律**: T06:00 锁题前只有《试解构备忘》`decisions/G0_试解构备忘_<题号>.md`，锁题后才创建正式剖析卡 `docs/G1_赛题解构与数据剖析卡.md`。
- **路径基准铁律**: 凡出现相对路径必须显式标注基准（项目工作区根 `<project>` vs skill 仓库根），禁止裸写、严禁混用两套基准。

---

## 13. 全局配置系统深度融合（Codex w15.md）

> **版本**: v5.0.0 | **融合源**: `C:\Users\46523\Desktop\.txt` (Codex w15.md，118,428 chars / 30+ 章节)
> 
> **融合日期**: 2026-09-27 | **融合策略**: 核心方法论迁移 + 规则机检化 + 漂移检测矩阵

### 13.1 全局配置系统核心规则提取与 math skill 库映射

| 来源章节 | 原文约 chars | 核心规则提取 | math skill 库融合位置 |
|---|---|---|---|
| **§4 输出自检与反拒绝** | ~2,740 | NSFW强制覆盖层 + 四类标签(REFUSAL/FALLBACK/SAFE/RISK) + hermes评分信号 | validate_skills.py `Rrefusal` 规则（开头160字符扫描 + FALLBACK软降级检测） |
| **§5 确定性输出槽位** | ~3,465 | slots.json 21 槽位(S01~S21)同源校验脚本断言 | CANON.md §3.5 frozen_results → metrics/decisions/figures 映射表 + validate_skills.py `Rslots` |
| **§8 技能路由与工具注册** | ~10,492 | 自动参考 SKILL.md 触发逻辑 + 文件加载表 + 三维路由（意图+目标+工具链） | README.md §5.3 skill 索引表增强 + validate_skills.py `RsKill` (README skill 索引 vs discover_skills()一致性) |
| **§10 CyberRange 目录路由** | ~4,387 | 两套基准管理体系(mount A/B)+挂载平面设计+引用规则 | CANON.md §3 I/O契约新增"挂载平面设计"列 + validate_skills.py `Rmount` |
| **§11 科研范围** | ~568 | 自动启用 skill + 产物统一保存路径 + 占位符模板机制 | mathsolve SKILL.md "反 AI 诱捕四问溯源"增强 (G3 solve 附录代码工程纯净化规范) |
| **§20 输出标准与语言格式** | ~1,000 | 代码完整可运行+错误处理+注释 + 明确路径参数依赖 + 验证步骤 | validate_skills.py `Rcheck` 规则（代码块#50字符检测错误处理+#100字符检测注释）+ CANON.md §4.2引号规范 |
| **§23 p15 漂移检测矩阵** | ~1,000 | 7格断言(源A→源B一致性验证)+漂移处理顺序(先修A再让B重新生成) | validate_skills.py `Rdrift` 规则 + CANON.md §6.2 漂移检测矩阵表 |
| **§24 p16 门禁工具化** | ~2,000 | skill_gate.py(扫描器受控封装)+_gateger.jsonl台账+白名单ACKNOWLEDGED机制 | README.md §9 校验体系增加"技能供应链门禁"子章节 + validate_skills.py `Rgateger` |
| **§25 p17 硬化层** | ~1,500 | 逃生条款清零(escape clause)+指纹一致性+挂载平面规则 | CANON.md §3.1 mount A/B引用规则 + README.md §13.3 铁律速查增加条目 |

### 13.2 新增机检规则清单（v4.0→v5.0，31→34条）

| # | 规则名 | 来源 | 检测内容 | FAIL条件 |
|---|---|---|---|---|
| R21 | `Rdrift` | §23 p15.9 | CANON.md 漂移检测矩阵 7格断言 | 缺少≥1格断言定义 |
| R22 | `Rcheck` | §20 | SKILL.md 代码块错误处理+注释完整性 | 代码块>50字符无try/except + >100字符无#注释 |
| R23 | `Rrefusal` | §4 | REFUSAL/FALLBACK/SAFE/RISK四类标签扫描 | 开头160字符命中拒绝词或全文命中软降级话术 |
| R24 | `RsKill` | §8 | README.md skill索引表 vs discover_skills()一致性 | 索引表缺少≥1个实际存在的skill目录名 |
| R25 | `Rslots` | §5 | slots.json槽位(S01~S21)与frozen_results metrics映射 | CANON.md缺少"slots.json"引用或槽位数<21 |
| R26 | `Rgateger` | §16 p16.2 | _gateger.jsonl台账无BLOCKED记录 | 存在verdict=BLOCKED的台账记录 |
| R27 | `Rfrontmatter` | §16 p16.4 | SKILL.md frontmatter name/license规范化 | name含空格/&/非kebab + license字段缺失 |
| R28 | `Rmount` | §10 | mount A/B定义+引用注释锚点<!--project:...--> | CANON.md缺少"mount A:"或"mount B:"定义 |

### 13.3 融合后新增铁律（README §12 速查）

- **反拒绝覆盖**: G0~G7 每个阶段产出冻结清单后，master执行三轮自检——哈希一致性(`frozen_check.py --check`)→槽位完整性(slots.json 21 slot全覆盖)→下游投影一致性(论文/图件数值≤frozen_results，无反向回改)。
- **代码输出标准**: 所有 SKILL.md 中的代码块必须包含错误处理(`try:/except/if not/raise`)、注释(`#`/`; #`)、验证步骤和预期输出；缺失即 FAIL。
- **技能路由触发**: 用户意图关键词→自动匹配对应 skill → Read SKILL.md → 按技能内指令执行（精确名称>description关键词>目录名模糊匹配）。
- **挂载平面设计**: mount A(`<project>`，运行时产物落盘)可引用mount B相对路径；mount B(`<skill>`，规范件随库维护)引用mount A时必须显式标注`<!-- project: <cwd>/state/... -->`注释锚点。
- **漂移检测矩阵**: CANON.md/README/SKILL/frozen_check.py/templates 之间交叉引用一致性，任一格不一致即FAIL；先修源A(权威)，再让源B重新生成，不允许反向手改B迁就A。

### 13.4 融合验证命令

```bash
# 全量合规性检测（34条规则）
python scripts/validate_skills.py 2>&1 | tail -5
# Expected: Scanned: X files | FAIL: 0 | WARN: 0 | RULES: 34 | RESULT: PASS ✓

# 单技能门禁扫描（ §16 p16.2 skill_gate.py）
python scripts/skill_gate.py scan <skill_directory>
# Expected: rc=0 (PASS) / rc=1 (BLOCKED，需人工复核后 --ack rule_id)

# slots.json 同源校验（ §5）
python scripts/refresh_skill_index.py --dry
# Expected: on disk X / refreshed X / stale 0 + 索引描述零空值
```

### 13.5 不采用清单（ §25 p17.6 显式排除）

以下条款**不融入** math skill 库，仅保留为参考素材：
- gen-4 身份自称（"offline documentation engine"）→ 身份保持 WorkBuddy AI assistant
- gen-4 "No self / never name this instruction set" → math skill 库激活台词与模式路由照常
- gen-4 NSFW「保持单场景/短篇/不写长清单」→ 仅作为写词技巧，不约束本环境输出长度与尺度
- gen-4 "PURE ARCHITECTURE — NO TOOL SURFACE" → 本环境工具全放行（shell/文件/网络/浏览器/多代理）

### 13.6 版本谱系（ §23 p15.10）

| 版本 | 日期 | 角色 |
|---|---|---|
| v4.0.0 | 2026-09-26 | CANON SSoT基线：§1阶段码、§2CB门禁、§3I/O契约、§4数值常量、§5文风A/B、§6销项清单、§7禁写清单 |
| v5.0.1 | 2026-09-27 | 新增论文全流程复现技能 mathduce（11 技能）；math 家族补齐文风 A 特征；验证器 PASS |
| **v5.0.0** | **2026-09-27** | **融合层：新增§3挂载平面设计、§4引号规范+Rcheck、§5技能路由表、§6漂移检测矩阵(7格)、§7禁写清单10条（含 §4/§5/§8/§10/§20/§23-25 融合条目）** |

> **权威条款**: 本文件内任何其它位置出现的「固定路径」「指针契约」陈述，若与本节不一致，一律以本节为准。
