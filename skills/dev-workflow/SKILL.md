---
name: dev-workflow
description: >-
  软件开发全流程协作技能。当用户需要从需求分析出发、经历架构设计、编码实现、代码评审、测试验证到发布与
  事故复盘的完整或单阶段软件工程任务时使用本技能。若任务仅涉及单文件小改动、纯算法题解答或与代码无关的
  写作任务，请勿使用本技能。
  一次性计算脚本、无需求-评审-发布链路 → 用对应领域技能（如 math-model-solve）。
license: MIT
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
metadata:
  version: "1.0.0"
  phase: "SDLC: Requirements → Design → Code → Review → Test → Release → Postmortem"
  style: "B"
---

# 软件开发全流程技能 (dev-workflow)

## When to use

- 从零启动一个新服务或新模块，需要经历需求、设计、编码、评审、测试、发布的完整链路。
- 需要把模糊的用户诉求拆解为带验收标准（AC）的需求文档，并冻结需求基线。
- 需要划分模块边界、设计数据模型与接口契约，并为技术选型留下 ADR 决策记录。
- 需要组织一次规范的代码评审（CR），推动评论闭环与双人批准。
- 需要制定分层测试计划、产出测试报告，并核对覆盖率与缺陷门禁。
- 需要执行灰度发布、准备回滚预案，或对线上事故做复盘与改进项跟踪。

### Do NOT use when

- 单文件 typo 修复、改一行文案、调一处样式等一次性微改动，直接编辑文件即可。
- 纯算法题解答或数学推导演算，不产生任何工程交付物。
- 与代码无关的写作任务，如论文段落撰写、翻译、文案润色。
- 仅需定位或解释既有代码逻辑，无任何 artifact 产出。

## 输入 / 输出契约

路径基准：下表所有相对路径均相对**项目工作区根**（project root，非 skill 目录）；skill 自带资产的路径单独标注基准。

| 阶段 | 输入 artifact | 输出 artifact | 格式与命名规范 |
|---|---|---|---|
| 1 需求拆解 | 用户访谈记录、业务方诉求、竞品参考 | 需求文档 `docs/req_*.md`、需求基线 `docs/req_baseline.md` | Markdown；命名 `req_<feature>.md`；含用户故事、AC、NFR、优先级 P0/P1/P2；基线含签字节与变更记录 |
| 2 架构设计 | 需求文档、现有代码结构、约束条件 | 接口契约 `docs/api_contract.md`、决策记录 `docs/adr/adr_*_*.md` | 契约含方法/路径/入参/出参/错误码五要素；ADR 含备选项、取舍理由、结论 |
| 3 编码实现 | 接口契约、任务拆分列表 | 源码提交（git commit 序列） | Conventional Commits：`type(scope): subject`；小步提交，每提交可独立构建 |
| 4 代码评审 (CR) | Pull Request 分支 | PR 描述与评审记录 | PR 描述按 `dev-workflow/templates/PR_CHECKLIST.md`（相对 skill 目录）逐项填写；评论状态 resolved |
| 5 测试验证 | 源码、测试计划、测试数据 | 测试报告 `reports/test_report.md` | Markdown；含单元/集成/E2E 分层结果、覆盖率数值、缺陷清单与等级 |
| 5 测试验证 | 依赖清单、源码与提交历史 | 安全扫描报告 `reports/security_scan.md` | Markdown；产出方＝阶段 5 测试验证（项目 `scripts/` 扫描脚本，退出码 0 才判通过）；消费方＝阶段 4 代码评审安全组与阶段 6 发布 secrets 门禁 |
| 6 发布 | 测试报告、变更说明、回滚预案 | 发布清单 `release/checklist.md`、回滚预案 `release/rollback_plan.md` | Markdown 勾选项；预案含演练记录、监控告警项与公告步骤 |
| 7 事故复盘 | 事故时间线、告警记录、日志与 trace | 事故复盘 `postmortem/*.md` | 命名 `postmortem/YYYY-MM-DD_<slug>.md`；含时间线、根因、改进项（owner + 截止日） |
| 全流程 | 各阶段产物与实现变更 | 项目说明 `README.md`、变更日志 `CHANGELOG.md` | Markdown；产出方＝阶段 3 编码实现与阶段 6 发布（同步更新章节与新增条目）；消费方＝全流程文档同步门禁 |

