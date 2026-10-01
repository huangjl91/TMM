#!/usr/bin/env bash
# reproduce.sh — 一条命令复现全流程（G3→G4→G5→G6）
set -euo pipefail

PROJ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJ"

echo "[1/5] CB-7 冻结清单哈希校验"
python scripts/frozen_check.py --check || { echo "CB-7 FAIL"; exit 1; }

echo "[2/5] CB-6 重跑求解"
python code/solve_main.py || { echo "CB-6 FAIL"; exit 1; }

echo "[3/5] CB-8 重生成图件"
python code/make_figs.py || { echo "CB-8 FAIL"; exit 1; }

echo "[4/5] CB-10 论文数值双向比对"
python scripts/paper_number_diff.py || { echo "CB-10 FAIL"; exit 1; }

echo "[5/5] CB-10 编译论文"
( cd paper && xelatex -interaction=nonstopmode main.tex >/dev/null ) || { echo "CB-10 FAIL"; exit 1; }

echo "REPRODUCE: PASS"
