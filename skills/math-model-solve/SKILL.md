---
name: math-model-solve
license: MIT
description: >-
  数学建模竞赛算法代码求解、敏感性稳健性分析与附录纯净代码工程引擎。专用于 G3 阶段：数值结果与哈希绝对冻结 (Frozen Numbers Ledger)、关键参数扰动敏感性与稳健性分析、附录代码工程纯净化（彻底封杀 print("OK") 等调试断点、严禁 AI 解释口吻）、内置不可逾越的边界防御断言 (assert) 防线、附录支撑材料清单编制。论文中彻底剔除算法大O复杂度与硬件开销等无关偏题内容；论文写作与投稿请用 math-model-paper / journal-submit
metadata:
  version: "2.1.0"
  phase: "G3: Numerical Solving, Sensitivity Testing & Clean Code Appendix"
  style: "A"
---

# 算法求解、敏感性检验与纯净代码工程引擎 (math-model-solve)

```
┌──────────────────────────────────────────────────────────────┐
│ math-model-solve · 数值求解引擎（G3）                       │
├──────────────────────────────────────────────────────────────┤
│ 铁律：结果绝对冻结，附录代码纯净化，边界断言不可逾越         │
└──────────────────────────────────────────────────────────────┘
```

本技能负责数学建模竞赛的 **代码求解、核心结果锁定、模型敏感性/稳健性检验与附录源码纯净化**。
坚决贯彻：**论文中彻底剔除算法理论复杂度分析（大 $O$ 渐近分析）与硬件测试开销（此为计算机算法考题，非数学建模重点）**。将评审视线全力聚焦于“模型求解数值的精准性、结果稳健性与敏感性分析、以及附录工程代码的纯净防御度”。

---

## 输入与输出契约

| 契约项 | 内容 |
|---|---|
| 输入（上游） | `docs/G2_模型推导稿.md`（符号表 + 方程组 + 假设清单 + 微创新算子）、赛题原始/清洗数据集、待标定参数 |
| 输出（本阶段产物） | ① `state/frozen_results.json`（**唯一数值真相源**，schema 见 §1）② `code/*.py`（求解与附录纯净代码）③ 灵敏度结果（$S_p$ 表 + 三档扰动曲线数据）④ 附录支撑材料清单（模板见 §3.3） |
| 消费方 | `math-model-paper`（Round 2 逐数校验，数字须与冻结清单 100% 吻合）、`math-model-visualize`（作图数据与算法改进前后对比数据） |

**【铁律】路径基准 = 项目工作区根**，即 `<project-root>/state/frozen_results.json`、`<project-root>/code/*.py`；**不是** skill 目录，也不是脚本目录。本文件中一切相对路径均相对项目工作区根。

---

## 1. 结果绝对冻结契约 (Frozen Numbers Ledger)

在进入论文写作与图表排版前，所有求解出的核心数值结果必须按 CANON §3.4 的完整 schema 静态落盘，字段缺一不可：

```json
{
  "schema_version": "1.0",
  "frozen_at": "YYYY-MM-DDTHH:MM:SS",
  "hash_sha256": "<本文件规范化序列化后的 sha256>",
  "metrics": [
    {
      "id": "obj_total_cost",
      "label": "总成本",
      "value": 123456.78,
      "unit": "元",
      "precision": 2,
      "code_ref": "code/solve_main.py:compute_cost",
      "sensitivity": { "p1": "+/-5%", "sp": 0.42 }
    }
  ],
  "decisions": [
    { "id": "x_mean", "value": 12.3, "unit": "kg", "precision": 1 }
  ],
  "figures": [
    { "id": "fig_03", "path": "figs/fig_03_convergence.png" }
  ]
}
```

**【占位符声明】** 上例中 `frozen_at` 的 `YYYY-MM-DDTHH:MM:SS` 与 `hash_sha256` 的 `<本文件规范化序列化后的 sha256>` 均为**占位符**：实际使用时必须分别替换为真实时间戳与真实哈希，**禁止原样落盘**（机检项，见 `## scripts/ 使用说明` 的 `--check-required`）。

### 1.1 字段表（与 `<project-root>/state/frozen_results.schema.json` 逐字段一致）

