# mathduce · 数学建模论文全流程复现引擎

> 数学建模竞赛论文复现技能（G3→G4→G5→G6）：冻结清单数据溯源与哈希重算、图件脚本一键再生成与逐点比对、LaTeX 论文数值双向回溯、四轮评审召回与六维复现度评分卡签发。
> 当前版本 **v1.4.1**（31 附录 A–Z + AA–AE，12 个开箱即用 `.py` 脚本）。详见 [`SKILL.md`](./SKILL.md)。

## 它解决什么

把一份已完成的竞赛论文，还原为「可被第三方在一台干净机器上、用一条命令重跑出逐位一致结果」的可复现制品。
**不负责首次建模与首次求解**，只负责 **复现 · 比对 · 召回 · 签发**。

## 快速开始

```bash
# 1) 安装技能自带工具链（仅 scripts/ 与 reproduce 入口需要）
pip install -r reproduce/requirements.skill.txt

# 2) 一条命令复现（Windows 原生 / 跨平台）
python reproduce/reproduce.py          # 或 Linux/macOS/WSL: bash reproduce/reproduce.sh

# 3) 单步调用（按需）
python scripts/frozen_check.py --check          # CB-7 冻结清单哈希
python scripts/paper_number_diff.py             # CB-10 论文数值双向比对
python scripts/repro_score.py                   # 六维复现度评分卡
```

## 门禁一览

| 门禁 | 含义 |
|---|---|
| CB-1~CB-12 | 复现视角四要素熔断门禁（哈希、数值一致、图件、合规等） |
| CC-1 | 竞赛合规闸门（原创度/代码归属/AI 披露/盲审擦除） |
| CC-2 | 深度学习训练产物复现闸门（权重/adapter 哈希一致） |
| CC-3 | AI 推导可验证闸门（数值须有代码/计算证据） |

## 脚本清单（`scripts/`）

`frozen_check` · `fig_diff` · `fig_lint` · `tex_num_extract` · `paper_number_diff` ·
`repro_score` · `model_check`(CC-2) · `data_check`(AB) · `ref_verify`(CC-3) ·
`claim_evidence_check`(CC-3) · `prompt_verify`(AE) + `reproduce/reproduce.py` 编排器。
全部遵循 `0=PASS / 1=FAIL` 返回码约定，可直接被 `reproduce.sh` / CI 判定。

## 跨平台

纯 Windows（无 WSL/Git Bash）走 `python reproduce/reproduce.py`；CI 提供 ubuntu/windows/macos 三平台矩阵（附录 N）。
所有脚本统一 `pathlib` 推导项目根、读写 `encoding="utf-8"`、设 `PYTHONUTF8=1`，杜绝静默乱码。

## 许可证

MIT（技能本体）；复现包内的数据与代码按 `CITATION.cff` / `reproduce/README.md` 声明。
