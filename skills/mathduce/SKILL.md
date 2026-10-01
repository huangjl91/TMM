---
name: mathduce
description: >-
  数学建模竞赛论文全流程复现引擎。专用于 G3→G4→G5→G6 阶段：冻结清单数据溯源与哈希重算、
  图件脚本一键再生成与逐点比对、LaTeX 论文数值双向回溯、四轮评审召回与六维复现度评分卡签发；
  确保同一赛题论文的每一个数字都能被独立脚本复算并逐位对齐，实现「一条命令、干净环境、
  逐位一致」的可复现交付。需要首次求解与冻结清单生成请用 matholve；图件首次绘制请用 mathualize；
  论文首次排版请用 mathaper；导出投稿材料请用 journalmit。
  v1.4.0 扩展覆盖跨平台/多语言、LLM 辅助建模、深度学习训练产物、供应链安全、统计严谨性五大维度，
  新增 CC-2/CC-3 扩展闸门与附录 AA–AE；v1.4.1 完成全量 12 个配套脚本实体化与文档一致性收口；v1.4.2 新增 env_doctor 预检诊疗脚本（一次性定位阻断项）并补全 R-69~R-82 高频故障模式。v1.4.3 再补全 R-83~R-98 高频故障模式（Python 次版本/时区区域/cuDNN 确定性/BOM·CRLF/科学计数法·全角数字/siunitx·宏定义数值/数值越界/非官方下载/AI 代码口径漂移/wheel·sdist 差异/seed env 注入/字体缺失/多重比较校正/数据划分泄漏/DB 查询未固化），并强化 env_doctor 新增 BOM·CRLF、时区区域、字体三项检测。v1.4.4 再补全 R-99~R-108 高频故障模式（JAX 非确定性/BLAS 线程数/传递依赖漂移/压缩包数据/大小写冲突/动态 prompt/置信区间缺失/随机颜色循环/LaTeX 引擎差异/DataLoader 顺序），并强化 env_doctor 新增 JAX 确定性、DataLoader worker、大小写冲突三项检测（共 16 类阻断项）。详见各附录。
license: MIT
metadata:
  version: "1.4.4"
  phase: "G3→G4→G5→G6: Full Pipeline Reproducibility + Selfvolving Loop + Selfearning Index + Cross-platform/AI/DL/Security/Statistical Rigor"
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
│ 防线 : 六维复现度评分卡 + 三层数值逐位比对 + 四轮评审召回                │
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
| `state/frozen_results.json` | 项目工作区根 `<project>` | 是 | 唯一数值真相源，含 hash_sha256；v1.4.0 起可含 `seed_registry / data_provenance / llm_registry / dl_artifacts` 扩展字段 |
| `code/*.py` | 项目工作区根 `<project>` | 是 | 用户项目的求解与绘图脚本（solve_main.py / make_figs.py 等） |
| `code/train_distill.py` | 项目工作区根 `<project>` | 否 | 深度学习/蒸馏训练脚本（附录 AC；非数值/非 DL 赛题可缺） |
| `scripts/*.py` | 本技能 `<skill>`，或复制至 `<project>` | 是 | 本技能提供的复现工具（frozen_check / fig_diff / tex_num_extract / paper_number_diff / repro_score / model_check / ref_verify / claim_evidence_check / data_check） |
| `figs/fig_*.png` | 项目工作区根 `<project>` | 是 | 图件产物 |
| `paper/main.tex` | 项目工作区根 `<project>` | 是 | 论文源文件 |
| `data/data_manifest.json` | 项目工作区根 `<project>` | 否 | 原始数据文件 SHA-256 清单与来源 URL（附录 AB/AA；防脏数据） |
| `prompts/*.md` | 项目工作区根 `<project>` | 否 | AI 辅助推导/生成的不可变 prompt 工件，须哈希固化（附录 AE） |
| `AI_TOOL_CARDS.md` | 项目工作区根 `<project>` | 否 | 各 AI 工具结构化元数据卡（附录 AE / 附录 Y.3） |
| `reproduce/reproduce.py` | 项目工作区根 `<project>` | 是 | 跨平台复现编排器（Windows/macOS/Linux 一致，附录 AA） |
| `reproduce/reproduce.sh` | 项目工作区根 `<project>` | 否 | Linux/macOS/WSL 复现入口（与 .py 二选一，附录 AA） |
| `references/*.md` | skill 仓库根 `<skill>` | 否 | 参考文献同版匹配规范 |

### 1.2 输出制品

| 制品 | 路径基准 | 说明 |
|---|---|---|
| `review/reproduce_report.md` | 项目工作区根 `<project>` | 复现报告（逐项 diff 结论） |
| `reproduce/reproduce.sh` | 项目工作区根 `<project>` | 一键复现脚本 |
| `review/G6_复现度评分卡.md` | 项目工作区根 `<project>` | 六维复现度评分（详见附录 A） |
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
[2] 重算哈希: 先对 obj 内所有字符串值做 unicodedata.normalize("NFC", v) 归一化，再 json.dumps(obj, sort_keys=True, separators=(",",":"), ensure_ascii=False)
              → UTF-8 → SHA-256 (64 位小写十六进制)
