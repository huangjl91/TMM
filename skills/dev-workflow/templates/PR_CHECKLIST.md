# PR 检查清单（PR_CHECKLIST）

> **配套关系**：本清单是 `dev-workflow` skill **Checkpoint 4（代码评审 CR）**与 **Checkpoint 5（测试验证）**的执行载体；阶段 4 的 PR 描述须整段复制本模板并逐项勾选，未填写项视为评审材料不完整，Checkpoint 4 不予批准。
> 路径基准：`dev-workflow/templates/PR_CHECKLIST.md`（相对 skill 目录）。
> 勾选规则：每项独立勾选；**无法用命令/文件/截图验证的条目一律不许勾选**。不适用项标注 `N/A: 原因`，不允许留空。

---

## 一、变更范围（Scope）

- [ ] PR 标题符合 Conventional Commits：`type(scope): subject`（如 `feat(auth): add token refresh`）（命令：git log --oneline -20）
- [ ] PR 描述关联到唯一的需求/AC 编号（如 `AC-3`），无未挂靠的需求改动（证据：docs/req_baseline.md AC 编号列 ↔ PR 描述关联行）
- [ ] 变更文件清单与 PR diff 一致，`git status` 无未纳入提交的临时文件、调试脚本、个人配置
- [ ] 单个 PR 只含一个主题；跨主题改动已拆分为独立 PR（列出拆分后的 PR 编号）（命令：`git log --oneline [目标分支]..HEAD` 逐提交核对单主题）
- [ ] 删除的代码/接口已在描述中说明影响面与替代方案，未夹带无关重构（证据：CHANGELOG.md 变更说明条目 + PR 描述影响面栏）
- [ ] 依赖变更（新增/升级/移除 `package.json`、`requirements.txt` 等）已在描述中单独列出

## 二、代码质量（Code Quality）

- [ ] 本地构建零错误：`[构建命令]` 输出成功，退出码 0（贴日志片段）
- [ ] Lint / 静态检查通过：`[lint 命令]` 无 error（贴通过结果）（命令：`[项目 lint 命令]`，退出码 0）
- [ ] 类型检查通过（若项目启用）：`[typecheck 命令]` 无 error（命令：`[项目 typecheck 命令]`，退出码 0）
- [ ] 无调试残留：代码中无 `print("OK")`、`console.log("test")`、`TODO: delete me`、注释掉的整段旧代码（命令：`git grep -nE "TODO: delete me|console\.log|print\(" [改动目录]` 零命中）
- [ ] 无硬编码密钥/凭据/内网地址：`grep -n "sk-|password=|api_key" [改动目录]` 零命中（证据：reports/security_scan.md secrets 扫描节，项目 scripts/ 扫描脚本退出码 0）
- [ ] 新增函数/分支含边界处理；核心状态变更处有 `assert` 或等价的前置条件校验（证据：reports/test_report.md 单元分层结果节的边界与前置条件用例）
- [ ] 命名与既有代码风格一致（复用项目已有工具函数，未引入第二套同类实现）（证据：PR 评审记录（阶段 4 产出）风格一致性核对行）

## 三、测试（Testing）

本节是 Checkpoint 5 主战场：单测、集成与 E2E 的通过证据在此逐项落证。

- [ ] 新增逻辑已补单元测试，且测试文件与源文件同 MR 提交（不是“下次补”）（证据：reports/test_report.md 单元分层结果节用例清单与源文件同 commit）
- [ ] 本地单测通过：`[测试命令]` 退出码 0，失败数 0（贴统计行）
- [ ] 单测覆盖率 ≥80%，核心模块 100%（贴 `coverage` 命令输出的百分比）（证据：reports/test_report.md 覆盖率节）
- [ ] 集成测试通过：`[集成测试命令]`，用例数与通过数一致（证据：reports/test_report.md 集成分层结果节，用例数 = 通过数）
- [ ] P0 用例零失败；新增/修复行为均有对应用例（bugfix 必须附“先红后绿”的回归用例名）（证据：reports/test_report.md 缺陷清单与等级节，P0 零失败）
- [ ] 边界与异常路径有用例：空输入、超大输入、非法参数、超时与错误码分支（证据：reports/test_report.md 分层结果节边界用例清单）
- [ ] 受影响的 E2E 关键路径已执行并贴结果（或标注 N/A 及原因）（证据：reports/test_report.md E2E 分层结果节）
- [ ] 测试数据不依赖外网与本机绝对路径，CI 上可重复执行（连续跑 2 次结果一致）（命令：`[项目测试命令]` 连跑 2 次退出码均为 0 且结果一致）