| 字段 | 类型 | 所属 | 说明 |
|---|---|---|---|
| `schema_version` | string | 顶层 | 固定 `"1.0"` |
| `frozen_at` | string | 顶层 | 冻结落盘时间戳 `YYYY-MM-DDTHH:MM:SS` |
| `hash_sha256` | string | 顶层 | 规范化 JSON 的 SHA-256，64 位小写十六进制 |
| `metrics[].id` | string | metrics | 指标唯一标识，如 `obj_total_cost` |
| `metrics[].label` | string | metrics | 中文标签，如 `总成本` |
| `metrics[].value` | number | metrics | 目标值/性能指标数值 |
| `metrics[].unit` | string | metrics | 物理单位，如 `元`、`kg` |
| `metrics[].precision` | integer | metrics | 论文与图注中保留的小数位数 |
| `metrics[].code_ref` | string | metrics | 代码出处 `code/<file>.py:<function>` |
| `metrics[].sensitivity` | object | metrics | 灵敏度记录 `{ "p1": "+/-5%", "sp": 0.42 }`，`sp` 即 $S_p$ |
| `metrics[].sensitivity.p1` | string | metrics | 扰动参数与档位标记，如 `±5%`（JSON 内写 `"+/-5%"`，三档 ±5%、±10%、±20%） |
| `metrics[].sensitivity.sp` | number | metrics | 灵敏度系数 $S_p$，数值型，≥0 |
| `decisions[].id` | string | decisions | 决策变量唯一标识，如 `x_mean` |
| `decisions[].value` | number | decisions | 决策变量取值 |
| `decisions[].unit` | string | decisions | 物理单位 |
| `decisions[].precision` | integer | decisions | 保留的小数位数 |
| `figures[].id` | string | figures | 图件编号，如 `fig_03` |
| `figures[].path` | string | figures | 相对项目根的图件路径 `figs/fig_XX_<slug>.png` |

`decisions` 与 `figures` **不含** `label` / `code_ref` / `sensitivity` 字段；**必填口径**（CANON §3.4，缺一即校验失败）：
① 顶层 6 字段（`schema_version`、`frozen_at`、`hash_sha256`、`metrics`、`decisions`、`figures`）**全部必填**；
② `metrics` **至少 1 条**；
③ `metrics[].id` 在**全文件范围内唯一**，且与 `decisions[].id` **不得撞号**；
④ `sensitivity` 必须**同时含 `p1`（扰动档位）与 `sp`（灵敏度系数）两个键**，缺一即不合格。
机器校验一律以 `state/frozen_results.schema.json` 为准；必填项 + 结构 + 哈希联合机检通过 `scripts/frozen_check.py --check-required --verify-hash --list` 执行（相对本技能目录；`state/`、`paper/` 相对项目工作区根，详见 `## scripts/ 使用说明`）。

### 1.2 哈希协议（强制，不可省略）

1. **写入时**：对“**除去 `hash_sha256` 字段本身**后的规范化 JSON”（`sort_keys=True`、`separators=(",",":")`、`ensure_ascii=False`）按 **UTF-8 编码**（`encode("utf-8")` 后摘要）计算 SHA-256，回填到 `hash_sha256`；
2. **校验时机**：① 冻结落盘后**立即自校验**（写入方当场重算比对，执行 `math-model-solve/scripts/frozen_check.py --verify-hash`）；② **G6 终检时由本技能执行重算**（重算主体 = `math-model-solve`，不得写成由 `math-model-paper` 重算），`math-model-paper` Round 2 复核比对，`math-modeling-master` 抽查；
3. **不匹配 → 判定 CB-7 失败**，打回重新冻结，冻结清单未修复前论文与图件一律禁止引用该批数值。

```python
import hashlib, json

path = "state/frozen_results.json"  # 相对项目工作区根
obj = json.load(open(path, encoding="utf-8"))
norm = json.dumps({k: v for k, v in obj.items() if k != "hash_sha256"}, sort_keys=True, separators=(",",":"), ensure_ascii=False)
digest = hashlib.sha256(norm.encode("utf-8")).hexdigest()
```

