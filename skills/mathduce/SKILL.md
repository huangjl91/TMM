---
name: mathduce
description: >-
  数学建模竞赛论文全流程复现引擎。专用于 G3→G4→G5→G6 阶段：冻结清单数据溯源与哈希重算、
  图件脚本一键再生成与逐点比对、LaTeX 论文数值双向回溯、四轮评审召回与五维复现度评分卡签发；
  确保同一赛题论文的每一个数字都能被独立脚本复算并逐位对齐，实现「一条命令、干净环境、
  逐位一致」的可复现交付。需要首次求解与冻结清单生成请用 matholve；图件首次绘制请用 mathualize；
  论文首次排版请用 mathaper；导出投稿材料请用 journalmit。
license: MIT
metadata:
  version: "1.0.0"
  phase: "G3→G4→G5→G6: Full Pipeline Reproducibility"
  style: "A"
---

# mathduce · 数学建模论文全流程复现引擎

> **专用于 G3→G4→G5→G6 阶段**：把一份已完成的竞赛论文，还原为「可被第三方在一台干净机器上、
> 用一条命令重跑出逐位一致结果」的可复现制品。本技能**不负责首次建模与首次求解**，
> 只负责 **复现 · 比对 · 召回 · 签发** 四件事。

```
┌──────────────────────────────────────────────────────────────────────────┐
│ mathduce · 数学建模论文全流程复现引擎  (G3 → G4 → G5 → G6)           │
├──────────────────────────────────────────────────────────────────────────┤
│ 输入 : docs/G1_剖析卡.md · state/frozen_results.json                    │
│        code/*.py · figs/fig_*.png · paper/main.tex · references/      │
│ 输出 : review/reproduce_report.md · reproduce/reproduce.sh              │
│        review/G6_复现度评分卡.md · state/gate_log.jsonl (append)        │
│ 防线 : 五维复现度评分卡 + 三层数值逐位比对 + 四轮评审召回                │
│ 铁律 : 论文与图件的每一个数字，都必须可由脚本一键重算并逐位比对          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 【铁律】总纲

- **【铁律】唯一真相源**：`state/frozen_results.json` 是全库唯一数值真相源。论文正文、图件、
  附录三者中的任何一个数字，都必须能被它重算出来；不一致即熔断。
- **【铁律】零手改**：复现过程中**严禁手工修改论文中的任何数字**去迁就复现结果；
  必须回到源头修正（先修数据源，再级联重生成下游）。
- **【铁律】一条命令**：任何一次复现，都必须能由 `reproduce/reproduce.sh` 在干净环境中一键触发，
  禁止依赖人工记忆的零散步骤。
- **【铁律】可证伪**：复现报告必须给出可证伪的判定（一致 / 部分一致 / 不可复现），
  并附上每一条差异的具体位置与数值。
- **【铁律】双基准分离**：`<project>`（运行时产物）与 `<skill>`（规范件）两套基准严禁互相套用。
- **【严禁】伪复现**：严禁把论文数值硬编码进脚本冒充复现；脚本必须从源数据出发重新计算。
- **【严禁】AI 解释口吻**：复现报告与附录代码中严禁出现「我们可以看到」「值得注意的是」等主观叙述。
- **【严禁】调试残留**：严禁 `print("OK")`、`TODO`、注释掉的整段旧代码进入交付脚本。

---

## §0 使用场景与不适用场景

| 场景 | 是否适用 | 说明 |
|---|---|---|
| 论文已写完，需验证可复现 | ✅ 适用 | 本技能核心场景 |
| 需要给评委/合作者交付复现包 | ✅ 适用 | 产出 reproduce/ 完整包 |
| 发现论文数字可能有误需回溯 | ✅ 适用 | 双向子集比对定位差异 |
| 赛前演练复现流程 | ✅ 适用 | 用往届题做端到端演练 |
| 首次建模、首次求解 | ❌ 不适用 | 用 mathcomp / mathulate / matholve |
| 首次画图 | ❌ 不适用 | 用 mathualize |
| 首次排版论文 | ❌ 不适用 | 用 mathaper |
| 纯投稿格式与审稿回复 | ❌ 不适用 | 用 journalmit |

---

## §1 输入与输出契约

### 1.1 输入制品

| 制品 | 路径基准 | 必需 | 说明 |
|---|---|---|---|
| `docs/G1_剖析卡.md` | 项目工作区根 `<project>` | 是 | G1 解构产物，提供变量定义与数据来源 |
| `state/frozen_results.json` | 项目工作区根 `<project>` | 是 | 唯一数值真相源，含 hash_sha256 |
| `code/*.py` | 项目工作区根 `<project>` | 是 | 求解与绘图脚本 |
| `figs/fig_*.png` | 项目工作区根 `<project>` | 是 | 图件产物 |
| `paper/main.tex` | 项目工作区根 `<project>` | 是 | 论文源文件 |
| `references/*.md` | skill 仓库根 `<skill>` | 否 | 参考文献同版匹配规范 |

### 1.2 输出制品

| 制品 | 路径基准 | 说明 |
|---|---|---|
| `review/reproduce_report.md` | 项目工作区根 `<project>` | 复现报告（逐项 diff 结论） |
| `reproduce/reproduce.sh` | 项目工作区根 `<project>` | 一键复现脚本 |
| `review/G6_复现度评分卡.md` | 项目工作区根 `<project>` | 五维复现度评分 |
| `state/gate_log.jsonl` | 项目工作区根 `<project>` | 门禁日志（append，九字段） |

**【铁律】路径基准**：凡出现相对路径必须显式标注基准；`<project>` 与 `<skill>` 两套基准严禁互相套用。

---

## §2 阶段路由与复现流程（G3 → G4 → G5 → G6）

```
        ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
        │   G3     │──▶│   G4     │──▶│   G5     │──▶│   G6     │
        │ 数据溯源  │   │ 图件复现  │   │ 论文复现  │   │ 质检召回  │
        └──────────┘   └──────────┘   └──────────┘   └──────────┘
             │              │              │              │
        hash重算+diff   脚本重跑+像素diff  数值双向比对    四轮评审
```

### 2.1 G3 · 数据溯源层复现（6 步）

```
[1] 读取 state/frozen_results.json
[2] 重算哈希: json.dumps(obj, sort_keys=True, separators=(",",":"), ensure_ascii=False)
              → UTF-8 → SHA-256 (64 位小写十六进制)
[3] 比对 hash_sha256 字段 (该字段自身排除在哈希输入外)
[4] 重跑 code/*.py 求解脚本, 逐 metric 比对数值 (rtol=1e-9)
[5] 重跑 sensitivity ±5% 扰动, 复核 p1 与 sp 灵敏度系数
[6] 随机种子固定性检查: 全库检索 seed 调用
```

**关键断言**：`assert recomputed_hash == stored_hash`；`assert np.allclose(a, b, rtol=1e-9)`。
**产物**：`review/reproduce_report.md` 的「§2 冻结清单哈希」段。

### 2.2 G4 · 图件层复现（5 步）

```
[1] 解析 figs/ 下每个 fig_*.png 的生成脚本归属
[2] 在干净环境重跑绘图脚本 → figs_repro/fig_*.png
[3] 数值比对: 读取两图底层数据数组, 逐点 diff
[4] 像素比对: 相同 matplotlib 版本下, 允许 <0.1% 像素差异(抗锯齿)
[5] 元数据比对: DPI ≥ 300, 字体嵌入, 尺寸一致
```

**产物**：`review/reproduce_report.md` 的「§3 图件复现」表。

### 2.3 G5 · 论文层复现（5 步）

```
[1] 提取 paper/main.tex 中所有数值 token (正则: 小数 与 百分数)
[2] 从 frozen_results.json 重算应有数值集合
[3] 双向比对: 论文数值 ⊆ 复算数值  且  复算数值 ⊆ 论文数值
[4] LaTeX 编译: xelatex → main.pdf, 检查 0 error / 0 undefined ref
[5] 参考文献同版匹配: 作者/版次/年份三者必须同源
```

**产物**：`review/reproduce_report.md` 的「§4 论文数值回溯」表。

### 2.4 G6 · 质检层复现（四轮评审召回）

| 轮次 | 主体 | 动作 | 通过条件 |
|---|---|---|---|
| Round 1 | 自检 | 复现脚本自跑 + 断言全过 | 0 FAIL |
| Round 2 | 同行评审 | 独立复跑者按报告重跑 | 逐项一致 |
| Round 3 | 专家复核 | 复现度评分卡五维打分 | 各维 ≥ 阈值 |
| Round 4 | 签发 | 生成 `review/G6_复现度评分卡.md` | 五维全过 |

---

## §3 十二项熔断门禁 CB-1 ~ CB-12（复现视角四要素）

| 门禁 | 判定条件 | 执行点 | 责任 skill | 回退目标 |
|---|---|---|---|---|
| CB-1 | 选题五维评分卡 ≥ 阈值 | G0 收口 | strategy | G0 重做 |
| CB-2 | 图件命名/DPI/空目录 lint PASS | G4 收口 | mathualize | G4 重画 |
| CB-3 | 图件与结论一致 | G4 收口 | mathualize | G4 重画 |
| CB-4 | 变量可达性表完整 | G1 收口 | mathcomp | G1 重做 |
| CB-5 | 方程组/符号表一致 | G2 收口 | mathulate | G2 重做 |
| CB-6 | 求解收敛性达标 | G3 收口 | matholve | G3 重解 |
| CB-7 | **冻结清单哈希一致** | G3 收口 | matholve | G0 重选题 |
| CB-8 | figure_lint.py PASS | G4 收口 | mathualize | G4 重画 |
| CB-9 | Before–After 对比图组齐备 | G4 收口 | mathualize | G4 重画 |
| CB-10 | **论文数值与冻结清单逐项一致** | G5 收口 | mathaper | G5 重写 |
| CB-11 | 机理微创新可复算 | G2 收口 | mathulate | G2 重推 |
| CB-12 | 反上帝视角与元语言检查 | G6 收口 | mathingaster | 对应阶段重做 |

**复现高危险门禁**：CB-7（哈希）、CB-10（数值一致）——任一 FAIL 必须打回源头，
**禁止在下游「补数字」**。

---

## §4 检查点与回退协议

任一门禁 FAIL 时，严格按四步执行：

1. `mathingaster` 执行 CB 判定，输出失败项清单与修复命令。
2. 向 `state/gate_log.jsonl` append 一条记录，九字段 schema：
   `{ts, gate, phase, verdict, round, action, root_cause_phase, target_phase, note}`
3. 总控打回 `root_cause_phase` 对应阶段重做。
4. 回退后**重新运行上游全部门禁**，不静默通过。

```json
{"ts":"2026-09-27T19:40:00","gate":"CB-10","phase":"G5","verdict":"FAIL",
 "round":2,"action":"rebuild_paper_numbers","root_cause_phase":"G3",
 "target_phase":"G3","note":"论文表3数值与frozen_results.json差0.7%"}
```

---

## §5 核心质量红线（独立于 CB 的额外禁令）

1. **【严禁】论文数值与 `frozen_results.json` 不一致**——哪怕差 0.01 也算熔断。
2. **【严禁】图件无法由脚本重生成**——交付的每一张图必须有对应脚本与固定种子。
3. **【严禁】附录代码含调试语句或 AI 解释口吻**——只保留可运行、可断言的生产代码。
4. **【严禁】随机过程未固定种子**——凡涉及随机采样/初始化的环节，种子必须显式写出。
5. **【严禁】路径硬编码到个人机器**——脚本内一律使用相对路径或环境变量。
6. **【铁律】复现报告必须给出「可复现性判定」结论**——一致 / 部分一致（列出差异项）/
   不可复现，三选一，不得含糊。

---

## §6 本阶段须通过的门禁

- **G3 收口**：CB-6（收敛）、CB-7（哈希一致）
- **G4 收口**：CB-2、CB-3、CB-8、CB-9（图件四连）
- **G5 收口**：CB-10（论文数值一致）
- **G6 收口**：CB-12（反上帝视角）+ 复现度评分卡五维全过

---

## §7 与其他技能的衔接

| 上游技能 | 交付给本技能的制品 | 本技能动作 |
|---|---|---|
| `mathcomp` (G1) | `docs/G1_剖析卡.md` | 校验变量定义可复算 |
| `mathulate` (G2) | 模型方程组 / 符号表 | 校验机理可重推 |
| `matholve` (G3) | `state/frozen_results.json` | 重算哈希 + 数值 diff |
| `mathualize` (G4) | `figs/fig_*.png` | 重跑绘图脚本 + 图 diff |
| `mathaper` (G5/G6) | `paper/main.tex` | 数值回溯 + 编译复核 |

| 下游技能 | 本技能交付物 | 用途 |
|---|---|---|
| `mathingaster` | `review/reproduce_report.md` | 总控签发依据 |
| journalmit | 可复现性声明段落 | 投稿材料附件 |
| bizytics | 复现方法论模板 | 分析脚本可复现校验 |

```
     mathcomp ─▶ mathulate ─▶ matholve ─▶ mathualize ─▶ mathaper
                              │         │          │
                              └─────────┴──────────┘
                                        ▼
                                 【 mathduce 】
                                        │
                                        ▼
                                  mathingaster 签发
```

---

## §8 端到端复现工作流（示例）

```
[Step 0] 冻结快照      git tag g3rozen && git archive -o repro_src.tar
[Step 1] 环境隔离      python -m venv .venv && pip install -r requirements.txt
[Step 2] 数据溯源      python code/frozen_check.py --check        # CB-7
[Step 3] 重跑求解      python code/solve_main.py                 # CB-6
[Step 4] 图件复现      python code/make_figs.py && python code/fig_diff.py
[Step 5] 论文回溯      python code/tex_num_extract.py && python code/paper_number_diff.py
[Step 6] 论文编译      (cd paper && xelatex -interaction=nonstopmode main.tex)
[Step 7] 评分签发      python code/repro_score.py > review/G6_复现度评分卡.md
[Step 8] 归档交付      tar -czf reproduce_pkg.tar.gz reproduce/
```

**【铁律】**：Step 2–7 中任一步返回非零，立即中止并写 `gate_log.jsonl`，不得跳步。

---

## 附录 A · 五维复现度评分卡

| 维度 | 权重 | 满分标准 | 计分 |
|---|---|---|---|
| 数据溯源度 | 25% | frozen_results 哈希可重算且一致 | 0–25 |
| 代码纯净度 | 20% | 无调试残留、无 AI 口吻、断言齐备 | 0–20 |
| 图件复用度 | 20% | 每图可一键重生成且逐点一致 | 0–20 |
| 论文数值一致度 | 25% | 论文数值与冻结清单 100% 对齐 | 0–25 |
| 评审召回完成度 | 10% | 四轮评审全过 | 0–10 |

**判定**：总分 ≥90 = 可复现；70–89 = 部分可复现（须列差异项）；<70 = 不可复现（熔断）。

---

## 附录 B · 复现失败常见根因表

| 根因 | 现象 | 检测方法 | 修复 |
|---|---|---|---|
| 随机种子未固定 | 每次结果微变 | 检索 seed 调用 | 显式 `np.random.seed(42)` |
| 库版本漂移 | 图件像素差异大 | 冻结 requirements.txt | 锁定版本 |
| 路径硬编码 | 换机即报错 | 检索绝对路径 | 改相对路径/环境变量 |
| 浮点精度 | 末位差 1e-12 | `np.allclose(rtol=1e-9)` | 统一精度，合理容差 |
| 数据版本不一致 | 结果整体偏移 | 数据文件哈希比对 | 数据纳入版本控制 |
| 手改论文数字 | 与源头不一致 | 双向子集比对 | 回源头修正再级联 |
| 隐式状态 | 依赖上次中间文件 | 干净环境重跑 | 移除隐式依赖 |
| 编码不一致 | 中文乱码 | 统一 UTF-8 | 显式指定编码 |

---

## 附录 C · 一键复现脚本设计

```bash
#!/usr/bin/env bash
# reproduce.sh — 一条命令复现全流程（G3→G4→G5→G6）
set -euo pipefail

PROJ="$(cd "$(dirname "$0")/.." && pwd)"   # 项目工作区根
cd "$PROJ"

echo "[1/5] 重算冻结清单哈希 ..."
python code/frozen_check.py --check || { echo "CB-7 FAIL"; exit 1; }

echo "[2/5] 重跑求解 ..."
python code/solve_main.py || { echo "CB-6 FAIL"; exit 1; }

echo "[3/5] 重生成图件 ..."
python code/make_figs.py   || { echo "CB-8 FAIL"; exit 1; }

echo "[4/5] 论文数值比对 ..."
python code/paper_number_diff.py || { echo "CB-10 FAIL"; exit 1; }

echo "[5/5] 编译论文 ..."
( cd paper && xelatex -interaction=nonstopmode main.tex >/dev/null ) || { echo "CB-10 FAIL"; exit 1; }

echo "REPRODUCE: PASS"
```

**【铁律】**：每个步骤失败必须 `exit 1`，禁止 `|| true` 吞错；所有中间产物落盘
`<project>/state/`。

---

## 附录 D · 复现报告模板

```markdown
# 复现报告 · <题号>

## 0. 判定结论
一致 / 部分一致 / 不可复现

## 1. 环境
- Python / 依赖版本：
- 随机种子：
- 操作系统：

## 2. 冻结清单哈希
- 存储哈希：
- 重算哈希：
- 结论：一致 / 不一致

## 3. 图件复现
| 图件 | 数值 diff | 像素 diff | 结论 |

## 4. 论文数值回溯
| 数值 token | 论文值 | 复算值 | 相对误差 | 结论 |

## 5. 差异清单
（逐条列出不一致项与根因）

## 6. 五维复现度评分
（见附录 A）
```

---

## 附录 E · 术语表

| 术语 | 释义 |
|---|---|
| 冻结清单 | `frozen_results.json`，全库唯一数值真相源 |
| 复现度 | 论文结果可被独立重算并逐位对齐的程度 |
| 双向子集比对 | 论文数值集合与复算数值集合互相包含的检查 |
| 逐位一致 | 数值在给定容差内完全相同 |
| 伪复现 | 把结果硬编码冒充复现的作弊行为 |

---

## 附录 F · 复现工具链脚本清单

| 脚本 | 职责 | 对应门禁 |
|---|---|---|
| `code/frozen_check.py` | 冻结清单哈希重算 + 必填项机检 | CB-7 |
| `code/solve_main.py` | 主求解流程（可独立重跑） | CB-6 |
| `code/make_figs.py` | 图件批量再生成 | CB-8 |
| `code/fig_diff.py` | 图件数值/像素逐点比对 | CB-9 |
| `code/fig_lint.py` | 图件命名/DPI/空目录检查 | CB-2 |
| `code/tex_num_extract.py` | 从 LaTeX 提取数值 token | CB-10 |
| `code/paper_number_diff.py` | 论文数值双向子集比对 | CB-10 |
| `code/repro_score.py` | 五维复现度评分卡生成 | CB-12 |

---

## 附录 G · 复现检查清单

| # | 检查项 | 命令 / 方法 | 通过标准 |
|---|---|---|---|
| 1 | 冻结清单存在且可解析 | `python -c "import json;json.load(open('state/frozen_results.json'))"` | 无异常 |
| 2 | 哈希可重算 | `python code/frozen_check.py --check` | 与存储值一致 |
| 3 | 求解脚本可独立跑通 | `python code/solve_main.py` | exit 0 |
| 4 | 随机种子已固定 | `grep -rn "seed" code/` | 每处随机源都有 seed |
| 5 | 依赖版本已冻结 | `cat requirements.txt` | 所有包带版本号 |
| 6 | 绘图脚本可重生成图件 | `python code/make_figs.py` | 产出 figs_repro/ |
| 7 | 图件数值逐点一致 | `python code/fig_diff.py` | 相对误差 < 1e-9 |
| 8 | 图件 DPI ≥ 300 | `python code/fig_lint.py` | 全部通过 |
| 9 | 论文数值可提取 | `python code/tex_num_extract.py` | 输出 token 列表 |
| 10 | 论文数值双向一致 | `python code/paper_number_diff.py` | 差集为空 |
| 11 | LaTeX 可零错编译 | `xelatex main.tex` | 0 error |
| 12 | 参考文献同版匹配 | 人工 + 脚本比对 | 作者/版次/年份同源 |
| 13 | 复现报告已生成 | `ls review/reproduce_report.md` | 存在且含判定 |
| 14 | 复现度评分卡已生成 | `ls review/G6_复现度评分卡.md` | 五维全过 |

---

## 附录 H · 差异诊断决策树

```
发现数值不一致
      │
      ├─ 差异是否随每次运行变化？
      │        ├─ 是 ─▶ 随机种子未固定 ─▶ 加显式 seed
      │        └─ 否 ─▶ 继续
      │
      ├─ 差异是否整体性偏移（所有数值同方向）？
      │        ├─ 是 ─▶ 数据版本不一致 ─▶ 纳入版本控制
      │        └─ 否 ─▶ 继续
      │
      ├─ 差异是否只出现在图件、论文数值正确？
      │        ├─ 是 ─▶ 绘图脚本/库版本问题 ─▶ 锁定 matplotlib 版本
      │        └─ 否 ─▶ 继续
      │
      ├─ 差异是否仅在末位（1e-12 级）？
      │        ├─ 是 ─▶ 浮点精度 ─▶ 设合理容差 rtol=1e-9
      │        └─ 否 ─▶ 继续
      │
      └─ 差异集中在某几张表 ─▶ 手改论文数字 ─▶ 回源头修正再级联重生成
```

---

## 附录 I · 复现包目录结构（交付）

```
reproduce/
├── reproduce.sh            # 一键复现入口
├── requirements.txt        # 冻结依赖版本
├── README.md               # 复现说明（环境、命令、预期输出）
├── data/                   # 输入数据快照（含哈希清单）
├── code/                   # 求解 + 绘图 + 比对脚本
├── expected/               # 期望产物（哈希清单 + 关键数值）
└── report/
    ├── reproduce_report.md # 复现报告
    └── G6_复现度评分卡.md  # 五维评分
```

**【铁律】**：复现包必须自包含——不依赖原始工作区之外的任何文件；
`expected/` 中的哈希清单用于第三方验证。

---

## 附录 J · 与 CANON 条款映射

| CANON 条款 | 本技能落点 |
|---|---|
| §1 阶段码 G0~G7 | §2 阶段路由、§3 门禁表 |
| §2 CB-1~CB-12 | §3 十二项熔断门禁 |
| §2.5 回退协议 / gate_log 九字段 | §4 检查点与回退协议 |
| §3 I/O 契约 / mount A·B | §1 输入输出契约 |
| §3.2 frozen_results 哈希协议 | §2.1 数据溯源层复现 |
| §4 数值常量唯一源 | 全文数值引用 |
| §6 漂移检测矩阵 | §7 技能衔接、附录 F 工具链 |

---

## 附录 K · 复现度提升路线图

| 阶段 | 当前 | 目标 | 关键动作 |
|---|---|---|---|
| L1 可运行 | 脚本能跑 | 脚本能跑 | 固定种子、冻结依赖 |
| L2 可重算 | 结果能重算 | 结果能重算 | 数据溯源、哈希冻结 |
| L3 可对齐 | 数值逐位一致 | 数值逐位一致 | 双向子集比对 |
| L4 可交付 | 复现包自包含 | 复现包自包含 | 归档 + 说明 + 期望值 |
| L5 可第三方验证 | 他人能独立复现 | 他人能独立复现 | 四轮评审召回 |

---

## 附录 L · 版本谱系

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0.0 | 2026-09-27 | 首版：G3→G4→G5→G6 全流程复现 + 五维评分卡 + 四轮召回 |

---

> **权威条款**：本技能对复现的判定以 `scripts/CANON.md` 为准；如与子技能描述冲突，
> 一律以 CANON 为准。