## 四、安全（Security）

- [ ] 依赖漏洞扫描通过，无未修复的高危漏洞（贴 `npm audit` / `pip-audit` / `govulncheck` 结果）
- [ ] 无 secrets 泄漏：当前 diff 与历史提交均经扫描（贴 `git log -p | grep` 或 gitleaks 结果）
- [ ] 用户输入已做校验与转义；SQL/命令拼接使用参数化接口，无字符串直拼（证据：PR 评审记录安全组输入校验核对行 + reports/security_scan.md）
- [ ] 权限/鉴权变更已说明：新增接口的访问控制级别与既有接口一致（证据：PR 评审记录安全组鉴权核对行）
- [ ] 第三方服务调用的超时、重试与失败降级策略已实现或已说明不适用原因（证据：PR 评审记录安全组第三方调用核对行）
- [ ] 敏感数据（个人信息、令牌、日志中的请求体）未打印进日志，日志脱敏规则已验证（证据：reports/security_scan.md 日志脱敏扫描节）

## 五、文档（Documentation）

- [ ] 接口契约（`docs/api_contract.md`）与本次改动逐字段同步，无“文档滞后于代码”
- [ ] 配置项/环境变量新增或改名已更新 README 或部署文档，并标注默认值（证据：README.md 配置项章节 + CHANGELOG.md 条目）
- [ ] 变更说明（CHANGELOG 或 PR 描述的 What/Why）覆盖用户可感知的行为变化（证据：CHANGELOG.md What/Why 段新增条目）
- [ ] 破坏性变更（不兼容改动）已标注迁移步骤与生效版本号（证据：CHANGELOG.md 破坏性变更段迁移步骤）
- [ ] 代码注释只保留参数量纲、超常量定义、边界不变量三类技术注释，无对话式注释（命令：`git diff [目标分支]...HEAD` 检视注释行）
- [ ] 运维/值班手册（如涉及）已同步告警项、开关名与回滚步骤（证据：release/checklist.md 告警与回滚项）

## 六、发布（Release）

- [ ] 回滚预案已写明：回滚命令/版本号、数据兼容性（是否需要回滚迁移）（证据：release/rollback_plan.md 回滚命令与数据兼容性节）
- [ ] 回滚预案已演练或在预演环境验证过，贴演练记录链接（证据：release/rollback_plan.md 演练记录节）
- [ ] 灰度计划明确：灰度比例、观察时长、核心监控指标与告警阈值（证据：release/checklist.md 灰度计划项）
- [ ] 监控与告警就位：新增指标/日志面板链接、告警规则已启用并测试触发（证据：release/checklist.md 监控告警项 + 面板链接）
- [ ] 数据库/配置变更脚本可重复执行（幂等）且与代码发布顺序已写入发布清单（证据：release/checklist.md 变更脚本与发布顺序项）
- [ ] 发布窗口与负责人已确认，变更公告（用户/相关团队）已准备或已发（证据：release/checklist.md 发布窗口与公告项）

## 七、性能与复杂度

- [ ] 新增/修改代码的时间复杂度已在 PR 描述中说明（如 O(n log n)）（证据：PR 描述复杂度说明栏）
- [ ] 无 O(n²) 以上隐式嵌套（循环内套循环且数据量 >1000）；若存在，必须在 PR 描述中给出豁免理由，二者必居其一（证据：PR 描述豁免理由栏 或 命令：`git diff [目标分支]...HEAD` 定位嵌套循环）
- [ ] 涉及数据库/API 的批量调用已改为分批（每批 ≤500）或已改用批量接口——两种方式择一，且必须在 PR 描述中注明所选方式（证据：PR 描述分批方式注明栏）

---

## 评审签署（Checkpoint 4 收口）

- [ ] ≥2 人批准（批准人：`[姓名]`、`[姓名]`）（证据：PR 批准记录，含 2 名批准人姓名）
- [ ] 全部评审评论已 resolve（无 unresolved 线程）（证据：PR 评论线程列表全部 resolved）
- [ ] 以上七组清单无遗留未勾选项（N/A 项均有原因）（证据：本清单 §一~§七 勾选态与 N/A 注因）
- [ ] 测试报告已归档至 `reports/test_report.md`（Checkpoint 5 通过）
- [ ] 合并前复核：目标分支为约定分支，非 force-push，提交历史可追溯（命令：git log --oneline -20 与 git status --short 复核）