**【绝对一致性铁律】** 论文正文每一处陈述的数字、表格填报数据、图注中的数值，必须与该清单保持严格 100% 吻合。一旦修改代码或参数导致数值变动，**更新顺序**：改数值 → **先**更新本清单并重算哈希 → **再**级联更新论文/图件，严禁反向。

---

## 2. 关键参数扰动敏感性与稳健性分析（核心替代重点）

数学建模评阅极其看重模型在现实波动环境下的稳健表现，用**敏感性与稳健性分析**彻底替代无意义的复杂度剖析：

### 2.1 关键外生参数扰动测试
- 选取模型中的 2~4 个核心敏感参数（如单位成本、弹性系数、外部阻尼、需求波动率等）；
- 对参数施加 ±5%、±10%、±20% 的受控扰动，重新求解目标函数值与关键决策变量；
- 统计目标函数的变化率，计算局部灵敏度系数：
  $$S_p = \left| \frac{\Delta \mathcal{J} / \mathcal{J}_0}{\Delta p / p_0} \right|$$

### 2.2 稳健性可视化与结论呈现
- 绘制敏感性分析曲线或雷达图，直观展现目标函数在参数摄动下的平缓或陡峭区间；
- 给出明确的工程/管理结论：证明模型在合理扰动范围内表现出良好的鲁棒性（Robustness），指出对系统影响最剧烈的瓶颈参数，为最终策略建议提供量化依据。

### 2.3 算法改进前后对比数据供给（承接 CB-9 第②处）
**【强制】核心算法改进处必须保留两组目标值/指标**：`Baseline`（改进前）与 `Primary`（改进后），各自的目标值、关键决策变量与 $S_p$ 均需登记进 `state/frozen_results.json` 的 `metrics`（用不同 `id` 区分，如 `obj_total_cost_baseline` / `obj_total_cost_primary`），供 `math-model-visualize` 生成 Before-vs-After 对比图组（CB-9 第②处）；只给改进后一组数据即视为未承接 CB-9。

---

## 3. 附录代码绝对工程纯净化规范

### 3.1 肃清 AI 代码痕迹
- ❌ **严禁一切 AI 教学与对话式文字注释**：严禁出现 `# 这里我们定义一个函数处理数据`、`# 注意：这个步骤非常关键` 等口语；
- ✅ **仅保留以下四类必要专业技术注释**（白名单，超出即判不纯净）：
  1. 函数参数量纲签名注释；
  2. 图表编号对应注释（如 `# Figure 4: Pareto Front`）；
  3. 超参数常数定义注释；
  4. **边界校验与状态不变量说明类技术注释**（例：`# 实时状态边界校验`）——§3.2 示例中的该行注释属第 4 类，**合规**；
- ❌ **彻底封杀调试断点**：绝对禁止 `print("OK")`、`print("done")`、`print("test")`、`print(1)` 等大模型调试占位符，仅保留生产级格式化指标输出。

### 3.2 设立不可逾越的边界防御防线 (Defensive Programming)
在核心算法与状态转移处，内置显式 `assert` 断言防线，防止非法解逃逸：

```python
import numpy as np


def simulate_inventory_replenishment(demand_series, unit_cost, capacity_limit):
    """
    Returns order plan and total ordering cost under myopic replenishment rule.
    Demand beyond available stock plus one period of capacity is recorded as
    lost sales instead of driving inventory negative.
    Parameters:
        demand_series (np.ndarray): Historical demand, shape (T,).
        unit_cost (float): Cost coefficient, must be > 0.
        capacity_limit (float): Physical limit, must be > 0.
    Returns:
        tuple[np.ndarray, np.ndarray, float]: Order plan, lost-sales record,
        and total ordering cost.
    """
    assert demand_series.ndim == 1, "Demand must be 1-D."
    assert np.all(demand_series >= 0), "Boundary Violation: Demand must be non-negative."
    assert unit_cost > 0, f"unit_cost must be > 0, got {unit_cost}"
    assert capacity_limit > 0, f"capacity_limit must be > 0, got {capacity_limit}"

    T = len(demand_series)
    inventory = np.zeros(T + 1)
    orders = np.zeros(T)
    lost_sales = np.zeros(T)

    for t in range(T):
        orders[t] = min(max(0.0, demand_series[t] - inventory[t]), capacity_limit - inventory[t])
        shortage = max(0.0, demand_series[t] - (inventory[t] + orders[t]))
        lost_sales[t] = shortage
        inventory[t + 1] = inventory[t] + orders[t] - demand_series[t] + shortage
        # 实时状态边界校验
        assert -1e-9 <= inventory[t + 1] <= capacity_limit + 1e-9, (
            f"State Out of Bound at step {t}: {inventory[t+1]}"
        )

    return orders, lost_sales, float(np.sum(orders * unit_cost))
```