## 阶段流程（含 Checkpoint）

### 阶段 1 需求拆解
- 活动：用户故事 → 验收标准（AC） → 非功能需求（NFR）。
- **Checkpoint 1**：每条 AC 可测试、无歧义、有优先级（P0/P1/P2）；需求冻结签字。

### 阶段 2 架构设计
- 活动：模块划分、数据模型、接口契约、技术选型 ADR。
- **Checkpoint 2**：接口契约完整覆盖所有 AC；ADR 记录备选项与取舍理由。

### 阶段 3 编码实现
- 活动：小步提交、提交信息规范（Conventional Commits）、自测。
- **Checkpoint 3**：本地构建零错误、单元测试自测通过、无调试残留。

### 阶段 4 代码评审 (CR)
- 活动：双人评审、评论闭环。
- **Checkpoint 4**：≥2 人批准；所有评论已 resolve；安全组（PR_CHECKLIST 四）与性能组（PR_CHECKLIST 七）checklist 全项通过。

### 阶段 5 测试验证
- 活动：单元/集成/E2E 分层。
- **Checkpoint 5**：单测覆盖率 ≥80%（核心模块 100%）、集成测试通过、P0 用例零失败。

### 阶段 6 发布
- 活动：灰度、监控、回滚预案。
- **Checkpoint 6**：回滚预案演练通过、监控告警就位、变更公告已发。

### 阶段 7 事故复盘
- 活动：时间线、根因、改进项。
- **Checkpoint 7**：根因定位到具体 commit/配置；改进项有 owner 与截止日。

回退规则：任一 Checkpoint 判定不通过，对应产物退回本阶段修订，复检通过后才可进入下一阶段；阶段 6 之后发现的问题按阶段 7 处理并回灌到阶段 1 的需求基线。

## 质量门禁清单

路径基准：本清单路径均相对**项目工作区根**（与上方 I/O 契约表同基准，非 skill 目录）。

- [ ] 需求 AC 全部可测试、无歧义，并标注 P0/P1/P2 优先级（阶段 1）（证据：docs/req_*.md 的优先级列）
- [ ] 需求基线已冻结签字，后续变更均经变更控制流程（阶段 1）（证据：docs/req_baseline.md 签字节 + 变更记录）
- [ ] 接口契约与 AC 一一对应，无未被覆盖的 AC（阶段 2）（证据：docs/api_contract.md ↔ docs/req_*.md AC 列对照）
- [ ] 每项技术选型有 ADR，记录备选项与取舍理由（阶段 2）（证据：docs/adr/adr_*_*.md）
- [ ] 提交信息符合 Conventional Commits 规范（阶段 3）（证据：git log --oneline -20 逐条核对）
- [ ] 本地构建零错误，无调试残留代码与硬编码凭据（阶段 3）（证据：<项目构建命令> 退出码 0 + git grep 无 TODO/FIXME 调试残留）
- [ ] PR 获得 ≥2 人批准，全部评论已 resolve（阶段 4）（证据：PR 页面 + `dev-workflow/templates/PR_CHECKLIST.md`『评审签署』节）
- [ ] 安全 checklist（PR_CHECKLIST 四）与性能 checklist（PR_CHECKLIST 七）全项通过——必须安全组全过，且必须性能组全过，两组缺一即不勾选（阶段 4）（证据：dev-workflow/templates/PR_CHECKLIST.md §四 安全（Security） 与 §七 性能与复杂度，两组全勾）
- [ ] 单测覆盖率 ≥80%（核心模块 100%），P0 用例零失败（阶段 5）（产物 `reports/test_report.md` 的『覆盖率』节，数值来源：`pytest --cov` / `npm test -- --coverage` 输出）
- [ ] 集成测试与 E2E 关键路径全部通过（阶段 5）（产物 `reports/test_report.md` 的『集成与 E2E』节；命令写入该节）
- [ ] 依赖漏洞扫描通过，无未修复的高危漏洞（阶段 5）（产物 `reports/security_scan.md`，由项目 `scripts/` 下扫描脚本生成；退出码 0 才勾选）
- [ ] 无 secrets 泄漏，当前代码与历史提交均经扫描（阶段 6）（证据：项目 scripts/ 扫描脚本退出码 0，报告落盘 reports/security_scan.md）
- [ ] 回滚预案已演练，监控告警就位，变更公告已发（阶段 6）（证据：release/rollback_plan.md 演练记录 + 监控面板截图链接 + release/checklist.md 公告项）
- [ ] 根因已定位到具体 commit 或具体配置项（二者择一，须给出唯一标识：commit SHA 或配置键名），改进项绑定 owner 与截止日（阶段 7）（证据：git log -1 --stat <SHA> 或配置键名写入事故记录）
- [ ] 全流程文档同步有实产物：`docs/req_*.md`、`docs/api_contract.md`、`reports/test_report.md`、`release/checklist.md` 四份与实现一致，且 `README.md` 对应章节 + `CHANGELOG.md` 新增条目均已更新（路径以项目工作区根为基准）——四份产物 + README + CHANGELOG 共六者，缺一即不勾选（全流程）