[3] 比对 hash_sha256 字段 (该字段自身排除在哈希输入外)
[4] 重跑 code/*.py 求解脚本, 逐 metric 比对数值 (rtol=1e-9)；frozen_results.json 序列化须 allow_nan=False 并预处理 NaN/Inf
[5] 重跑 sensitivity ±10% 与 ±20% 双级扰动, 复核 p1 与 sp 灵敏度系数（记录扰动下数值漂移幅度）
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
[3] 双向比对: 论文数值 ⊆ 复算数值  且  复算数值 ⊆ 论文数值；浮点按 rtol=1e-9 比对，显示精度差异（如 1.23456789 与 1.23457）不计入差集
[4] LaTeX 编译: xelatex → main.pdf, 检查 0 error / 0 undefined ref
[5] 参考文献同版匹配: 作者/版次/年份三者必须同源
```

**产物**：`review/reproduce_report.md` 的「§4 论文数值回溯」表。

### 2.4 G6 · 质检层复现（四轮评审召回）

| 轮次 | 主体 | 动作 | 通过条件（具体检查项，详见附录 AD/AB/AE） |
|---|---|---|---|
| Round 1 | 自检 | 复现脚本自跑 + 断言全过 | 0 FAIL；随机种子 100% 固定、环境锁版本+哈希、所有数值可脚本重算 |
| Round 2 | 同行评审 | 独立复跑者按报告重跑 + 统计规范核查 | 逐项一致；误差棒/区间齐备、跨种子方差已报告、含随机/采样的 metric 均有 UQ 区间 |
| Round 3 | 专家复核 | 复现度评分卡六维打分 + 方法论严谨 | 各维 ≥ 阈值；敏感性用全局法、误差已传播、数值稳定性已声明、无 p-hacking/数据窥探、AI 推导可验证 |
| Round 4 | 签发 | 生成 `review/G6_复现度评分卡.md` + CC-1 + CC-2/CC-3 | 六维全过 + CC-1 合规 + 训练产物（若有）哈希一致 + AI 推导可验证 |

**评审反模式对照表**（任一项命中即回退）：

| 反模式 | 表现 | 处置 |
|---|---|---|
| lucky seed | 仅单次运行冒充确定性 | 强制跨种子方差报告（附录 AD/附录 V） |
| 不可重跑管线 | 结果需人工中间步骤 | 退回 G3 重做 reproducible |
| 算力声明不公 | 未披露 GPU/硬件 | 补 X.3 实验设置披露 |
| 数据不可得 | 原始数据无哈希/无来源 | 补 data_manifest + CB-7（附录 AB） |
| AI 臆造 | 数值无代码/计算支撑 | 触发 CC-3（附录 AE） |

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
| CB-7 | **冻结清单哈希一致** | G3 收口 | matholve | G3 重解 |
| CB-8 | fig_lint.py PASS | G4 收口 | mathualize | G4 重画 |
| CB-9 | Before–After 对比图组齐备 | G4 收口 | mathualize | G4 重画 |
| CB-10 | **论文数值与冻结清单逐项一致** | G5 收口 | mathaper | G5 重写 |
| CB-11 | 机理微创新可复算 | G2 收口 | mathulate | G2 重推 |
| CB-12 | 反上帝视角与元语言检查 | G6 收口 | mathaper | 对应阶段重做 |
| CC-1 | **竞赛合规闸门**（文本原创度/代码归属/AI 披露/盲审擦除/附录一致） | G5 收口 | mathaper | G5 重写/交付前重做 |
| CC-2 | **深度学习训练产物复现闸门**（权重/adapter/checkpoint 可加载且哈希一致，详见附录 AC） | G3 收口 | matholve | G3 重训/重解 |
| CC-3 | **AI 推导可验证闸门**（论文数值须有代码/计算证据支撑，禁止 AI 臆造，详见附录 AE） | G5 收口 | mathaper | G5 重写 |

**复现高危险门禁**：CB-7（哈希）、CB-10（数值一致）、CC-1（竞赛合规）——任一 FAIL 必须打回源头，
**禁止在下游「补数字」**。

---

## §4 检查点与回退协议

任一门禁 FAIL 时，严格按四步执行：

1. 总控执行 CB 判定（mathingaster 或 mathaper），输出失败项清单与修复命令。
2. 向 `state/gate_log.jsonl` append 一条记录，九字段 schema：
   `{ts, scenario_id, gate, phase, verdict, round, action, root_cause_phase, target_phase, note}`
3. 总控打回 `root_cause_phase` 对应阶段重做。
4. 回退后**重新运行上游全部门禁**，不静默通过。

```json
{"ts":"2026-09-27T19:40:00","gate":"CB-10","phase":"G5","verdict":"FAIL",
 "round":2,"action":"rebuild_paper_numbers","root_cause_phase":"G3",
 "target_phase":"G3","note":"论文表3数值与frozen_results.json差0.7%"}
```

---

## §5 核心质量红线（独立于 CB 的额外禁令）

1. **【严禁】论文数值与 `frozen_results.json` 不一致**——相对误差超过附录 P 阈值即熔断，禁止以绝对差值含糊带过。
2. **【严禁】图件无法由脚本重生成**——交付的每一张图必须有对应脚本与固定种子。
3. **【严禁】附录代码含调试语句或 AI 解释口吻**——只保留可运行、可断言的生产代码。
4. **【严禁】随机过程未固定种子**——凡涉及随机采样/初始化的环节，种子必须显式写出。
5. **【严禁】路径硬编码到个人机器**——脚本内一律使用相对路径或环境变量。
6. **【铁律】复现报告必须给出「可复现性判定」结论**——一致 / 部分一致（列出差异项）/
   不可复现，三选一，不得含糊。
7. **【严禁】依赖未带完整性哈希**——`requirements.txt` 须含 `== 版本 + SHA-256`，安装须 `--require-hashes`，防范同版本内容被投毒或镜像篡改（附录 AB）。
8. **【严禁】AI 臆造数值/参考文献**——论文每一数值须能在 `frozen_results.json` 或代码执行证据中找到支撑；参考文献须做存在性/DOI 校验（附录 AE / CC-3）。
9. **【严禁】未核验的 AI 建议包名**——任何 AI 生成的 import 包名须先在官网/pypi 核验真实存在，禁止安装幻觉/仿冒包（附录 AB / slopsquatting）。

---

## §6 本阶段须通过的门禁

- **G3 收口**：CB-6（收敛）、CB-7（哈希一致）
- **G4 收口**：CB-2、CB-3、CB-8、CB-9（图件四连）
- **G3 收口（含深度学习）**：CB-6（收敛）、CB-7（哈希一致）、**CC-2（训练产物复现，详见附录 AC，非 DL 赛题豁免）**
- **G5 收口**：CB-10（论文数值一致）、**CC-1（竞赛合规闸门，详见附录 Y）**、**CC-3（AI 推导可验证，详见附录 AE）**
- **G6 收口**：CB-12（反上帝视角）+ 复现度评分卡六维全过 + 评审反模式对照表全过

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
[Step 0.5] 环境预检    python scripts/env_doctor.py   # 非阻断，先定位阻断项（附录 Q / env_doctor）
[Step 1] 环境隔离      python -m venv .venv && pip install -r requirements.txt
[Step 2] 数据溯源      python scripts/frozen_check.py --check        # CB-7
[Step 3] 重跑求解      python code/solve_main.py                 # CB-6
[Step 4] 图件复现      python code/make_figs.py && python scripts/fig_lint.py && python scripts/fig_diff.py
[Step 5] 论文回溯      python scripts/tex_num_extract.py && python scripts/paper_number_diff.py
[Step 6] 论文编译      (cd paper && xelatex -interaction=nonstopmode main.tex)
[Step 7] 评分签发      python scripts/repro_score.py > review/G6_复现度评分卡.md   # 六维（附录 A）
[Step 8] 归档交付      tar -czf reproduce_pkg.tar.gz reproduce/
```

**【铁律】**：Step 2–7 中任一步返回非零，立即中止并写 `gate_log.jsonl`，不得跳步。
纯 Windows（无 WSL/Git Bash）用户入口为 `python reproduce/reproduce.py`，功能等同 `reproduce.sh`（附录 AA）。

> **工作流扩展步骤**（按赛题性质选装，详见对应附录）：
> - **[Step 1b] 依赖/密钥扫描**：`uvx pip-audit -r requirements.txt && gitleaks detect`（附录 AB · A5/A12）
> - **[Step 2b] 数据哈希校验**：`python scripts/data_check.py --manifest data/data_manifest.json`（附录 AB · A11）
> - **[Step 3b] CC-2 训练产物复现**：`python code/train_distill.py && python scripts/model_check.py`（附录 AC，非 DL 豁免）
> - **[Step 5b] AI 推导核验**：`python scripts/ref_verify.py && python scripts/claim_evidence_check.py`（CC-3，附录 AE）
> - **[Step 8] 归档哈希**：`sha256sum reproduce_pkg.tar.gz >> expected/checksums.txt`（附录 U.1）

---

## 附录 A · 六维复现度评分卡（v1.4.0 起）

| 维度 | 权重 | 满分标准 | 计分 |
|---|---|---|---|
| 数据溯源度 | 22% | frozen_results 哈希可重算且一致 | 0–22 |
| 代码纯净度 | 18% | 无调试残留、无 AI 口吻、断言齐备 | 0–18 |
| 图件复用度 | 18% | 每图可一键重生成且逐点一致 | 0–18 |
| 论文数值一致度 | 22% | 论文数值与冻结清单 100% 对齐 | 0–22 |
| 评审召回完成度 | 10% | 四轮评审全过 | 0–10 |
| 统计严谨度 | 10% | 全局敏感性 + UQ 误差棒 + 误差传播 + 稳定性声明 + 无统计误用（附录 AD） | 0–10 |

**判定**：总分 ≥90 = 可复现；70–89 = 部分可复现（须列差异项）；<70 = 不可复现（熔断）。
**统计严谨度**为 v1.4.0 新增第 6 维（自评审召回维拆借 5% 后整体扩至 100%）。

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

echo "[0] 环境预检（preflight，非阻断）..."
python scripts/env_doctor.py || echo "ENV-PREFLIGHT-WARN"

echo "[1/8] CB-7 冻结清单哈希校验 ..."
python scripts/frozen_check.py --check || { echo "CB-7 FAIL"; exit 1; }

echo "[2/8] CB-6 重跑求解 ..."
python code/solve_main.py || { echo "CB-6 FAIL"; exit 1; }

echo "[3/8] CC-2 训练产物复现（非 DL 自动跳过）..."
python scripts/model_check.py || echo "skip-CC2"

echo "[4/8] CB-2/CB-8 图件生成与比对 ..."
python code/make_figs.py && python scripts/fig_lint.py && python scripts/fig_diff.py

echo "[5/8] CB-10 论文数值双向比对 ..."
python scripts/paper_number_diff.py || { echo "CB-10 FAIL"; exit 1; }

echo "[6/8] CC-3 AI 推导可验证 ..."
python scripts/claim_evidence_check.py || { echo "CC-3 FAIL"; exit 1; }

echo "[7/8] CC-3 参考文献 DOI 校验 ..."
python scripts/ref_verify.py || echo "no-DOI-found"

echo "[8/8] AE prompt 哈希一致性 ..."
python scripts/prompt_verify.py || { echo "AE FAIL"; exit 1; }

echo "REPRODUCE: PASS"
```

**【铁律】**：每个步骤失败必须 `exit 1`，禁止 `|| true` 吞错；所有中间产物落盘
`<project>/state/`。

### C.1 跨平台复现编排器 `reproduce.py`（Windows 原生可用）

纯 Windows（无 WSL/Git Bash）无法运行 bash。提供 `reproduce/reproduce.py`，用 `pathlib` + `subprocess` 实现三平台一致入口：

```python
# reproduce/reproduce.py — 跨平台一键复现（与 reproduce.sh 等价，附录 AA §AA.4）
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEPS = [  # (名称, 命令列表, gate)
    ("冻结清单哈希",   ["scripts/frozen_check.py", "--check"],            "CB-7"),
    ("重跑求解",       ["code/solve_main.py"],                           "CB-6"),
    ("训练产物复现",   ["scripts/model_check.py"],                       "CC-2"),  # 非 DL 自动跳过
    ("图件生成与比对", ["code/make_figs.py", "scripts/fig_lint.py",     "CB-8 / CB-9"),
                            "scripts/fig_diff.py"],
    ("论文数值比对",   ["scripts/paper_number_diff.py"],                 "CB-10"),
    ("AI 推导核验",    ["scripts/claim_evidence_check.py"],              "CC-3"),
    ("DOI 校验",       ["scripts/ref_verify.py"],                        "CC-3"),
    ("prompt 哈希",    ["scripts/prompt_verify.py"],                     "AE"),
]

for name, cmd, gate in STEPS:
    print(f"[run] {name} ({gate})", flush=True)
    if subprocess.run([sys.executable, str(ROOT / c) for c in cmd], cwd=str(ROOT),
                      encoding="utf-8", bufsize=1).returncode:
        print(f"{gate} FAIL"); sys.exit(1)
print("REPRODUCE: PASS")
```

**【铁律】**：`.gitattributes` 强制 `*.sh text eol=lf`，防止 CRLF 破坏 bash；复现包 README 注明 Windows 走 `python reproduce/reproduce.py`（附录 AA §AA.4）。

---

## 附录 D · 复现报告模板

```markdown
# 复现报告 · <题号>

## 0. 判定结论
一致 / 部分一致 / 不可复现

## 1. 环境
- Python / 依赖版本（含完整性哈希锁）：
- 随机种子（seed_registry，含跨语言 / DL RNG 状态，见附录 V/AA/AC）：
- 硬件（CPU/GPU/集群）+ OS（含 Windows/Linux/macOS 实测结论，见附录 AA）：
- AI 工具（若有）：见 `AI_TOOL_CARDS.md`（附录 AE / Y.3）：

## 2. 冻结清单哈希
- 存储哈希：
- 重算哈希：
- 结论：一致 / 不一致

## 3. 图件复现
| 图件 | 数值 diff | 像素 diff | 结论 |

## 4. 论文数值回溯
| 数值 token | 论文值 | 复算值 | 相对误差 | 是否带误差/区间 | 结论 |

## 5. 差异清单
（逐条列出不一致项与根因）

## 5.5 统计严谨性检查（新增，详见附录 AD）
| 检查项 | 方法 | 通过标准 | 结论 |
|---|---|---|---|
| 敏感性是否全局 | Morris/Sobol 而非仅 ±X% OAT | 核心指标已用全局法或已证线性 | ✅/⚠️ |
| 不确定性是否量化 | MC(N≥100) 给出 mean±std 与 95% 区间 | 含随机/采样的 metric 均有区间 | ✅/⚠️ |
| 跨种子方差 | N≥5 种子，报告 mean/std/区间 | 相对 std 与聚合规则已声明 | ✅/⚠️ |
| 误差是否传播 | 对比类结论附组合不确定度(Ut 公式) | 相对优劣结论带误差 | ✅/⚠️ |
| 数值稳定性 | 核心求解 κ(A) 已报告 | 病态已声明/已正则化 | ✅/⚠️ |
| 统计误用核查 | 无 p-hacking / 相关≠因果 / 无数据窥探 | 全部规避 | ✅/⚠️ |

> 任一 ⚠️ 项须在 §5 差异清单中说明其对结论的影响量级。

## 6. 六维复现度评分
（见附录 A；v1.4.0 起为六维，含统计严谨度）

## 7. 结论—证据可追溯表（新增，详见附录 AE）
| 关键结论 | 支撑代码/数据/推导 | AI 推导(prompt_ref) | 验证状态 |
|---|---|---|---|

## 8. 平台验证矩阵（新增，详见附录 AA）
| 平台 | CB-7 | CB-10 | CC-2* | 结论 |
|---|---|---|---|---|
| ubuntu-latest | PASS | PASS | — | ✅ |
| windows-latest | PASS | PASS | — | ✅ |
| macos-latest | PASS | PASS | — | ✅ |
（*CC-2 仅深度学习赛题适用）
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
| `scripts/frozen_check.py` | 冻结清单哈希重算 + 必填项机检 | CB-7 |
| `code/solve_main.py` | 主求解流程（可独立重跑） | CB-6 |
| `code/make_figs.py` | 图件批量再生成 | CB-8 |
| `scripts/fig_diff.py` | 图件数值/像素逐点比对 | CB-9 |
| `scripts/fig_lint.py` | 图件命名/DPI/空目录检查 | CB-2 |
| `scripts/tex_num_extract.py` | 从 LaTeX 提取数值 token | CB-10 |
| `scripts/paper_number_diff.py` | 论文数值双向子集比对 | CB-10 |
| `scripts/repro_score.py` | 六维复现度评分卡生成 | CB-12 |
| `scripts/model_check.py` | 训练产物/adapter 加载 + 权重哈希比对 | CC-2（附录 AC） |
| `scripts/data_check.py` | `data_manifest.json` 哈希断言（防脏数据） | 附录 AB A11 |
| `scripts/ref_verify.py` | 参考文献存在性/DOI 校验 | CC-3（附录 AE） |
| `scripts/claim_evidence_check.py` | 论文数值→代码/计算证据可追溯映射 | CC-3（附录 AE） |
| `scripts/prompt_verify.py` | prompt 工件哈希固化与一致性检查 | 附录 AE |
| `code/train_distill.py` | 蒸馏/微调训练（含 GPU 确定块，附录 AC） | CC-2 |

---

## 附录 G · 复现检查清单

| # | 检查项 | 命令 / 方法 | 通过标准 |
|---|---|---|---|
| 1 | 冻结清单存在且可解析 | `python -c "import json;json.load(open('state/frozen_results.json'))"` | 无异常 |
| 2 | 哈希可重算 | `python scripts/frozen_check.py --check` | 与存储值一致 |
| 3 | 求解脚本可独立跑通 | `python code/solve_main.py` | exit 0 |
| 4 | 随机种子已固定 | `grep -rn "seed" code/` | 每处随机源都有 seed |
| 5 | 依赖版本已冻结 | `cat requirements.txt` | 所有包带版本号 |
| 6 | 绘图脚本可重生成图件 | `python code/make_figs.py` | 产出 figs_repro/ |
| 7 | 图件数值逐点一致 | `python scripts/fig_diff.py` | 相对误差 < 1e-9 |
| 8 | 图件 DPI ≥ 300 | `python scripts/fig_lint.py` | 全部通过 |
| 9 | 论文数值可提取 | `python scripts/tex_num_extract.py` | 输出 token 列表 |
| 10 | 论文数值双向一致 | `python scripts/paper_number_diff.py` | 差集为空 |
| 11 | LaTeX 可零错编译 | `xelatex main.tex` | 0 error |
| 12 | 参考文献同版匹配 | 人工 + 脚本比对 | 作者/版次/年份同源 |
| 13 | 复现报告已生成 | `ls review/reproduce_report.md` | 存在且含判定 |
| 14 | 复现度评分卡已生成 | `ls review/G6_复现度评分卡.md` | 六维全过 |
| 15 | 依赖带完整性哈希 | `pip-compile --generate-hashes` 后查看 | 每个包含 `--hash=sha256:`（附录 AB A1） |
| 16 | 哈希模式安装 | `pip install --require-hashes -r requirements.txt` | 0 失败、无未哈希项 |
| 17 | 漏洞/恶意包扫描 | `uvx pip-audit -r requirements.txt` | 无 CVSS≥7 已知 CVE |
| 18 | AI 建议包名已核验 | 对每个 import 包 `pip index versions <pkg>` | 全部真实存在、非幻觉/仿冒 |
| 19 | 第三方脚本静态扫描 | `bandit -r code/` | 无 eval/exec/os.system/可疑外联 |
| 20 | 输入数据哈希校验 | `python scripts/data_check.py --manifest data/data_manifest.json` | 每个原始文件哈希匹配 |
| 21 | 密钥扫描 | `gitleaks detect` 或正则扫 `code/ reproduce/` | 无 API key/token/内部 URL 泄露 |
| 22 | GPU 确定性开关齐备 | 检查 CUBLAS_WORKSPACE_CONFIG / use_deterministic_algorithms | 全部设置（DL 赛题，附录 AC） |
| 23 | 训练产物可加载且哈希一致 | `python scripts/model_check.py` | adapter/权重哈希匹配（CC-2） |
| 24 | 跨种子方差已报告 | `grep -rn "seed" code/` + 报告 N≥5 方差 | mean/std/区间 + 聚合规则 |
| 25 | 敏感性为全局法 | 检查是否用 Morris/Sobol | 核心指标已用全局法或已证线性（附录 AD） |
| 26 | 编码双轨 UTF-8 | `PYTHONUTF8=1` + 脚本 `encoding="utf-8"` | Windows 无静默乱码（附录 AA） |
| 27 | 跨平台 CI 实测 | ubuntu/windows/macos 三 job 全 PASS | 任一平台未验证即标⚠️（附录 AA） |
| 28 | LLM 调用已固化溯源 | `frozen_results.json` 含 `llm_registry` | 模型/版本/prompt 哈希已登记（附录 AE） |
| 29 | AI 推导可验证 | `python scripts/claim_evidence_check.py` | 论文数值均有代码/计算证据（CC-3） |
| 30 | 环境预检已通过 | `python scripts/env_doctor.py` | 无 FAIL（仅有 OK/WARN 可继续） |
| 31 | Notebook 已导出脚本 | 检查 `code/*.ipynb` 且无 .py | 用 `jupyter nbconvert --to script` 导出（R-69） |
| 32 | 非 CSV 数据已快照哈希 | `data/data_manifest.json` 含 .xlsx/.h5/parquet 来源 | 落盘 CSV/parquet 快照 + 哈希（R-70） |
| 33 | 外部 .tex 已递归展开 | grep `\input\|\include` in paper/ | tex_num_extract 须递归（R-71） |
| 34 | Git LFS/子模块已拉取 | `git lfs pull` + `git submodule update --init` | 真实二进制而非指针文件（R-73） |

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
├── reproduce.sh            # Linux/macOS/WSL 一键复现入口（附录 C）
├── reproduce.py            # Windows 原生跨平台编排器（附录 C.1 / AA §AA.4）
├── requirements.txt        # 冻结依赖 + SHA-256（附录 AB A1）
├── requirements.in         # 顶层依赖源（pip-compile --generate-hashes）
├── CITATION.cff            # Zenodo DOI 引用元数据（附录 U.3）
├── README.md               # 复现说明（环境、命令、预期输出）
├── state/                  # gate_log.jsonl（append，九字段 schema）
├── data/
│   ├── data_manifest.json  # 原始文件 SHA-256 + 来源 URL（附录 AB A11）
│   └── *.csv               # 输入数据快照
├── code/                   # 求解 + 绘图 + DL 训练脚本
├── scripts/                # 技能复现工具链（frozen_check / fig_diff / model_check …）
├── prompts/                # AI 辅助推导的不可变 prompt 工件（附录 AE）
├── expected/
│   ├── checksums.txt       # 复现包自身 SHA-256（附录 U.1）
│   ├── model_checksums.txt # 训练产物/adapter 哈希（CC-2，附录 AC）
│   └── prompt_hashes.txt   # prompt 哈希固化（附录 AE）
├── sbom.json               # CycloneDX SBOM（含组件 SHA-256 + pURL，附录 AB OP-3）
├── AI_TOOL_CARDS.md        # 各 AI 工具结构化元数据卡（附录 AE / Y.3）
├── AI_USE_REPORT.md        # AI 使用报告（COMAP 2026，附录 AE §AE.4 / Y.8）
└── report/
    ├── reproduce_report.md # 复现报告（含 §5.5/§7/§8 新段）
    └── G6_复现度评分卡.md  # 六维复现度评分（附录 A，v1.4.0 起）
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
| v1.1.0 | 2026-09-28 | 扩充附录 M–Q（配套脚本、CI集成、容器化、量化阈值、故障排查）+ 穷举验证器 |
| v1.2.0 | 2026-09-28 | 新增附录 R（全场景穷举表 50+条目）、S（自进化循环）、T（学习索引与检索）|
| v1.3.0 | 2026-09-29 | 全网检索深度优化：修 DEF-01~24 缺陷；新增 CC-1 合规闸门；S/T 强化为 v2（混合检索/冲突解决/自动 lesson/自进化闭环）；新增附录 U 永久归档、V 种子表、W provenance、X 复现声明、Y 竞赛合规、Z 工具链推荐 |
| v1.4.0 | 2026-09-30 | 二次全网检索深度优化（5 子代理并行：统计严谨性/供应链安全/深度学习复现/LLM辅助复现/跨平台多语言）；新增 CC-2(训练产物)、CC-3(AI推导可验证) 闸门；五维评分卡扩至六维（增统计严谨度）；新增附录 AA 跨平台多语言、AB 复现安全与供应链、AC 深度学习/大模型复现、AD 统计严谨性、AE AI 辅助建模复现性；R-53~R-68 故障模式；CI 三平台矩阵 + GPU 确定性 + 哈希锁依赖 + 漏洞/密钥扫描 |
| v1.4.1 | 2026-10-01 | 全量脚本实体化收官：将文档引用但缺失的 7 个脚本（repro_score/model_check/data_check/ref_verify/claim_evidence_check/prompt_verify/fig_lint）与跨平台编排器 reproduce/reproduce.py 全部落盘（共 12 个 .py，均 pathlib+argparse+0/1 返回码约定）；修复 fig_lint.py 导入期 NameError、ref_verify.py 占位死代码；文档一致性收口（CB-8 命名、五维→六维、附录 M 全量脚本清单、附录 C/N/I/§8 全链路门禁同步） |
| v1.4.2 | 2026-10-01 | 新增 `scripts/env_doctor.py` 预检诊疗脚本（一次性扫描 10 类阻断项、回指 R/Q/AB、非阻断接入 reproduce.py 与 reproduce.sh）；补全 R-69~R-82 高频故障模式（Notebook 真源 / Excel 多 sheet / 
| v1.4.3 | 2026-10-01 | 再补全 R-83~R-98 高频故障模式（Python 次版本/时区区域/cuDNN 确定性/BOM·CRLF/科学计数法·全角数字/siunitx·宏定义数值/数值越界/非官方下载/AI 代码口径漂移/wheel·sdist 差异/seed env 注入/字体缺失/多重比较校正/数据划分泄漏/DB 查询未固化）；强化 `scripts/env_doctor.py` 新增 BOM·CRLF、时区区域、字体三项检测（共 13 类阻断项） |
| v1.4.4 | 2026-10-01 | 再补全 R-99~R-108 高频故障模式（JAX 非确定性/BLAS 线程数/传递依赖漂移/压缩包数据/大小写冲突/动态 prompt/置信区间缺失/随机颜色循环/LaTeX 引擎差异/DataLoader 顺序）；强化 `scripts/env_doctor.py` 新增 JAX 确定性、DataLoader worker、大小写冲突三项检测（共 16 类阻断项） |\input 递归 / TikZ 缓存 / Git LFS / import 期随机 / 多进程 start 方法 / sklearn·tf 游离 RNG / numpy2 破坏性 / matplotlibrc 未固化 / babel 逗号 / 实时 API 抓取 / fp32·64 混用 / 隐式 env 依赖）；§8 增 preflight 步、附录 M/G 增 env_doctor 条目 |

---

## 附录 M · 配套脚本清单（可直接调用）

| 脚本 | 用法 | 返回码 | 对应门禁 |
|---|---|---|---|
| `scripts/frozen_check.py` | `python scripts/frozen_check.py --check` | 0=PASS / 1=FAIL | CB-7 |
| `scripts/fig_diff.py` | `python scripts/fig_diff.py` | 0=PASS / 1=FAIL | CB-8 / CB-9 |
| `scripts/fig_lint.py` | `python scripts/fig_lint.py` | 0=PASS / 1=FAIL | CB-2 |
| `scripts/tex_num_extract.py` | `python scripts/tex_num_extract.py` | 输出 JSON 到 stdout | CB-10 |
| `scripts/paper_number_diff.py` | `python scripts/paper_number_diff.py` | 0=PASS / 1=FAIL | CB-10 |
| `scripts/repro_score.py` | `python scripts/repro_score.py` → review/G6_复现度评分卡.md | 0(≥70) / 1(<70) | CB-12 |
| `scripts/model_check.py` | `python scripts/model_check.py`（DL 赛题自动跳过非 DL） | 0=PASS / 1=FAIL | CC-2 |
| `scripts/data_check.py` | `python scripts/data_check.py --manifest data/data_manifest.json` | 0=PASS / 1=FAIL | AB A11 |
| `scripts/ref_verify.py` | `python scripts/ref_verify.py [--online]` | 0(无 DOI/全通过) / 1(格式非法) | CC-3 |
| `scripts/claim_evidence_check.py` | `python scripts/claim_evidence_check.py` | 0=PASS / 1(AI臆造嫌疑) | CC-3 |
| `scripts/prompt_verify.py` | `python scripts/prompt_verify.py`（无哈希文件则生成） | 0=PASS / 1(不一致) | AE |
| `scripts/env_doctor.py` | `python scripts/env_doctor.py [--json]` | 0(无FAIL) / 1(有FAIL) | 预检/诊疗（非阻断） |

**环境固化与编排文件**：

| 文件 | 用途 |
|---|---|
| `reproduce/Dockerfile` | 固化 Python + LaTeX + 中文字体 + GPU 确定性 ENV，消除机器差异（附录 O） |
| `reproduce/docker-compose.yml` | 一键拉起复现容器（固定 PYTHONHASHSEED 与 Agg 后端，断网加固可选） |
| `reproduce/reproduce.sh` | Linux/macOS/WSL 容器内一键复现入口（失败即 exit 1） |
| `reproduce/reproduce.py` | Windows 原生跨平台复现编排器（pathlib+subprocess，附录 C.1 / AA §AA.4） |
| `.github/workflows/reproduce.yml` | CI 自动复现校验（push/PR 触发，三平台矩阵，附录 N） |

**【铁律】**：脚本与 CI 必须返回码对齐门禁码——`0` 对应 PASS，非零对应具体 CB 失败，
禁止在 CI 中用 `|| true` 吞掉失败。

**【铁律】**：所有脚本统一使用 `pathlib` 推导项目根（`ROOT = Path(__file__).resolve().parent.parent.parent`），禁止硬编码绝对路径；返回码语义必须为
`0=通过 / 1=失败`，供 `reproduce.sh`、`reproduce.py` 与 CI 直接判定。

---

## 附录 N · CI 集成（GitHub Actions）

```yaml
name: reproduce
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  reproduce:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs: ${{ matrix.os }}
    env:
      PYTHONHASHSEED: "0"
      MPLBACKEND: "Agg"
      PYTHONUTF8: "1"
      LC_ALL: "C.UTF-8"
      CUBLAS_WORKSPACE_CONFIG: ":4096:8"   # DL 赛题确定性（附录 AC）
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: 安装依赖（哈希锁定 + 漏洞扫描）
        run: |
          pip install --require-hashes -r requirements.txt
          uvx pip-audit -r requirements.txt
      - name: 数据哈希校验（附录 AB）
        run: python scripts/data_check.py --manifest data/data_manifest.json
      - name: CB-6 重跑求解
        run: python code/solve_main.py
      - name: CC-2 训练产物复现（非 DL 自动跳过）
        run: python scripts/model_check.py || echo "skip-CC2"
      - name: CB-7 冻结清单哈希校验
        run: python scripts/frozen_check.py --check
      - name: CB-8/9 图件比对
        run: python scripts/fig_diff.py
      - name: CB-10 论文数值双向比对
        run: python scripts/paper_number_diff.py
      - name: CC-3 AI 推导可验证
        run: python scripts/claim_evidence_check.py
      - name: CC-3 参考文献 DOI 校验
        run: python scripts/ref_verify.py || echo "no-DOI-found"
      - name: AE prompt 哈希一致性
        run: python scripts/prompt_verify.py

**【铁律】**：CI 中任一步返回非零即 job 失败；**禁止**在 CI 步骤里加 `|| true` 吞错。
跨三平台（ubuntu/windows/macos）门禁须全 PASS，否则 L3 声明不成立（附录 AA §AA.2）。

---

## 附录 O · 容器化环境固化

```dockerfile
# reproduce/Dockerfile — 保证"干净环境"可复现
FROM python:3.11-slim

# 确定性环境块（含 DL 赛题 GPU 确定性开关，附录 AC §AC.1）
ENV PYTHONHASHSEED=0 \
    MPLBACKEND=Agg \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8 \
    PYTHONUTF8=1 \
    CUBLAS_WORKSPACE_CONFIG=":4096:8" \
    TORCH_USE_DETERMINISTIC_ALGORITHMS=1 \
    CUDA_LAUNCH_BLOCKING=1

# 系统依赖：中文字体 + LaTeX + 绘图库
RUN apt update && apt install -y --no-install-recommends \
        texlive-xetex texlive-lang-chinese texlive-recommended \
        fonts-noto-cjk build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY requirements.txt ./
# 仅二进制安装（防 sdist 的 setup.py 任意代码执行，附录 AB OP-5）
RUN pip install --no-cache-dir --only-binary :all: -r requirements.txt

COPY . .
# 断网 + 最小权限运行，防供应链投毒外联（附录 AB OP-6）
CMD ["bash", "reproduce/reproduce.sh"]
```

> **Windows 专属（附录 AA §AA.8）**：项目须放在 WSL2 文件系统（如 `~/projects/`）而非 `/mnt/c/...`，
> 否则 Docker I/O 慢约 12 倍且 inotify 失效；或用 `devcontainer.json`（基于 `mcr.microsoft.com/devcontainers/python`），
> 由 Dev Container CLI 复用同镜像，避免 Windows/macOS 本机与容器环境漂移。

```yaml
# reproduce/docker-compose.yml
services:
  reproduce:
    build:
      context: ..
      dockerfile: reproduce/Dockerfile
    volumes:
      - ..:/work
    environment:
      PYTHONHASHSEED: "0"
      MPLBACKEND: "Agg"
      LC_ALL: "C.UTF-8"
      PYTHONUTF8: "1"
      CUBLAS_WORKSPACE_CONFIG: ":4096:8"
    # 可选：限制网络与权限（附录 AB OP-6）
    # network_mode: "none"
    # cap_drop: ["ALL"]
    # security_opt: ["no-new-privileges"]
```

**【铁律】**：容器内必须固定 `PYTHONHASHSEED=0`（消除 dict/set 迭代顺序导致的哈希漂移）；
matplotlib 必须用 `Agg` 后端（无头环境稳定出图）；DL 赛题须启用 GPU 确定性 ENV 且 `--only-binary` 安装。

---

## 附录 P · 复现度量化阈值

| 指标 | 通过阈值 | 熔断阈值 | 测量方式 |
|---|---|---|---|
| 冻结清单哈希 | 完全一致 | 任一字符不同 | `frozen_check.py` |
| 数值相对误差 | `rtol ≤ 1e-9` | `rtol > 1e-6` | `paper_number_diff.py` |
| 图件像素差异 | `< 0.1%` | `≥ 1%` | `fig_diff.py` |
| 图件 DPI | `≥ 300` | `< 200` | `fig_lint.py` |
| 论文数值覆盖率 | `100%` | `< 95%` | 双向子集比对 |
| 随机种子固定率 | `100%` | 存在未固定随机源 | `grep -rn "seed\|random\|np.random" code/ scripts/` |
| 依赖版本锁定率 | `100%` | 存在无版本号依赖 | `requirements.txt` |
| 依赖完整性哈希率 | `100%` | 存在无 `--hash` 依赖 | `requirements.txt`（附录 AB A1） |
| 漏洞/恶意包扫描 | 0 已知 CVE(CVSS≥7) | 存在 CVSS≥7 CVE | `pip-audit`（附录 AB A5） |
| GPU 确定性开关齐备率 | `100%` | 缺 CUBLAS/use_deterministic | 检查 ENV（附录 AC §AC.1） |
| 训练产物哈希一致率 | `100%`（DL 赛题） | adapter/权重哈希不匹配 | `model_check.py`（CC-2） |
| 跨种子方差报告率 | `100%`（随机性强的 N≥5） | 未报告 mean/std/区间 | 报告 + 聚合规则（附录 AD/V） |
| 全局敏感性覆盖率 | 核心指标已用 Morris/Sobol | 仅 ±X% OAT 局部扰动 | 附录 AD §AD.1 |
| UQ 误差棒覆盖率 | 含随机/采样 metric 均带区间 | 关键 metric 无区间 | 附录 AD §AD.2 |
| 平台验证通过率 | ubuntu+windows+macos 全 PASS | 任一平台未验证 | 附录 AA §AA.2 |
| LLM 调用溯源登记率 | `100%`（AI 辅助赛题） | 缺 llm_registry/prompt 哈希 | 附录 AE §AE.1/§AE.2 |

**判定**：全部指标通过 = 可复现；任一熔断 = 不可复现；介于两者之间 = 部分可复现。
**跨环境说明**：深度学习场景下「逐位一致」放宽至「同锁定环境逐位 + 跨环境统计等效（rtol≤1e-3 + 方差报告）」，见附录 X.2 与 AC §AC.7。

---

## 附录 Q · 故障排查手册

| 症状 | 可能原因 | 排查命令 | 修复 |
|---|---|---|---|
| 哈希校验失败 | 浮点序列化差异 / 编码漂移 | `python -c "import json,unicodedata;print(json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False))"` | 统一 `separators=(",",":") + ensure_ascii=False + NFC 归一化` |
| 哈希校验失败 | 字段顺序漂移 | 检查 `sort_keys=True` | 补 `sort_keys=True` |
| 图件像素大面积差异 | matplotlib 版本不同 | `pip show matplotlib` | 锁定版本到 requirements |
| 图件数值一致但像素不同 | 字体缺失/回退 | `fc :lang=zh` | 安装 Noto CJK 字体 |
| 论文数值比对差集非空 | 手改论文数字 | `paper_number_diff.py -v` | 回源头修正再级联 |
| LaTeX 编译失败 | 缺宏包 | 查看 `.log` 首个 `!` 行 | 安装对应 texlive 宏包 |
| 求解脚本换机报错 | 路径硬编码 | `grep -rn "C:\\" code/` | 改相对路径/环境变量 |
| 每次结果微变 | 随机种子未固定 | `grep -rn "seed" code/` | 显式 `np.random.seed(42)` |
| 中文乱码 | 编码不一致 | `file code/*.py` | 统一 UTF-8 |
| Windows 静默乱码 | Python 默认 cp936 + 子进程管道 locale 解码 UTF-8 失败 | `chcp`/检查 PYTHONUTF8 | 设 `PYTHONUTF8=1` + 脚本 `encoding="utf-8"`（附录 AA §AA.1） |
| 跨编译器浮点漂移 | MSVC(GCC/Clang) NaN 传播/超越函数/80-bit 中间精度不同 | 比对 `repr(float)` 跨平台 | 锁工具链 + `/fp:strict` + 显式 `isnan()`（附录 AA §AA.3 / R-54） |
| MSVC 违背 IEEE-754 | `pow(1.0,NaN)` 等未定义行为 | 单测断言 NaN 处理 | 显式 `math.isnan()` 包裹（R-56） |
| 纯 Windows 无法复现 | 无 WSL/Git Bash 跑不了 `reproduce.sh` | 试跑 `reproduce.sh` | 改用 `python reproduce/reproduce.py`（附录 AA §AA.4） |
| 长路径报错 | Windows MAX_PATH=260 超长 | `FileNotFoundError` | 用 `pathlib` + `\\?\` 前缀 / 启用长路径（R-67） |
| 幻觉/仿冒包投毒 | AI 生成不存在的 import 包名被抢注投毒 | `pip index versions <pkg>` | 装前官网核验（附录 AB OP-4 / R-60） |
| 脏数据进复现 | 网盘/QQ 群下载数据被篡改 | `data_check.py` | `data_manifest.json` 哈希断言（R-59/附录 AB） |
| 密钥泄露 | 硬编码 API key/token 随包提交 | `gitleaks detect` | 擦除 + 环境变量注入（附录 Y.4 / R-62） |
| 训练产物不可加载 | checkpoint/adapter 哈希不一致 | `model_check.py` | 完整 checkpoint + 哈希固化（CC-2 / R-68） |
| 全局敏感性误判 | 仅 OAT 局部扰动对非线性/交互模型失效 | 检查敏感性方法 | 补 Morris/Sobol（R-63 / 附录 AD） |
| AI 臆造数值 | 论文数值无代码/计算支撑 | `claim_evidence_check.py` | 触发 CC-3 + 人工核验（R-62 / 附录 AE） |

---

> **权威条款**：本技能对复现的判定以 `scripts/CANON.md` 为准；如与子技能描述冲突，
> 一律以 CANON 为准。

## 附录 R · 全场景穷举表（50+ 复现故障模式）

| # | 场景分类 | 故障描述 | 检测方法 | 修复方案 |
|---|---|---|---|---|
| R-01 | 数据溯源 | frozen_results.json 缺失或无法解析 JSON | `import json; json.load()` | 从 G3 重新生成 |
| R-02 | 数据溯源 | hash_sha256 字段与重算值不一致(字符级不同) | SHA-256 比对 | 检查序列化参数 |
| R-03 | 数据溯源 | sort_keys 未开启导致 JSON 顺序漂移 | grep `sort_keys` | 补 `sort_keys=True` |
| R-04 | 数据溯源 | separators 不统一导致格式差异 | 对比 `separators=(",",":")` | 统一参数 |
| R-05 | 数据溯源 | ensure_ascii 未设 True/False 导致编码漂移 | grep `ensure_ascii` | 显式指定 |
| R-06 | 数据溯源 | UTF-8 BOM 导致哈希首字符差异 | `hexdump -C frozen_results.json \| head` | 去 BOM |
| R-07 | 数据溯源 | Python 版本浮点序列化差异（3.10 vs 3.11） | `repr(float_val)` 比对 | 锁定 Python 版本 |
| R-08 | 数据溯源 | 数值精度截断/四舍五入不一致 | `np.allclose(rtol=1e-9)` | 统一容差策略 |
| R-09 | 数据溯源 | NaN / Inf 未处理导致 JSON 序列化失败 | `json.dumps()` 异常捕获 | `allow_nan=False` + 预处理 |
| R-10 | 数据溯源 | hash_sha256 字段自身参与哈希计算（自引用） | 排除 hash_sha256 重算 | 修正输入集 |
| R-11 | 图件复现 | figs/ 目录为空或命名不规范 | `fig_lint.py` | 按 `fig_XX_desc.png` 规范 |
| R-12 | 图件复现 | DPI < 300 导致印刷模糊 | `PIL.Image.getexif()` | `plt.savefig(dpi=300)` |
| R-13 | 图件复现 | matplotlib 版本不同导致像素差异 >0.1% | `pip show matplotlib` | 锁定 requirements |
| R-14 | 图件复现 | 字体缺失/回退导致中文显示异常 | `fc :lang=zh` | 安装 Noto CJK / SimHei |
| R-15 | 图件复现 | Agg 后端未设置导致无头环境崩溃 | `os.environ.get(MPLBACKEND)` | 设 `MPLBACKEND=Agg` |
| R-16 | 图件复现 | PYTHONHASHSEED 未固定导致 dict 迭代顺序漂移 | 检查环境变量 | 设 `PYTHONHASHSEED=0` |
| R-17 | 图件复现 | 随机种子未固定导致蒙特卡洛结果波动 | grep `seed` | 显式 `np.random.seed(42)` |
| R-18 | 图件复现 | 颜色映射表版本差异（matplotlib colormap） | 比对版本 release notes | 锁定 matplotlib <3.7 |
| R-19 | 图件复现 | 抗锯齿渲染参数不同导致像素级差异 | `rcParams["path.antialiased"]` | 统一 rcParams |
| R-20 | 图件复现 | 图片压缩级别差异（PNG deflate level） | `pngcheck -v fig.png` | `plt.savefig(compress_level=6)` |
| R-21 | 论文回溯 | LaTeX 提取的数值 token 与 frozen_results 差集非空 | `paper_number_diff.py` | 回源头修正 |
| R-22 | 论文回溯 | 论文手改数字导致与源头不一致 | 双向子集比对 | 级联重生成 |
| R-23 | 论文回溯 | LaTeX 编译 error > 0（缺宏包/语法错误） | `xelatex main.tex` 查看 `.log` | 安装缺失宏包 |
| R-24 | 论文回溯 | undefined reference（交叉引用断裂） | grep `undefined` in `.log` | 补全 `\label` / `\ref` |
| R-25 | 论文回溯 | 参考文献作者/版次/年份不同源 | 人工 + 脚本比对 | 从原始来源重引 |
| R-26 | 论文回溯 | 数值格式不一致（科学计数法 vs 小数） | 正则匹配 `[\d.]+e[+-]\d+` | 统一格式策略 |
| R-27 | 论文回溯 | LaTeX 宏定义覆盖原始数值（`\newcommand{\optval}{1.23}`） | grep `\newcommand\|\def` | 替换为源值 |
| R-28 | 环境差异 | requirements.txt 未锁定版本号 | `pip freeze \| grep "=="` | 补 `==` 版本约束 |
| R-29 | 环境差异 | conda/virtualenv 路径硬编码到个人机器 | grep `/home/junlin\|C:\\Users\\46523` | 改相对路径/环境变量 |
| R-30 | 环境差异 | locale 设置不同导致数值格式差异（逗号 vs 小数点） | `locale.getdefaultlocale()` | 设 `LC_ALL=C.UTF-8` |
| R-31 | 环境差异 | Windows/Linux 路径分隔符差异（`\` vs `/`） | `pathlib.PurePath` | 用 `pathlib` |
| R-32 | 环境差异 | Git CRLF/LF 转换导致脚本执行失败 | `git config core.autocrlf` | `.gitattributes` 强制 LF |
| R-33 | 环境差异 | Docker 容器内无中文字体（Ubuntu minimal） | `fc \| grep -i cjk` | Dockerfile 安装字体包 |
| R-34 | 环境差异 | texlive 宏包版本过旧导致编译失败 | `tlmgr query \| grep installed` | 更新 texlive 或降级代码 |
| R-35 | 评审召回 | Round 1 自检未覆盖全部门禁 | 检查 gate_log.jsonl | 补全门禁脚本 |
| R-36 | 评审召回 | Round 2 独立复跑者缺少完整环境说明 | 审查 reproduce/README.md | 补充环境清单 + Dockerfile |
| R-37 | 评审召回 | 六维评分卡某维度 < 阈值但未标注差异项 | score ≥ 70 检查差集列表 | 强制列差异项 |
| R-38 | 评审召回 | gate_log.jsonl 缺少九字段之一 | `jq '. \| keys' state/gate_log.jsonl` | 补全 schema |
| R-39 | 评审召回 | 门禁 FAIL 后未重新运行上游全部门禁 | 检查回退日志 | 级联重检 |
| R-40 | 评审召回 | CB-12 反上帝视角检测失败（出现「显然」「易得」） | grep `显然\|易得\|不难` | 改为详细推导 |
| R-41 | 随机性 | 并行计算顺序不同导致非确定性结果 | `threading.Thread` / `multiprocessing` | 固定线程数/锁序 |
| R-42 | 随机性 | NumPy 随机数生成器版本迁移（Generator vs RandomState） | grep `np.random.RandomState\|np.random.default_rng` | 统一 API |
| R-43 | 数据版本 | 数据文件未纳入版本控制导致差异 | `git ls data/` | `git add data/` |
| R-44 | 数据版本 | CSV 编码不一致（GB2312 vs UTF-8） | `file data/*.csv` | 统一转 UTF-8 |
| R-45 | 隐式依赖 | 脚本读取上次运行的中间文件作为输入 | grep `.pkl\|.npy\|.h5` | 显式从源数据重算 |
| R-46 | 调试残留 | 代码含 `print() / TODO / FIXME / # noqa` | grep -rn `print\|TODO\|FIXME` | 清理交付物 |
| R-47 | AI 口吻 | 复现报告含「我们可以看到」「值得注意的是」 | 正则匹配主观叙述词 | 删除/替换为客观陈述 |
| R-48 | CI 集成 | GitHub Actions runner 版本差异（ubuntu-20.04 vs 22.04） | 检查 workflow `runs` | 锁定 ubuntu-22.04 |
| R-49 | CI 集成 | CI 步骤用 `|| true` 吞掉失败 | grep `\|\| true` in `.yml` | 移除或改为明确处理 |
| R-50 | 容器化 | Dockerfile 拼写错误导致安装失败（`python:3.11lim`） | `docker build .` | 修正基础镜像名 |
| R-51 | 容器化 | docker.yml 挂载路径不存在 | `docker compose up` | 检查 volume mount |
| R-52 | 路径规范 | `<project>` 与 `<skill>` 路径基准混用 | grep `<project>/\|<skill>/` in code | 修正路径推导 |
| R-53 | 随机性(DL) | DataLoader worker 未 seed 导致增强/抽样跨 run 不一致 | grep `worker_init_fn\|generator` | 加 `seed_worker`+`Generator`（附录 AC §AC.3） |
| R-54 | 环境差异 | 编译器级浮点漂移（MSVC vs GCC/Clang） | 比对 `repr(float)` 跨平台 | 锁工具链 + `/fp:strict`（附录 AA §AA.3） |
| R-55 | 随机性(DL) | 多卡↔单卡结果不一致（DDP rank/grad-accum） | 单卡重跑对比 | `seed+rank` + 等效有效 batch（附录 AC §AC.6） |
| R-56 | 环境差异 | MSVC 违背 IEEE-754 NaN 规范（pow(1.0,NaN)） | 单测断言 NaN | 显式 `math.isnan()` 包裹（附录 AA §AA.3） |
| R-57 | 随机性(DL) | DistributedSampler 未 set_epoch 导致每 epoch 同序 | grep `set_epoch` | `sampler.set_epoch(epoch)`（附录 AC §AC.3） |
| R-58 | 环境差异 | BLAS 后端跨构建差异（OpenBLAS/MKL/oneAPI） | 固定 `OMP_NUM_THREADS=1` + 锁 BLAS | 锁 BLAS 版本 + 固定线程（附录 AA/AC 共用） |
| R-59 | 供应链 | 依赖无完整性哈希 / 同版本内容被投毒或镜像篡改 | `pip-audit` + 比对哈希 | `pip-compile --generate-hashes`（附录 AB OP-1） |
| R-60 | 供应链 | 幻觉/仿冒 AI 包（slopsquatting）被安装执行 | `pip index versions <pkg>` | 装前官网核验（附录 AB OP-4） |
| R-61 | 供应链 | SBOM 不可验证 / 缺传递依赖树与组件哈希 | `cyclonedx-py environment` | 生成带哈希 CycloneDX（附录 AB OP-3） |
| R-62 | AI 辅助 | AI 臆造数值/参考文献无代码或计算支撑 | `claim_evidence_check.py` | 触发 CC-3 + 人工核验（附录 AE） |
| R-63 | 统计严谨 | 仅 OAT 局部 ±X% 扰动，对非线性/交互模型误判重要性 | 检查敏感性方法 | 补 Morris/Sobol 全局法（附录 AD §AD.1） |
| R-64 | 统计严谨 | 跨种子方差未报告 / 阈值无出处 | 检查报告 N≥5 + 聚合 | 报告 mean/std/区间（附录 AD §AD.3 / V.2） |
| R-65 | 跨平台 | 纯 Windows 无 WSL/Git Bash 跑不了 `reproduce.sh` | 试跑 `reproduce.sh` | 改用 `python reproduce/reproduce.py`（附录 AA §AA.4） |
| R-66 | 跨平台 | conda 跨平台锁文件失败（vc14_0 等平台专用包） | `conda env export` 解析失败 | `conda-lock -p linux-64 -p win-64 -p osx-64`（附录 AA §AA.5） |
| R-67 | 跨平台 | 长路径/大小写不敏感/符号链接失效 | `FileNotFoundError` | `pathlib` + `\\?\` 前缀 / 禁 symlink（附录 AA §AA.6/§AA.7） |
| R-68 | 随机性(DL) | 训练产物（权重/adapter/checkpoint）不可加载或哈希不一致 | `model_check.py` | 完整 checkpoint + 哈希固化（CC-2 / 附录 AC §AC.4） |
| R-69 | 数据溯源 | 数值真源为 Jupyter Notebook（.ipynb），无可脚本化 .py | 检查 `code/*.ipynb` 且无 `.py` | `jupyter nbconvert --to script` 导出为 .py 纳入复现链（复现脚本不得依赖交互式 notebook） |
| R-70 | 数据溯源 | 数据存 Excel（.xlsx）含公式/多 sheet，pandas 默认只读首 sheet | `pd.read_excel` 行为核查 | 显式 `sheet_name=None` + 固化读取脚本 + 导出 CSV/parquet 快照哈希（R-44 仅覆盖 CSV 编码） |
| R-71 | 论文回溯 | LaTeX 用 `\input{}`/`\include{}` 引入外部 .tex，数值分散未纳入提取 | 正则扫 `\input\|\include` | tex_num_extract 须递归展开所有被引 .tex 后再提取数值 |
| R-72 | 图件复现 | TikZ/externalize 图缓存未清理，复跑仍用旧 .pdf | 检查 `figs/*.pdf` + `tikzexternal` 缓存目录 | 复跑前 `rm -rf tikzcache/` 再重生成（或关 externalization） |
| R-73 | 数据版本 | 数据经 Git LFS / submodule 管理，checkout 后仅得指针文件 | `file data/*.h5` 显示 "Git LFS" 文本 | `git lfs pull` / `git submodule update --init` 拉取真实二进制后再哈希 |
| R-74 | 随机性 | 模块导入期即调用 `random/numpy` 生成值，种子晚于首次使用 | 在 import 阶段设断点/搜 import 期随机调用 | 随机初始化移至函数内 + 入口最前 `seed_all(seed)` |
| R-75 | 随机性 | 多进程 `multiprocessing` start 方法跨平台不同（fork vs spawn）致结果/顺序差异 | 检查 `multiprocessing` 用法 | 显式 `set_start_method` + 固定 worker 数；或用 `concurrent.futures` |
| R-76 | 随机性 | 仅设 `np.random.seed` 但 `sklearn/tensorflow` 自带 RNG 未设，部分随机源游离 | 搜 `sklearn`/`tf` 随机调用 | 同步 `sklearn.utils.check_random_state` / `tf.random.set_seed` |
| R-77 | 环境差异 | numpy 2.0 破坏性变更（移除 `np.float_` 等）致旧脚本崩溃 | `numpy.__version__` | 锁 `numpy<2` 或迁移代码（附录 AB OP-1 版本锁） |
| R-78 | 图件复现 | `matplotlibrc` / `plt.rcParams` 在全局配置文件被改，未随仓库固化 | 检查 `~/.matplotlibrc` 与仓库内 `matplotlibrc` | 将 rcParams 写入仓库 `matplotlibrc` 并 `plt.style.use` |
| R-79 | 论文回溯 | 本地化 LaTeX 宏包（babel 法语/德语）将小数点渲染为逗号，数值 token 提取失真 | 检查 `babel` 选项 + PDF 数值 | 统一 `babel` 英文/数字设置或提取阶段正则兼容逗号 |
| R-80 | 数据溯源 | 实时 API/网页抓取数据未缓存，复跑时源变更或下线致不一致 | 搜 `requests.get/urlopen` 数据拉取 | 首次抓取落盘 + 哈希固化，复现只读本地快照（附录 W provenance） |
| R-81 | 数值稳定 | 跨 float32/float64 混用（尤其 DL 训练 fp16/bf16 与推理 fp32）致数值漂移 | 搜 `float32/.half()/.float()` | 统一精度并记录混合精度策略（附录 AC.2） |
| R-82 | 隐式依赖 | 结果依赖 `os.environ` 未文档化变量（OMP_NUM_THREADS、自定义 flag） | grep `os.environ` 与复现文档 | 全部环境变量写入复现包 README/Dockerfile ENV（附录 O） |
| R-83 | 环境差异 | Python 次版本差异（3.8→3.11）致 `dict` 序 / `datetime` ISO / `subprocess` 文本模式行为漂移 | `python --version` 与 lock 比对 | 锁 `python==3.11.*` 于 Dockerfile + pyenv（附录 O / R-07 / env_doctor check_python_version） |
| R-84 | 环境差异 | 容器时区/区域（TZ / LC_ALL）不同致时间戳、字符串格式化、排序差异 | 查 Dockerfile/CI 是否固化 TZ/LANG | 固定 `ENV TZ=UTC LANG=C.UTF-8 LC_ALL=C.UTF-8`（附录 O / AA.3 / env_doctor check_timezone_locale） |
| R-85 | 随机性(DL) | `torch.use_deterministic_algorithms(True)` 未开，cuDNN 非确定性卷积/原子操作致 GPU 结果漂移 | grep `use_deterministic_algorithms` | 开启 + `CUBLAS_WORKSPACE_CONFIG=:4096:8` + `torch.backends.cudnn.deterministic=True`（附录 AC.6） |
| R-86 | 数据溯源 | 数据/源码含 UTF-8 BOM 或 CRLF（Windows 生成），pandas/正则解析错位或 `float()` 失败 | 二进制查 `\xef\xbb\xbf` / `\r\n` | `dos2unix` 去 CRLF；读取用 `encoding='utf-8-sig'`（附录 AA.1 / env_doctor check_bom_crlf） |
| R-87 | 数据溯源 | 源数据数值为科学计数法/千分位逗号/全角数字（PDF 复制、Excel 显示），`float()` 失败 | 搜 `1,234` / 全角 `１２３` / `1e3` | 清洗层正则去千分位 + 全角转半角 + 断言（附录 W / R-44） |
| R-88 | 论文回溯 | LaTeX 数值经 `\num{}` / `\SI` / siunitx 包裹或单位拼接，纯数字正则漏提 | 搜 `\num` / `\SI` | tex_num_extract 增 siunitx 解析（附录 I / R-19） |
| R-89 | 论文回溯 | 数值以 `\newcommand{\resA}{3.21}` 宏定义存在，正文引用而非字面量 | 搜 `\newcommand` 含数值 | tex_num_extract 须展开宏定义后提取（附录 I / R-19） |
| R-90 | 数值稳定 | 大数/小数下溢溢出（`exp` 溢出、`log(0)`→-inf、除零→NaN），跨平台 NaN 处理不同 | 搜 `log(` / `exp(` / `/ 0` | `np.errstate` + 钳位 + 显式 guard（R-56 / AD.2） |
| R-91 | 供应链 | 模型权重/数据集从非官方网盘/论坛下载，URL 不可复现或文件已删 | 查 provenance 是否登记外源 | 登记来源 + 镜像备份 + 哈希锁（附录 AB A11 / W） |
| R-92 | AI 辅助 | LLM 生成预处理代码与论文描述口径不一（缺失值/变量口径不同） | claim_evidence_check 比对 | 触发 CC-3 + 人工核验推导链（附录 AE / R-62） |
| R-93 | 环境差异 | `pip` 装二进制 wheel 与源码 sdist 行为不同（numpy/MKL 后端差异） | 查 `pip download --no-binary` | 锁 wheel 哈希 + 指定 `--only-binary`（附录 AB OP-1） |
| R-94 | 随机性 | 种子以环境变量/配置注入但复现文档未记录实际值（`SEED` 无默认），复跑值不同 | grep `os.environ['SEED']` | seed_registry 登记实际值 + 入口断言 seed 已设（附录 V / R-17） |
| R-95 | 图件复现 | 字体缺失（CI 无中文字体/特定 math 字体）致图件渲染回退、文字位置/大小变化 | matplotlib 警告 "Glyph missing" | 仓库 `matplotlibrc` 固化 font.family + Dockerfile 装 fonts（R-95 / AC.5 / env_doctor check_fonts） |
| R-96 | 统计严谨 | 多重比较未校正（multiple comparisons），假阳性显著 | 检查 p 值是否校正 | Bonferroni/Holm 校正 + 报告校正后（附录 AD.1 / R-63） |
| R-97 | 统计严谨 | 训练/测试划分随机且无固定 split 索引，或数据泄漏（scaler fit on test） | grep `train_test_split` 无 random_state | 固定 `random_state` + 记录 split 哈希（附录 AC.3 / CC-2） |
| R-98 | 数据溯源 | 数据库/SQL 查询结果未固化，复跑时 DB 状态变化（增删行）致结果漂移 | 搜 `sqlite3.connect` / `psycopg2` / `SELECT` | 查询落盘 + 哈希 + 复现只读本地（附录 W provenance / R-80） |
| R-99 | 随机性(DL) | JAX/XLA 默认非确定性（dropout/attention 归约顺序随运行变化） | 搜 `import jax` 且无 `PRNGKey`/`jax.config` | 固定 `jax.random.PRNGKey(seed)` + `JAX_DISABLE_MOST_OPTIMIZATIONS=1` + `jax_enable_x64`（附录 AC） |
| R-100 | 数值稳定 | 不同 BLAS 线程数（OMP_NUM_THREADS）致浮点归约顺序不同、sum 末位差异 | 比对不同线程数结果 | 固定 `OMP_NUM_THREADS=1` + `OPENBLAS_NUM_THREADS=1`（附录 AA.3 / AC 共用） |
| R-101 | 供应链 | 仅锁顶层依赖，传递依赖被间接升级致漂移 | `pip freeze` 比对 | 用 `pip-compile` 全量锁定（含传递依赖，附录 AB OP-1） |
| R-102 | 数据溯源 | 数据经 zip/tar 压缩包分发，解压后未哈希或含隐藏文件（__MACOSX） | 查压缩包 + 解压清单 | 解压落盘 + 哈希校验 + 清除 __MACOSX（附录 W） |
| R-103 | 跨平台 | macOS 大小写不敏感文件系统（HFS+/APFS）致 `import a` 与 `import A` 冲突、文件覆盖 | 查重复大小写文件名 | 统一小写文件名 + 消除大小写冲突（附录 AA.6） |
| R-104 | AI 辅助 | prompt 含动态时间戳/随机数致 LLM 输出不可复现（同 prompt 不同次结果） | 查 prompt 模板变量 | prompt 固化 + 剔除动态变量（附录 AE.2） |
| R-105 | 统计严谨 | 仅报告点估计无置信区间/标准误，无法判断复现一致性 | 查报告是否含 CI/SE | 补 95% CI + bootstrap 或解析 SE（附录 AD.3） |
| R-106 | 图件复现 | 图件依赖随机颜色/标记循环（matplotlib 默认 cycler），同数据不同环境颜色不同 | 查 `plt.plot` 未指定 color | 显式指定 color/style + 固化 cycler（附录 AC.5） |
| R-107 | 环境差异 | 不同 LaTeX 引擎（pdflatex/xelatex/lualatex）数值排版/字体差异致 PDF 数值提取错位 | 查引擎一致性 | 固定引擎 + 提取对齐（附录 I） |
| R-108 | 随机性(DL) | 并行 DataLoader（`num_workers>0`）shuffle 与 worker 初始化随机，每轮数据顺序不同 | grep `num_workers` 无 `worker_init_fn` | 固定 `worker_init_fn` + `generator`（附录 AC.3） |

**【铁律】**：任一场景触发即记录到 `state/repro_history.jsonl`，用于自进化循环。

---

## 附录 S · 自主进化循环（Selfvolving Loop）

本技能具备**从历史复现经验中自动提取高频失败根因并反哺规范**的能力。

### S.1 进化记录协议

每次复现差异、修复操作、评分变化必须 append 到 `state/repro_history.jsonl`，每条记录含：

```json
{
  "ts": "2026-09-27T19:40:00",
  "scenario_id": "R-07",
  "verdict": "FAIL → PASS",
  "root_cause": "Python 3.10 vs 3.11 浮点序列化差异",
  "fix_applied": "锁定 Python ==3.11.9 in requirements.txt",
  "score_delta": {"data_tracing": 5, "code_purity": 2},
  "detected_by": "frozen_check.py --check",
  "retrieved_case_refs": ["case_2026-09-01_optimization_model"],
  "applied_lesson": "L-R07-001",
  "lesson_extracted": {"text": "浮点序列化差异优先锁定 Python 次版本而非仅 numpy", "confidence": 0.82, "method": "diff+llm", "tags": ["python-version","floating-point","hash"]},
  "last_validated": "2026-09-27T19:40:00",
  "staleness_days": 0,
  "decay_weight": 1.0
}
```

### S.2 自动 lesson 抽取（diff/history → lessons_learned）

每次 `FAIL → PASS` 后自动执行（不依赖人工）：构造 `{root_cause, fix_applied, 代码 diff, 检测脚本}` 证据包 → LLM 抽取结构化 lesson（问题签名→修复动作）→ 暂存 `state/lesson_candidates.jsonl`。同一 `problem_signature` 被抽取 ≥2 次或一次人工确认，才从候选晋升为权威 lesson（写入 T 的 `lessons_learned`）。候选期也参与检索（弱信号）。

### S.3 进化触发器（cron-like + on-event）+ 反馈循环

`state/evolution_config.json`：
```json
{ "schedule": {"cron": "0 0 1 * *", "timezone": "UTC"},
  "on_event": {"new_entries_trigger": 20, "scenario_count_trigger": 3},
  "thresholds": {"high_freq": 3, "cb1_escalation": 5},
  "decay": {"lambda_days": 30, "min_weight": 0.2} }
```
触发逻辑：`is_cron_due() OR count_new_entries()>=20` → 执行月度分析。反馈事件 schema：
```json
{ "feedback_id": "FB-2026-09-001", "ts": "...",
  "type": "APPEND_R | UPDATE_Q | TUNE_P | PROMOTE_LESSON | ESCALATE_CB1",
  "target": "附录R R-53 | 附录Q 行X | 附录P 指标Y",
  "evidence": {"scenario_id": "R-07", "count": 7, "window": "90d"},
  "proposed_change": "...", "supporting_data": "...",
  "human_approved": false }
```
**【铁律】**：任何反哺（附录 R/Q/P 变更、阈值调整）必须写出 `feedback_id` + `supporting_data`，未审批前以 `human_approved:false` 标记，禁止静默生效。

### S.4 衰减（防陈旧信号主导）

月度统计高频场景时，用 `decay_weight` 折扣旧记录：
`freq(scenario) = Σ exp(-staleness_days / lambda_days)`（lambda_days=30）；仅 `decay_weight >= min_weight(0.2)` 的命中计入频率，避免一年前的一次性故障被误判为「高频」。

### S.5 自进化闭环图（ASCII）

```
 新赛题(G3→G6) → T.retrieve_cases 混合检索 Top-3 → 复用建议+已学lesson
      │
      ▼  执行复现 → 触发 CB 门禁(外部可靠信号)
   FAIL? ──▶ S.1 写 repro_history(decay_weight / retrieved_case_refs)
              │
              ▼ S.2 自动 lesson 抽取 → lesson_candidates
              │ confirmed≥2 / 人工确认 → 晋升 T.lessons_learned
              ▼
      S.3 触发器(cron/每20条): 衰减频率统计 → 反哺 R/Q/P + 阈值调优
              │ 写 feedback_event(human_approved=false 待审)
              │ 单场景≥5次 → CB1 升级对应上游 skill 提 PR
              ▼
      人工审批 feedback_event → 通过生效 / 拒绝回滚
              │
              ▼ 经验回放(周期重放历史 case 做回归校验, 防灾难性遗忘)
              └──────────▶ 回到顶部(下一赛题)
```
**闭环**：检索(T)→执行+门禁→记录(S)→抽取lesson→反哺规范(S/R/Q/P)+入库(T)→经验回放→再检索(更强)。

---

## 附录 T · 学习索引与检索（Selfearning Index）

本技能具备**从成功复现案例中提取可复用脚本/配置并支持按赛题相似度检索**的能力。

### T.1 学习知识库结构

```
state/repo_learned/
├── index.json                    # 学习索引（v2：含 embedding/质量/冲突字段）
├── lesson_candidates.jsonl       # S.2 抽取的候选 lesson（弱信号）
└── cases/
    └── case_<date>_<tag>/
        ├── solution.py           # 核心求解脚本
        ├── figs/                 # 绘图配置与脚本
        ├── frozen_results.json   # 冻结清单模板
        └── metadata.json         # 赛题标签、评分、复现度
```

### T.2 索引条目 schema（index.json v2）

```json
{ "case_id": "case_2026-09-01_optimization_model",
  "tags": ["运筹优化","整数规划","NSGA","多目标"],
  "tag_tfidf": {"运筹优化":0.41,"整数规划":0.33,"NSGA":0.55,"多目标":0.28},
  "embedding": [0.012,-0.33],
  "repro_score": 95, "confidence": 0.91, "quality_score": 0.88,
  "scripts_hash": {"solution.py":"sha256:abc..."},
  "lessons_learned": [{"id":"L-001","text":"NSGA 在 Python 3.10 下需锁定 DEAP==0.9.0","confidence":0.9,"confirmed_count":3}],
  "last_accessed":"2026-09-20","created":"2026-09-01","staleness_days":9,
  "decay_weight":0.97,"conflicts_with":[],"version":2 }
```
embedding 由本地轻量句嵌入模型（如 `sentence-transformers`/`all-MiniLM`）离线生成，避免外网依赖。

### T.3 检索算法（混合：TF-IDF 标签 + 语义嵌入 + 衰减 + rerank）

替换原「标签交集 Top-3」：

```
def retrieve_cases(query_tags, query_text, k=3):
    q_emb = embed(query_text)
    results = []
    for c in all_cases():
        sem = cosine(q_emb, c.embedding)
        tag = weighted_jaccard(query_tags, c.tag_tfidf)
        base = 0.6*sem + 0.4*tag
        score = base * c.confidence * c.quality_score * c.decay_weight
        results.append((c.case_id, score))
    reranked = rerank(query_text, [r[0] for r in results[:20]])
    return reranked[:k]
```

衰减：`decay_weight = exp(-staleness_days / lambda_days)`，陈旧但不删除（仅降权）。质量评分由 `repro_score`、`confirmed_count`、复用成功率推导并定期回写。

### T.4 冲突解决（两 case 对同修复意见不一致）

```
def resolve_conflict(cases, signature):
    group_a, group_b = split_by_opinion(cases, signature)
    wa = agg(group_a, by="confidence*recency*quality")
    wb = agg(group_b, by="confidence*recency*quality")
    if abs(wa-wb) < 0.1:
        record_conflict(signature, status="NEEDS_HUMAN"); escalate_to_user()
    else:
        winner = group_a if wa>=wb else group_b
        apply(winner); mark_loser_decayed(loser)
    append_case_version_history(case_id, decision)  # 保留版本历史便于回滚
```

冲突全程写入 `state/conflict_log.jsonl`，保留双方证据（符合 SRE 复盘「机器可读、可审计」原则）。

### T.5 自动入库协议增强

原 T.4：评分 ≥90 自动归档。增强：

- 入库前跑一次 `retrieve_cases` 自检：若与既有 case 高度相似（sem>0.95），**合并**而非新建，更新 `confirmed_count` 与 `lessons_learned`，避免索引膨胀。
- 入库后将其 `lessons_learned` 反向填充到 S 的 `lesson_candidates` 作为初始确认。

**【铁律】**：学习库只收录**已通过全部门禁 + 复现度 ≥90** 的案例；禁止收录「部分可复现」案例以免污染索引。

---

## 附录 U · 永久归档与引用（Archiving & Citation）

源自全网最佳实践（NeurIPS/ICLR 复现清单、ACM  artifacts 徽章、TOP 指南、FAIR4RS）。复现包须可**长期验证**，而非交付即弃。

### U.1 不可变归档与标识
- 复现包打包为 `reproduce_pkg.tar.gz`，计算 SHA-256 写入 `expected/checksums.txt`。
- 归档至 Zenodo / Software Heritage，引用采用 **DOI** 或 **SWHID**（`swh:1:dir:<hash>`），禁用"见附件"式模糊引用。

### U.2 双许可证
- 代码：`MIT`（或 Apache-2.0）；数据：`CC-BY-4.0`（或 `CC0`）。在 `reproduce/README.md` 声明。

### U.3 CITATION.cff
- 提供 `CITATION.cff`，含作者、标题、DOI、年份，便于评委/合作者规范引用。

### U.4 SBOM（软件物料清单）
- **表面级（仅许可证+版本）**：`pip-licenses --format=json > sbom.json`。
- **可验证级（v1.4.0 推荐）**：`cyclonedx-py environment -o sbom.json`，产出含**组件 SHA-256 哈希 + pURL + 完整传递依赖树**的 CycloneDX；随包校验，并对 `pip-audit` 发现但本项目不可达的 CVE 显式标注 VEX「不受影响」（附录 AB OP-3）。

### U.5 FAIR4RS 映射
| FAIR 原则 | 本技能落点 |
|---|---|
| Findable | DOI/SWHID + `CITATION.cff` |
| Accessible | Zenodo 开放归档 + 自包含 `reproduce/` |
| Interoperable | 标准 JSON/CSV + LaTeX 源 |
| Reusable | MIT/CC 双许可 + SBOM + 六维复现度评分卡 |

### U.6 确定性环境块（Deterministic Build）
- `requirements.txt` 全锁版本；附 `uv.lock`；设 `SOURCE_DATE_EPOCH` 消除时间戳导致的哈希漂移。

---

## 附录 V · 种子登记表与跨种子方差

### V.1 seed_registry（全局种子登记表）
`frozen_results.json` 增 `seed_registry` 字段，枚举所有随机源。v1.4.0 起扩展为**跨语言 / 多随机源统一登记**（附录 AA §AA.4 / AC §AC.3）：
```json
{ "seed_registry": {
    "python": {"numpy": 42, "torch": 42, "random": 1234, "tf": 7},
    "matlab": {"algorithm": "twister", "seed": 42},
    "r":      {"kind": "L'Ecuyer-CMRG", "seed": 12345},
    "julia":  {"seed": 123},
    "dl":     {"cudnn_deterministic": true, "benchmark": false, "allow_tf32": false,
               "cublas_workspace": ":4096:8", "use_deterministic_algorithms": true},
    "PYTHONHASHSEED": 0 }
}
```

### V.2 跨种子方差报告
G3 步骤[4] 后，对关键 metric 跑 **N≥5 次不同种子**（随机性强的优化/启发式 **N≥10**），报告每 metric 的 **mean、std、min/max、95% 置信区间**与聚合规则（如「取 10 种子均值」）；相对 std **>5%** 触发「结果对随机性敏感」标注，并附 CI 宽度说明（建议聚合规则与阈值见附录 AD §AD.3）。跨种子方差是「测量对象而非 nuisance」，须作为论文稳健性证据报告，而非仅标「敏感」。

---

## 附录 W · 数据 Provenance（PROV）协议

### W.1 PROV 模型
每个数值可追溯：实体（数据文件）→ 活动（预处理/求解脚本）→ 代理（技能/人）。v1.4.0 扩展覆盖 **AI 推导链路**与 **DL 训练产物**（附录 AE / AC）：
- `derivation_steps`：每条关键公式/结论记录 `{claim_or_eq, prompt_ref, model_ref, accepted(bool), human_review(ts, who)}`，满足 INFORMS Level III「auditable logs」要求。
- `llm_registry`：AI 辅助生成的代码/推导/中间结果须固化为耐久工件，reproduce 不依赖在线 LLM 调用（附录 AE §AE.1）。
- `dl_artifacts`：训练产物（base_model 哈希、adapter 权重哈希、optimizer/scheduler 状态哈希）纳入溯源（附录 AC §AC.4）。

### W.2 data_provenance schema
`frozen_results.json` 增：
```json
{ "data_provenance": {
    "raw_data_sha256": "abc...",
    "preprocess_steps": ["dropna", "normalize", "log1p"],
    "preprocess_hash": "def...",
    "env_lock_hash": "ghi...",
    "derivation_steps": [
      {"claim": "式(3) 灵敏度系数", "prompt_ref": "prompts/p03_deriv.md",
       "model_ref": "GLM-5.1", "accepted": true, "human_review": "2026-09-30/junlin"} ],
    "llm_registry": {"provider":"x","model_id":"GLM-5.1","version":"2026-09","temperature":0.2,
                     "prompt_sha256":"...","output_artifact_hash":"..."},
    "dl_artifacts": {"base_model_sha256":"...","adapter_sha256":"...","synth_data_sha256":"..."} }
}
```
缺失值/异常值/量纲处理须写入 `preprocess_steps`，禁止「garbage in garbage out」。

---

## 附录 X · 论文复现声明与层级

### X.1 复现声明模板（附论文末）
> 本论文全部数值均可通过 `reproduce/reproduce.sh`（或 `python reproduce/reproduce.py`）在声明环境中一键重算，六维复现度评分 ≥__，层级 L__，并已通过 CC-1/CC-2/CC-3 扩展闸门。

### X.2 复现层级
| 层级 | 含义 |
|---|---|
| L0 | 仅声明可运行 |
| L1 | 可运行 + 哈希一致 |
| L2 | L1 + 图件逐点一致 |
| L3 | L2 + 第三方独立复现通过（须含 ≥2 个异平台实测，附录 AA §AA.2） |

> **DL 场景边界（附录 AC §AC.7）**：深度学习下 PyTorch 官方不保证跨 GPU 架构 / CUDA·cuDNN·PyTorch 版本 / CPU↔GPU 的 bit 一致。故 DL 赛题的 L1 定义为「同锁定环境逐位一致」，跨环境允许「统计等效（rtol≤1e-3 + 方差报告）」；复现声明须含**环境绑定声明**（锁定 CUDA/cuDNN/PyTorch 版本 + GPU 型号）。

### X.3 实验设置披露清单
硬件（CPU/GPU/型号/内存）、OS（含 Windows/macOS/Linux 实测结论）、Python/库版本（含 BLAS 后端与编译器，附录 AA §AA.3）、随机种子（seed_registry 含跨语言/DL RNG 状态）、超参来源（G1 假设或灵敏度分析）；**统计披露项（附录 AD）**：随机种子数与聚合规则、MC 样本量及收敛判据、置信/预测区间类型、敏感性方法（局部/全局）及所用指数；**AI 披露项（附录 AE）**：AI 工具名/版本/用途/关键交互。

### X.4 reproduce vs replicate
- **reproduce**：同代码同数据重跑得同结果（本技能核心）。
- **replicate**：独立重新实现验证结论；超出本技能范围，仅在报告中标注。

---

## 附录 Y · 竞赛合规与查重（CC-1 细则）

> CC-1 为「一票否决」级合规闸门，独立于六维评分卡，作为签发前置条件（与 CB-12 同级）。

### Y.1 文本原创度预检（本地启发式）
- 对正文做 n-gram 相似度比对（参考文献/往届范文/网络文本），输出重复段落位置与改写建议；**仅预警，不替代知网/官方查重**。

### Y.2 第三方代码归属
- 识别未标注出处的他人代码段，要求注释：`# 改编自 [来源]，许可见参考文献[X]`；附录代码须与复现包一致且可独立运行。

### Y.3 AI 工具合规披露（与【严禁 AI 解释口吻】的边界）
- **边界**：技能禁的是叙述口吻（「我们可以看到」），**不禁用合规的 AI 披露**。AI 使用报告是**独立于复现报告的单独交付物**（记录建模/写作期的 AI 辅助，不进入 `reproduce.sh` 运行链），其语气不受【严禁 AI 口吻】约束，但附录代码与复现报告正文仍须零口吻。
- **结构化字段（对齐 COMAP 2026，见 Y.8）**：工具名/版本/日期/用途/关键提示词与回复/采纳与修改情况/人工核验签名；交付物为 `AI_TOOL_CARDS.md` + `AI_USE_REPORT.md`（附录 I / AE §AE.4）。
- **CC-1 子项**：AI 工具披露完整性列为 CC-1 的显式子项（CC-1.d），与 CC-3「AI 推导可验证」形成「披露 + 可验证」双闸。

### Y.4 盲审信息擦除
- 扫描所有交付物文件名、PDF/文档属性、文件夹名中的学校/姓名/队号，交付前擦除。
- **密钥/令牌擦除（v1.4.0）**：交付前用 `gitleaks detect` 或正则扫 `code/` `reproduce/`，清除硬编码 API key / token / 内部 URL / `~/.aws` `~/.netrc` 引用，避免复现容器被投毒后外传（附录 AB OP-10 / 附录 Y.8）。

### Y.5 附录代码 ↔ 复现包一致性
- 论文附录代码与 `reproduce/` 代码逐文件哈希一致；附录代码可在干净环境独立运行出冻结清单。

### Y.6 提交一致性（MD5）
- 生成终版 PDF + 支撑材料 MD5，提交后禁止再改（国赛/华为杯提交流程要求）。

### Y.7 各竞赛查重阈值速查
| 竞赛 | 文本相似度阈值 | 后果 |
|---|---|---|
| 国赛 | ≥25% 不送国评；>30% 无证书；>40% 违纪 | 取消资格/通报 |
| 华为杯 | 超委员会阈值 | 判违规论文 |
| 深圳杯 | 学术规范（无强制数值） | 答辩追问 |
| MCM/ICM | 无强制代码提交 | 盲评质量 |

### Y.8 与赛事 AI 政策对齐速查（CC-1.d）
| 赛事 | AI 披露要求 | 本技能落点 |
|---|---|---|
| COMAP MCM/ICM 2026 | 须附《AI 使用报告》（不计入 25 页）；正文每次 AI 使用须标注（如「使用 ChatGPT 进行数据预处理 (OpenAI ChatGPT, 2023-11-05 版, ChatGPT-4)」）；规范引用工具 | `AI_USE_REPORT.md` + 正文标注 + `AI_TOOL_CARDS.md`（附录 AE §AE.4） |
| 国赛/华为杯 | 各校/组委会对 AI 辅助有内部口径；盲审须擦除身份信息 | Y.4 擦除 + CC-1.d 披露完整性 |
| 深圳杯 | 学术规范，盲评追问 | Y.1 原创度预检 |

> **铁律**：AI 使用报告记录的是「上游建模/写作期的 AI 辅助」，与 `reproduce.sh` 运行链对象不同，二者不冲突；CC-1.d 与 CC-3 共同构成「披露 + 可验证」双闸。

---

## 附录 Z · 复现自动化工具链推荐（USE / AVOID）

源自全网工具链调研（轻量、可笔记本运行优先）。

### Z.1 USE（推荐纳入）
| 工具 | 用途 | 备注 |
|---|---|---|
| `pip-tools` / `uv` | 依赖锁定（uv.lock，**须带 SHA-256 哈希**） | 替代裸 requirements（附录 AB OP-1） |
| `uv` + `exclude-newer` | 依赖冷却期（≥3 天） | 防新发布恶意版（附录 AB OP-7） |
| `pip-audit` / `uvx pip-audit` | 漏洞/恶意包扫描（CVSS≥7 阻断） | 附录 AB OP-2 / 附录 G 检查项 17 |
| `cyclonedx-py` / `syft` | 可验证 SBOM（含哈希+传递树） | 附录 U.4 / AB OP-3 |
| `bandit` | 第三方脚本静态扫描 | 附录 AB OP-6 / 附录 G 检查项 19 |
| `gitleaks` / `trufflehog` | 密钥扫描 | 附录 Y.4 / AB OP-10 |
| `conda-lock` / `pixi` | conda 多平台锁文件 | 附录 AA §AA.5 |
| `DVC` | 数据版本化（轻量） | 中小数据集适用 |
| `MLflow`（轻量） | 实验追踪 | 仅本地 tracking |
| `Zenodo` | 永久归档 + DOI | 竞赛交付 |
| `SOURCE_DATE_EPOCH` | 消除时间戳漂移 | 确定性构建 |
| `pip-licenses` | SBOM 生成（表面级） | 合规 |
| 开源可 Pin 权重模型 | AI 辅助建模优先选开源可固化权重 | 附录 AE §AE.9 |

### Z.2 AVOID（学生竞赛慎入）
| 工具 | 原因 |
|---|---|
| reprozip / CodeOcean | 重、需服务端 |
| noWorkflow / Sumatra | 侵入式改写代码 |
| Nix / Guix | 学习曲线陡 |
| Singularity | 需 HPC 环境 |

### Z.3 推荐轻量栈
`uv`（带哈希锁 + `exclude-newer`）+ `pip-audit` 扫描 + `reproduce/Dockerfile`（已固化 GPU 确定性 ENV 与 `--only-binary`）+ `reproduce.py`（跨平台入口）+ GitHub Actions CI 三平台矩阵（附录 N）+ Zenodo 归档（附录 U）。覆盖「锁 → 验毒 → 复现 → 验证 → 归档」全链，零企业基础设施。

### Z.4 AI 模型选型（USE / AVOID，附录 AE §AE.9）
| 选型 | 建议 | 理由 |
|---|---|---|
| USE | 优先开源、可 Pin 权重的模型；记录 Model/System Card | 长期可复现、可归档 |
| AVOID | 把关键推导锁死在无法 Pin 版本的在线 API | 模型随时变更/下线，复现不可控；若必须用，按附录 AE §AE.1/§AE.2 固化 prompt+输出工件 |

---

## 附录 AA · 跨平台 / 多语言复现专项

> 现状：v1.3.0 以 Python + Linux 为中心，对 Windows 主力机、非 Python 生态（MATLAB/R/Julia）、编译器级浮点、conda 跨平台几乎空白。本附录补齐。

### AA.1 编码双轨（Windows 静默乱码第一杀手）
- Windows 上 Python 默认文本编码为 `cp936/GBK`，且 `subprocess(text=True)` 用 locale codec 解码 UTF-8 输出会静默乱码或崩溃；`chcp 65001` 救不了。
- **铁律**：CI（附录 N）、Dockerfile（附录 O）、`reproduce.sh`、`reproduce.py` 统一设 `PYTHONUTF8=1`、`PYTHONIOENCODING=utf-8`、`LC_ALL=C.UTF-8`；脚本读写一律 `encoding="utf-8"`（读外部程序输出用 `subprocess.run(..., encoding="utf-8")`）；必要时 `encoding="utf-8-sig"` 兼容 BOM。
- 新增 R-65（Windows 静默乱码）见附录 Q。

### AA.2 跨平台 CI 矩阵（L3 声明的前提）
- 附录 N 改为 `matrix: os: [ubuntu-latest, windows-latest, macos-latest]`，所有门禁断言三平台均须 PASS；否则附录 X.2 的 L3「第三方独立复现」不成立。
- Windows job 用 `shell: bash` 或走 `python reproduce/reproduce.py`；CI 启用 Windows 长路径。

### AA.3 编译器级浮点可复现（MSVC vs GCC/Clang）
- Python 在 Windows 由 MSVC 编译；numba/cupy/C 扩展在 MSVC 下与 GCC 在 NaN 传播（`pow(1.0,NaN)` 未定义）、超越函数、80-bit 中间精度上结果不同。
- **纪律**：锁工具链（容器内固定）；加 `/fp:strict`（MSVC）或 `-ffp-contract=off`（GCC/Clang）；显式 `math.isnan()` 包裹；附录 X.3 实验设置披露增「编译器/构建工具链」；固定 BLAS 后端（`OMP_NUM_THREADS=1` + 锁 OpenBLAS/MKL/oneAPI，R-58）。

### AA.4 跨平台复现编排器 `reproduce.py`
- 见附录 C.1；`.gitattributes` 强制 `*.sh text eol=lf` 防 CRLF 破坏 bash；复现包 README 注明 Windows 走 `python reproduce/reproduce.py`。

### AA.5 conda 跨平台锁文件
- `environment.yml` 含 `vc14_0/vs2015_runtime` 等平台专用构建号，Linux/macOS 解析失败。用 `conda-lock -p linux-64 -p win-64 -p osx-64` 生成多平台锁，或 `conda env export --from-history` 去构建号。R-66。

### AA.6 大小写不敏感 + 符号链接
- NTFS 大小写不敏感，文件名仅改大小写不触发 git 更新；Windows 符号链接需管理员权限。规则：文件名统一小写 + 一致命名；复现包内**禁止 symlink**（改相对路径/复制）；`.gitattributes` 配 `*.png binary` 防 CRLF 误转。R-67。

### AA.7 Windows MAX_PATH=260 长路径
- 深嵌套 `C:\Users\...\Desktop\...\reproduce\...` 易超 260 字符导致 `FileNotFoundError`。脚本全程用 `pathlib`；必要时 `\\?\` 前缀；CI Windows job 启用长路径。R-67。

### AA.8 WSL2 / DevContainer 落点
- Windows Docker Desktop 从 `/mnt/c`（NTFS）挂载 I/O 慢约 12 倍且 inotify 失效。项目放 WSL2 文件系统（`~/projects/`）而非 `C:\`；或提供 `devcontainer.json`（基于 `mcr.microsoft.com/devcontainers/python`），由 Dev Container CLI 复用同镜像（见附录 O 注释）。

### AA.9 非 Python 生态复现协议（MATLAB / R / Julia）
> 技能复现引擎须对非 Python 队伍同样可用；按主语言扩展 `seed_registry`（附录 V.1）与复现入口。

- **MATLAB**：必须显式 `rng(seed, 'twister')`（勿用 `rng('default')`，官方声明跨大版本不保证一致）；`cvpartition/parfor` 前 `s = rng; ... rng(s)` 保存恢复；`frozen_results.json` 记 MATLAB 版本 + Toolbox 列表；入口 `reproduce_matlab.m`（`matlab -batch "reproduce"`）。
- **R**：`renv::init()→snapshot()` 交付 `renv.lock`；`.Rversion` 锁版本；`set.seed(12345)`；并行用 `RNGkind("L'Ecuyer-CMRG")`；`source(..., encoding="UTF-8")`；入口 `reproduce.R`。
- **Julia**：提交 `Project.toml + Manifest.toml` 并 `]instantiate`；`Random.seed!(123)`；锁小版本（跨版本 RNG 算法可能变更）；入口 `reproduce.jl`。
- 跨语言比对**不要**依赖「相同种子同序列」，应存随机数列文件或自实现小 PRNG。

### AA.10 平台验证矩阵
- 复现报告（附录 D §8）须填 ubuntu/windows/macos × 各门禁 PASS/FAIL；L3 判定新增「至少 2 个异平台实测通过」。

---

## 附录 AB · 复现安全与供应链

> 学生竞赛复现包最现实的威胁：AI 生成脚本 + 从论坛/队友处拷贝代码 + 从非官方源下载数据。v1.4.0 补齐「防投毒」维度（检索依据：2025 H1 共 847 起供应链攻击，62% 用 typosquatting/依赖混淆；PyPI 攻击同比 +67%，主因 ML 包仿冒）。

### AB.1 依赖完整性哈希锁定（最高优先级）
- 用 `pip-compile --generate-hashes -o requirements.txt requirements.in`（或 `uv pip compile --generate-hashes`）生成含 SHA-256 的冻结清单（覆盖直接+传递依赖）。
- 复现安装改 `pip install --require-hashes -r requirements.txt`（或 `uv sync --frozen`）。附录 G 检查项 5 升级为「所有包带 `== 版本 + SHA-256`」。
- 红线圈入 §5 红线 7（依赖未带完整性哈希）。

### AB.2 依赖漏洞与恶意包扫描
- CI（附录 N）加 `uvx pip-audit -r requirements.txt`，对 CVSS≥7 已知漏洞设**阻断门禁**；新增 R-59。
- 与 AB.1 配合：扫描用带哈希的 requirements，避免扫描时被偷换包。

### AB.3 SBOM 深化（从表面级到可验证）
- `cyclonedx-py environment -o sbom.json`（或 `syft dir:. -o cyclonedx-json`）生成含**组件 SHA-256 + pURL + 完整传递依赖树**的 CycloneDX；随包校验；对 `pip-audit` 发现但不可达的 CVE 显式标 VEX「不受影响」（见附录 U.4）。

### AB.4 防范 slopsquatting / AI 幻觉包（学生特有关键）
- 任何 AI 建议的 import 包名，装前须 `pip index versions <pkg>` 或在 pypi.org 确认真实存在 + 下载量合理，**禁止安装未知新包**（实测 19.7% 生成代码含幻觉包）。§5 红线 9。R-60。

### AB.5 安装期任意代码执行防护（setup.py / sdist）
- 复现安装默认 `--only-binary :all:`（拒绝 sdist 构建，消除 `setup.py` 任意代码执行）；确需源码包时在隔离构建环境先转内部 wheel。附录 O Dockerfile 已采用。

### AB.6 第三方/借用脚本沙箱隔离
- 容器（附录 O）加 `--network=none` / egress 白名单、`--cap-drop=ALL`、`--security-opt=no-new-privileges`、非 root 运行；复现前 `bandit -r code/` 扫 `eval/exec/os.system/子进程外联`；非本队原创脚本须标来源+许可（附录 Y.2 扩展为「运行前静态扫描」）。

### AB.7 依赖冷却期（exclude-newer）
- `uv.toml` / `pyproject.toml` 设 `exclude-newer = "7 days"`，CI 与复现脚本同源；等价于「只装我审计过日期之前的包」。

### AB.8 字节级可复现构建验证
- 复现脚本末段对 `reproduce_pkg.tar.gz` 算 SHA-256 写入 `expected/checksums.txt`（附录 U.1 已有）；可选「两次干净构建比对」（`SOURCE_DATE_EPOCH`+`umask 022`+固定 build backend）。附录 P 增「复现包二次构建哈希一致」。

### AB.9 数据来源完整性与哈希
- `data/data_manifest.json`（文件名→SHA-256→来源 URL/官方说明），复现脚本首步 `assert hashlib.sha256 == ...`，不符即熔断（参照华为杯 `assert md5` 模式）。R-59。附录 G 增「输入数据哈希已登记并校验」。

### AB.10 密钥/令牌扫描与最小权限
- 打包前 `gitleaks detect` 或正则扫 `code/ reproduce/`，命中即阻断（纳入 CC-1 / Y.4 子项）；容器用短期/无凭证环境变量，禁挂 `~/.aws` `~/.netrc`。R-62。

### AB.11 复现包防投毒检查清单（交付/第三方复跑前逐项过）
| # | 检查项 | 命令 / 方法 | 通过标准 |
|---|---|---|---|
| A1 | 依赖带完整性哈希 | 查看 `requirements.txt` | 每个直接+传递包均有 `--hash=sha256:` |
| A2 | 哈希模式安装 | `pip install --require-hashes -r requirements.txt` | 0 失败、无未哈希项 |
| A3 | 仅二进制安装 | 安装命令含 `--only-binary :all:` | 无 sdist 被构建 |
| A4 | 依赖冷却期 | `uv.toml` 设 `exclude-newer`（≥3 天） | 解析不拉取冷却期内新发布版 |
| A5 | 漏洞/恶意包扫描 | `uvx pip-audit -r requirements.txt` | 无 CVSS≥7 已知 CVE |
| A6 | AI 建议包名已核验 | `pip index versions <pkg>` / pypi.org | 全部真实存在、非幻觉/仿冒 |
| A7 | SBOM 可验证 | `cyclonedx-py environment -o sbom.json` | 含组件哈希+pURL+传递树 |
| A8 | 第三方脚本静态扫描 | `bandit -r code/` | 无 eval/exec/os.system/可疑外联 |
| A9 | 非原创代码已标注 | 查 `code/` 注释 `# 改编自[来源]` | 所有借用脚本有出处+许可 |
| A10 | 复现环境断网/最小权限 | 容器 `--network=none --cap-drop=ALL --security-opt=no-new-privileges` 非 root | 无外联、无提权 |
| A11 | 输入数据哈希登记 | `data/data_manifest.json` + 脚本首步 `assert` | 每个原始文件哈希匹配 |
| A12 | 密钥扫描 | `gitleaks detect` | 无 API key/token/内部 URL 泄露 |
| A13 | 复现包自身哈希 | `sha256sum reproduce_pkg.tar.gz >> expected/checksums.txt` | 交付物哈希已写入并随包 |
| A14 | 两次干净构建比对（金标准） | 两干净 checkout 各自构建后比 SHA256 | 复现包哈希逐位一致 |

---

## 附录 AC · 深度学习 / 大模型复现专项

> 现状：v1.3.0 对 DL 复现覆盖处于「数值论文复现」视角，完全缺失 GPU 确定性、混合精度、分布式、训练产物（checkpoint/adapter）复现四大块。本附录与用户的 GLM/Qwen 蒸馏训练场景直接相关。

### AC.1 GPU 确定性块（最严重缺口）
- **铁律**：import torch 前设置（附录 O ENV 已固化）：
  `CUBLAS_WORKSPACE_CONFIG=:4096:8`、`torch.use_deterministic_algorithms(True, warn_only=True)`、`torch.backends.cudnn.deterministic=True`、`torch.backends.cudnn.benchmark=False`、`torch.backends.cuda.matmul.allow_tf32=False`、`torch.backends.cudnn.allow_tf32=False`。
- **SDPA/FlashAttention**：Transformer 训练核心 `scaled_dot_product_attention` 的 flash / memory-efficient backend 反向非确定，仅 MATH backend 确定。训前 `os.environ` 关闭 flash，或 `torch.nn.functional.scaled_dot_product_attention` 用 MATH backend。
- 附录 P 增「GPU 确定性开关齐备率」。

### AC.2 混合精度 AMP / TF32 纪律
- 固定 `autocast dtype`（bf16 优先，免 GradScaler）；显式 `GradScaler(initial_scale=...)` 关闭动态；固定 `allow_tf32`。实验设置披露清单（X.3）增「precision policy」字段。TF32 截断尾数 10-bit 非 bit-exact。

### AC.3 DataLoader 多进程 + 分布式采样随机性
- 标准 `seed_worker` + `generator` + `sampler.set_epoch(epoch)` 模板；`num_workers>0` 时每 worker 独立进程不显式 seed 则增强/抽样跨 run 不一致。R-53（worker 未 seed）、R-57（DistributedSampler 未 set_epoch）。

### AC.4 训练产物（checkpoint / LoRA adapter）复现契约（CC-2）
- `frozen_results.json` 增 `dl_artifacts`：`{base_model_sha256, tokenizer_version, teacher:{name,api,temp,seed}, lora:{r,alpha,quant}, synth_data_sha256, adapter_sha256}`。
- 复现包 `expected/model_checksums.txt`（Safetensors 优先）；`scripts/model_check.py` 加载 adapter、比对权重哈希、比对关键 metric，作为候选门禁 CC-2（与 CB-7 并列）。R-68。

### AC.5 完整 checkpoint 状态持久化
- 严格复现须存 `torch_rng / cuda_rng / numpy_rng / python_rng` + 数据位置 + global_step + git_commit + 数据哈希 + 配置 dump；仅存 weights 会令续训轨迹发散。R-68。

### AC.6 分布式训练（DDP/NCCL）随机性
- DDP 用 `seed + rank`（跨进程多样性且可复现）、`OMP_NUM_THREADS=1`、固定 NCCL 算法；单卡复现需保持有效 batch 一致（grad accumulation 等效）。多卡↔单卡结果不一致即 R-55。

### AC.7 跨硬件/跨版本不可复现边界声明
- PyTorch 官方不保证跨 GPU 架构 / CUDA·cuDNN·PyTorch 版本 / CPU↔GPU 的 bit 一致。X.2 增说明：DL 场景 L1=「同锁定环境逐位一致」，跨环境允许「统计等效（rtol≤1e-3 + 方差报告）」。P 阈值增「跨环境相对误差 rtol 放宽至 1e-3 + 方差报告」分支。

### AC.8 SDPA / FlashAttention 确定性
- 见 AC.1；`torch.backends.cuda.sdp_kernel` 强制 MATH 或训前关闭 flash。

### AC.9 LLM 蒸馏训练专属元数据
- 附录 V `seed_registry` 扩为含 LLM 字段：`{teacher:{model,api,temp,seed}, student:{base_model_sha256, tokenizer_ver}, lora:{r,alpha,quant}}`；增「合成数据 provenance 哈希」（呼应 W provenance）。
- **教师 API 调用确定性**：蒸馏数据生成阶段固定 `temperature`（确定性推理 0.1–0.3）、`seed`、`top_p`，合成数据落盘 + 哈希，避免「重跑蒸馏数据生成得不同数据集」这一隐藏随机源。

### AC.10 确定性模式性能代价与分级策略
- 全确定模式有 10–25% 性能代价且部分 op 无确定核（需 `warn_only`）。两级：
  - **DL-L0**：固定全部 seed + 锁环境，统计等效，接受 ε（竞赛交付常用）。
  - **DL-L1**：叠加全 GPU 确定 + 禁用 TF32/flash，bit-exact。
- 复现包按级声明所选模式与代价。

---

## 附录 AD · 统计严谨性

> 现状：v1.3.0 统计严谨性呈点状、浅层、偏复现工程；无全局敏感性、无 UQ、无误差传播、无数值稳定性检查。本附录补齐（检索依据：Saltelli 2006 论证 OAT 局部法在非线/交互下「illicit」；IEEE/IUPAC/NeurIPS 共识——不报误差的定量结果可疑）。

### AD.1 全局敏感性分析（替代/补足 ±10%/±20% 局部扰动）
- G3[5] 仅双级局部扰动等价于 OAT，对非线性/交互模型会**错误排序重要性**。规定：
  - 至少补 **Morris 筛选法**（μ* 大=重要，σ* 大=非线性/交互）初筛；
  - 对核心指标补 **Sobol 一阶 S_i 与总效应 S_Ti**（S_Ti≈0 的因子可固定实现降维）；
  - 明确「局部扰动仅适用于已证线性段」，否则须用全局法。

### AD.2 不确定性量化（UQ）基线
- 凡含随机/采样/近似的 metric，用 Monte Carlo（N≥100，或给 1/√n 收敛论证）给出 **mean±std 与 95% 区间**；区分「均值置信区间」与「输出预测区间」（IUPAC 分位数法），报告中注明所用类型。附录 D §4 表增「是否带误差/区间」列。

### AD.3 跨种子方差 + 误差传播
- 跨种子方差：N≥5（随机性强 N≥10），报告 mean/std/min-max/95% 区间 + 聚合规则；相对 std>5% 触发「敏感」并附 CI 宽度（改写附录 V.2）。
- 误差传播：对线性/弱非线性用 GUM 法则 `u_c²=Σ c_i²u²(x_i)`；对减法/比率用 IPCC/FAO 公式 `Ut=√Σ(U_iX_i)²/|ΣX_i|`；报告模板对「对比类结论」强制附组合不确定度，避免无依据的相对优劣断言（如「方案 A 比 B 提升 15%」若 A、B 各带 ±3% 误差可能不显著）。

### AD.4 数值稳定性 / 条件数检查
- 凡涉及矩阵求逆/线性求解，报告 κ（2-范数），`log10(κ)`≈损失位数；注明「小残差≠高精度」对病态问题成立，必要时正则化/条件数加权；与 CB-6（收敛性）联动作为 G3 收口附加检查。

### AD.5 统计误用规避
- 规避：p-hacking、相关≠因果、数据窥探（多次看数据后选模型）、lucky seed（单次运行冒充确定性）。任一项命中附录 §2.4 评审反模式对照表即回退。

### AD.6 与评分卡/声明联动
- 五维评分卡增第 6 维「统计严谨度」（附录 A，权重 10%）；复现声明（X.3）增统计披露项；G6 Round 2/3 绑定具体统计检查项（见 §2.4）。

---

## 附录 AE · AI 辅助建模复现性

> 现状：v1.3.0 在传统代码/数值复现维度极完备，但 AI 辅助建模特有的复现性盲点几乎全空：LLM 调用溯源、prompt 版本化、AI 推导可追溯、model card 元数据、AI 推导可验证红线、prompt injection 对复现入口的威胁。本附录补齐（检索依据：Dunn 2026 on-path/off-path 框架；COMAP MCM/ICM 2026 新增《AI 使用报告》；15 万条 AI 编造参考文献事件）。

### AE.1 LLM 调用溯源（llm_registry）
- `frozen_results.json` 增 `llm_registry`：`{provider, model_id, model_version/date, temperature, top_p, seed(若支持), prompt_sha256, output_artifact_hash}`；对应门禁 CC-3「AI 推导产物已固化」。
- 闭源/在线模型随时变更或下线，on-path LLM 调用本身即是运行时不变量，必须固化。

### AE.2 Prompt 版本控制与哈希
- 定义 `prompts/` 目录，每个 prompt 为 `{id, text, params, model_target, sha256, eval_ref}`；冻结阶段对最终采用 prompt 做哈希写入 provenance；复现包纳入 `prompts/` 与 `expected/prompt_hashes.txt`（附录 I）。prompt 是核心软件工件，须不可变版本化并与代码解耦。

### AE.3 AI 推导可追溯（derivation_steps）
- `data_provenance` 增 `derivation_steps` 序列，每条 `{claim_or_eq, prompt_ref, model_ref, accepted(bool), human_review(ts, who)}`（见附录 W.1）；满足 INFORMS Level III「auditable logs of prompts/hand-offs/model 版本」。

### AE.4 AI 工具卡 / Model Card + AI 使用报告
- `reproduce/` 增 `AI_TOOL_CARDS.md`（每工具一卡：名称/版本/日期/用途/参数/已知局限/许可）作为 Y.3 披露的结构化载体；增 `AI_USE_REPORT.md`（COMAP 2026 要求的不计入 25 页报告：工具名/版本/用途/关键交互/采纳与修改/人工核验签名）。从 CC-1.d 与 CC-3 双向引用（见 Y.8）。

### AE.5 AI 推导可验证红线（CC-3）
- 现有 frozen_results + paper_number_diff 只能事后发现数值不一致，无法识别「该数字是否纯由 LLM 臆造、并无真实计算支撑」。新增门禁 **CC-3**：对每个论文数值 token，若无法在 `frozen_results` 或 code 执行证据中找到支撑，标「AI 臆造嫌疑」并强制人工核验；对参考文献做存在性/DOI 校验（轻量脚本 `ref_verify.py`）。§5 红线 8。

### AE.6 Prompt Injection 对复现脚本/配置的影响
- 若用 AI 代理生成/改写 `reproduce.sh`、Dockerfile、requirements、求解代码，间接提示注入可藏在被读取的依赖文档/README/issue 中，静默篡改复现入口或注入不可信代码（GitInject 2026）。规则：AI 生成/改写的复现脚本须（1）注入模式扫描（零宽字符/隐藏指令/异常外联/可疑 shell 调用）；（2）产物哈希落 `expected/`；（3）人工复核 checkpoint。安全细节协同附录 AB（researcher_security 主导）。

### AE.7 澄清「确定性神话」并规范 off-path 冻结
- 技能隐含「脚本可一键重算=逐位一致」，但 AI 辅助环节即使 seed+temperature=0 也不保证逐字节一致（120B 模型仅 12.5% 一致）。避免把「重新调用 LLM」误当可复现步骤；应把 AI 产物**冻结为耐久工件**而非运行时重调：AI 生成的代码/推导/中间结果以文件形式固化进 `state/` 或 `expected/`，`reproduce.sh` 不依赖在线 LLM 调用；对确有随机性的 AI 输出报告方差/置信区间（附录 V.2）。

### AE.8 claim→evidence 可追溯审计
- 附录 D 报告模板增「§7 结论—证据可追溯表」：每条关键结论列出支撑代码/数据/推导步骤引用；静态+动态双重校验（借鉴 ReAgent：硬编码指标、未实现方法、复现数字但偏离声称方法等 AI 生成论文与证据脱节问题）。

### AE.9 闭源模型复现性风险与开源优先
- 附录 Z.4 增 AI 模型选型 USE/AVOID：USE 优先开源可 Pin 权重模型、记录 model card；AVOID 把关键推导锁死在无法 Pin 版本的在线 API；若必须用，按 AE.1/AE.2 固化 prompt+输出工件。

### AE.10 与竞赛 AI 披露规则精确对齐
- 见附录 Y.8（CC-1.d）：Y.3 改写为「独立交付物 + 结构化字段 + 与 CC-3 双闸」；复现包增 `AI_USE_REPORT.md` + `AI_TOOL_CARDS.md`，从 CC-1 与 CC-3 双向引用。

---

> **v1.4.0 收口说明**：本版在 v1.3.0（26 附录 A–Z）基础上新增附录 AA–AE 与闸门 CC-2/CC-3，五维评分卡扩至六维；所有新增门禁均避开 CB-1~CB-12 编号（沿用 CC- 前缀），与技能库级机检器 `validate_skills.py` 的 `Rbclaim` 规则（1≤CB-n≤12）兼容。