**断言不变量**：任一时刻库存恒满足 `0 <= inventory[t+1] <= capacity_limit`（上下界容差对称 $\pm 10^{-9}$）；`shortage` 把超出“现有库存 + 当期可补产能”的需求截断为缺货记录，使断言在**正常 / 需求超产能 / 零需求**三类场景下均不触发。

### 3.3 规范编制附录支撑材料清单 (Supporting Materials Table)
正文最后或附录首部，必须附上规范的支撑材料清单（代码脚本名称、数据表、大小、用途说明），展现严密的科研复现度。模板（四列，逐行填写，不许留空）：

| 代码脚本名称 | 数据表 | 大小 | 用途说明 |
|---|---|---|---|
| `code/solve_main.py` | `state/frozen_results.json` | 12 KB / 340 行 | 主求解入口，产出冻结清单 metrics 与 decisions |
| `code/sensitivity_perturb.py` | `state/frozen_results.json` | 8 KB / 210 行 | 2~4 个参数 × ±5%、±10%、±20% 扰动重求解，产出 $S_p$ 表 |
| `code/plot_sensitivity.py` | `code/sensitivity_perturb.csv` | 6 KB / 150 行 | 灵敏度曲线与雷达图数据整理 |

填写规则：“**大小**”用 **KB 或行数**（如 `12 KB`、`340 行`、`12 KB / 340 行`）；“**代码脚本名称**”路径一律相对项目根 `code/`，“**数据表**”路径一律相对项目根（如 `state/`、`figs/`）。

---

## scripts/ 使用说明

本技能自带机检脚本 `math-model-solve/scripts/frozen_check.py`（仅标准库，协议出处 §1.2 哈希协议与 §1 字段表）。**两种路径基准不得混用**：

| 路径片段 | 路径基准 |
|---|---|
| `math-model-solve/scripts/frozen_check.py` | 相对**项目工作区根**（从项目根调用的写法） |
| `<skill-dir>/scripts/frozen_check.py` | `<skill-dir>` 相对**本技能目录**（在技能目录内调用的写法） |
| `state/`、`paper/`（含 `--file` 默认值与 `--tex` 参数值） | 相对**项目工作区根** |

**参数说明**：

- `--check-required`：按 CANON §3.4 校验**必填项**（顶层 6 字段全部必填；`metrics` 至少 1 条；`metrics[].id` 全文件唯一且与 `decisions[].id` 不撞号；`sensitivity` 同时含 `p1` 与 `sp`；占位符 `YYYY-MM-DDTHH:MM:SS` / `<本文件规范化序列化后的 sha256>` 已替换），逐条打印不合格项并输出 `REQUIRED OK` / `REQUIRED FAIL`；
- `--verify-hash`：按 §1.2 哈希协议重算 SHA-256 并与文件内 `hash_sha256` 比对，输出 `HASH OK` / `HASH MISMATCH`（**哈希自校验**）；
- `--list`：表格列出全部 `metrics` / `decisions`（id / label / value / unit / precision），与 `--verify-hash` 连用即**结构与哈希联合机检**；
- `--tex paper/main.tex`：扫描论文正文数字与冻结值的粗匹配（**正文数字比对**，宽松启发式，只出 warning、不计入退出码）；
- `--file state/frozen_results.json`：显式指定冻结清单（默认值即此，相对项目工作区根）。

**调用示例**（从项目工作区根执行）：

```bash
python math-model-solve/scripts/frozen_check.py --verify-hash
python math-model-solve/scripts/frozen_check.py --check-required --verify-hash --list
python math-model-solve/scripts/frozen_check.py --tex paper/main.tex
```

**执行时机**：G3 冻结落盘后**立即**执行 `--check-required --verify-hash` 自校验；**G6 终检时由本技能执行重算**，`math-model-paper` Round 2 复核比对，`math-modeling-master` 抽查。