## 本阶段须通过的门禁

本阶段须通过的门禁 = 上方「质量门禁清单」中对应阶段的全部勾选项：任一项未勾选即判该阶段 Checkpoint 不通过，按回退规则退回本阶段修订，复检全绿后方可放行下一阶段。

## scripts/ 与 templates/ 使用说明

本 skill 不强制依赖运行脚本。若项目工作区根提供 `scripts/` 目录（路径基准：项目工作区根），其中的构建、测试、lint、漏洞扫描脚本按对应阶段的 Checkpoint 调用；脚本退出码非 0 一律视为该 Checkpoint 不通过，不得跳过。

配套资产 `dev-workflow/templates/PR_CHECKLIST.md`（路径基准：skill 目录）是阶段 4 的 PR 描述模板，实际包含七组清单——一、变更范围（Scope）；二、代码质量（Code Quality）；三、测试（Testing）；四、安全（Security）；五、文档（Documentation）；六、发布（Release）；七、性能与复杂度——以及「评审签署」收口段。创建 PR 时将模板整段复制进 PR 描述并逐项填写，未填写项视为评审材料不完整，阶段 4 不予批准。

## references/

- Conventional Commits 1.0.0 规范
- ISO/IEC/IEEE 12207 生命周期过程
- Google SRE 事故复盘实践（postmortem culture）

## 常见错误

1. 需求未冻结就开工 → 需求持续膨胀导致返工与排期失控 → 先通过 Checkpoint 1 签字冻结，变更走变更控制并重新评估影响面。
2. 接口契约与 AC 脱节 → 联调阶段才发现缺口，测试失去判定依据 → 设计期将每条 AC 映射到契约条目，Checkpoint 2 核对覆盖率。
3. 提交信息写成 update、fix 这类无意义词 → 无法追溯变更意图，线上回滚无法定位 → 采用 Conventional Commits，一个提交只做一件事。
4. 单个 PR 混杂数百行多个主题 → 评审流于形式，缺陷漏进主干 → 拆成小步 PR，每个 PR 对应单一 AC 或单一修复。
5. 评审评论不闭环就合并 → 同类问题反复出现，经验无法沉淀 → 全部评论 resolve 后才批准合并，对应 Checkpoint 4。
6. 只写单元测试就宣称完成 → 集成与端到端缺陷上线后才暴露 → 按单元/集成/E2E 分层补齐，P0 用例零失败才放行。
7. 无回滚预案直接全量发布 → 故障时只能手工摸索，恢复时间被拉长 → 发布前完成预案演练并配齐监控告警，对应 Checkpoint 6。
8. 复盘只归因于人为失误 → 改进项无法执行，同类事故必然复发 → 根因定位到具体 commit 或配置项，改进项绑定 owner 与截止日。

## 变更日志

- 1.0.0 (2026-09-25)：初版