**退出码**：`0` = 通过（`--tex` 可带 warning）；`1` = 哈希不匹配**或必填项不合格**（均触发 CB-7 打回）；`2` = 文件缺失 / JSON 非法 / 参数错误。

---

## 本阶段须通过的门禁

**【G6 被召回声明】** G6 终检由 `math-model-paper` 主责发起召回，本技能被召回执行 CB-6/CB-7 与哈希重算（`math-model-solve/scripts/frozen_check.py` 重算由本技能执行，`math-model-paper` Round 2 复核比对，`math-modeling-master` 抽查）。

```
+--------+-----------------------------------------------+------------------------------------------+--------------------------------------------------+
| 编号   | 判定条件（可勾选）                            | 执行点                                   | 不达标回退                                       |
+--------+-----------------------------------------------+------------------------------------------+--------------------------------------------------+
| CB-6   | 2~4 个核心参数 × ±5%、±10%、±20% 扰动重求解； | G3 完成时 + G6 终检（solve 被召回复核）  | 打回 G3 补扰动实验                               |
|        | 给出灵敏度系数 S_p 与瓶颈参数；               |                                          |                                                  |
|        | 正文零出现大 O 复杂度/硬件跑分                |                                          |                                                  |
+--------+-----------------------------------------------+------------------------------------------+--------------------------------------------------+
| CB-7   | 附录代码零 AI 对话式注释、零 print("OK" 等)； | G3 冻结落盘自校验 + G6 终检              | 打回 G3/G6 净化；                                |
|        | 核心算法与状态转移内置 assert；               |                                          | 哈希不一致时打回 G3 重新冻结                     |
|        | 含支撑材料四列清单；哈希重算比对一致          |                                          |                                                  |
+--------+-----------------------------------------------+------------------------------------------+--------------------------------------------------+
| CB-9   | 核心算法改进处提供 Baseline 与 Primary 两组   | G4 出图自检 + G6 终检                    | 供数据方（G1/G3）未按时交付对比数据 →            |
|        | 目标值/指标（第②处，供 Before-vs-After 对比） |                                          | 打回对应阶段补数据（本技能侧判据：未按时交付     |
|        |                                               |                                          | `*_baseline`/`*_primary` 双组指标 → 打回 G3）；  |
|        |                                               |                                          | 数据齐备但图件缺失/不合规 → 打回 G4 补图         |
+--------+-----------------------------------------------+------------------------------------------+--------------------------------------------------+
```

- **CB-6（稳健性与去复杂度 · 三档扰动 + $S_p$）**：判定条件 = 三档扰动重求解与 $S_p$ 表缺任一项即失败；执行点 = `G3 完成时 + G6 终检`（两级：G3 阶段自检 + G6 终检）；**责任 skill = `math-model-solve`**；回退目标 = 打回 G3 补扰动实验；G6 一级由本技能被召回复核执行；
- **CB-7（代码纯净 + 断言 + 哈希）**：判定条件 = `hash_sha256` 重算不匹配、`assert` 缺失、白名单外注释、四列清单缺失，任一即失败；执行点 = `G3 冻结落盘自校验 + G6 终检`（两级：G3 阶段自检 + G6 终检）；**责任 skill = `math-model-solve`**（**G6 终检时由本技能执行重算**，`math-model-paper` Round 2 复核比对，`math-modeling-master` 抽查）；回退目标 = 打回 G3/G6 净化，哈希不一致时打回 G3 重新冻结；
- **CB-9（供算法改进前后数据）**：判定条件 = 第②处 Baseline 与 Primary 双组指标齐备；执行点 = `G4 出图自检 + G6 终检`（两级：G4 出图自检 + G6 终检）；**责任 skill = `math-model-solve`（供算法改进前后数据）** + `math-model-visualize`（出图）+ `math-model-decomp`（供清洗前后数据）；回退目标 = 供数据方（G1/G3）未按时交付对比数据 → 打回对应阶段补数据；数据齐备但图件缺失/不合规 → 打回 G4 补图。
- 本技能的门禁触发记录由总控写入 `state/gate_log.jsonl`，供 `math-model-strategy`(G7) 审计。
