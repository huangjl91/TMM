import type { DataPreviewSelection, SessionFileView } from './intake'
import { isReadableTabularFile } from './intake'

export interface PredictionBaselineSelection extends DataPreviewSelection {
  targetColumn?: string | null
  testRatio?: number
}

/**
 * 生成可复现的时间序列基线代码。基线只用于验收数据与评估流程，
 * 不会被包装成最终模型，也不会向论文自动写入结论。
 */
export function buildPredictionBaselineCode(
  file: Pick<SessionFileView, 'kind' | 'relPath' | 'name'>,
  selection: PredictionBaselineSelection
): string | null {
  if (!isReadableTabularFile(file) || !selection.xColumn || !selection.targetColumn) return null

  const pathLiteral = JSON.stringify(file.relPath.replace(/\\/g, '/'))
  const isExcel = /\.xlsx?$/i.test(file.name)
  const isTsv = /\.tsv$/i.test(file.name)
  const sheetLiteral = JSON.stringify(selection.sheetName ?? 0)
  const xLiteral = JSON.stringify(selection.xColumn)
  const targetLiteral = JSON.stringify(selection.targetColumn)
  const ratio = Number.isFinite(selection.testRatio) ? Math.min(0.4, Math.max(0.1, selection.testRatio!)) : 0.2
  const reader = isExcel
    ? `pd.read_excel(DATA_FILE, sheet_name=SHEET_NAME)`
    : `pd.read_csv(DATA_FILE${isTsv ? ", sep='\\t'" : ''})`

  return `# 可复现预测基线：按时间切分，用上一期真实观测预测下一期
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import math
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

DATA_FILE = Path(${pathLiteral})
SHEET_NAME = ${sheetLiteral}
TIME_COLUMN = ${xLiteral}
TARGET_COLUMN = ${targetLiteral}
TEST_RATIO = ${ratio}
MIN_ROWS = 12

if not DATA_FILE.exists():
    raise FileNotFoundError(f'找不到已导入附件: {DATA_FILE}')

raw = ${reader}
missing_columns = [name for name in (TIME_COLUMN, TARGET_COLUMN) if name not in raw.columns]
if missing_columns:
    raise ValueError(f'找不到所选字段: {missing_columns}')

work = raw[[TIME_COLUMN, TARGET_COLUMN]].copy()
work['_time'] = pd.to_datetime(work[TIME_COLUMN], errors='coerce')
work['_target'] = pd.to_numeric(work[TARGET_COLUMN], errors='coerce')
invalid_time = int(work['_time'].isna().sum())
invalid_target = int(work['_target'].isna().sum())
if invalid_time or invalid_target:
    raise ValueError(f'时间字段有 {invalid_time} 个无效值，目标字段有 {invalid_target} 个无效值；请先清洗，基线不会静默删行')
if bool(work['_time'].duplicated().any()):
    raise ValueError('时间字段存在重复值；请先明确聚合规则，基线不会自行合并')

work = work.sort_values('_time', kind='stable').reset_index(drop=True)
if len(work) < MIN_ROWS:
    raise ValueError(f'至少需要 {MIN_ROWS} 行有效时序数据，当前只有 {len(work)} 行')

test_count = max(2, int(math.ceil(len(work) * TEST_RATIO)))
train_count = len(work) - test_count
if train_count < 2:
    raise ValueError('训练段不足 2 行，无法建立上一期观测基线')

# walk-forward naive：测试期每一点只使用它前一期已经观测到的真实值。
actual = work['_target'].iloc[train_count:].to_numpy(dtype=float)
predicted = work['_target'].shift(1).iloc[train_count:].to_numpy(dtype=float)
errors = actual - predicted
mae = float(np.mean(np.abs(errors)))
rmse = float(np.sqrt(np.mean(errors ** 2)))
nonzero = actual != 0
mape = float(np.mean(np.abs(errors[nonzero] / actual[nonzero])) * 100) if bool(nonzero.any()) else None

result = pd.DataFrame({
    'time': work['_time'].iloc[train_count:].dt.strftime('%Y-%m-%dT%H:%M:%S').to_numpy(),
    'actual': actual,
    'predicted': predicted,
    'residual': errors
})
result.to_csv('prediction_baseline_results.csv', index=False, encoding='utf-8-sig')

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 7), sharex=False)
test_time = work['_time'].iloc[train_count:]
ax1.plot(test_time, actual, marker='o', linewidth=1.7, label='测试集真实值')
ax1.plot(test_time, predicted, marker='s', linestyle='--', linewidth=1.5, label='上一期观测基线')
ax1.set_title(f'预测基线验证：{TARGET_COLUMN}')
ax1.set_ylabel(TARGET_COLUMN)
ax1.grid(True, linestyle='--', alpha=0.35)
ax1.legend()
ax2.axhline(0, color='#555555', linewidth=1)
ax2.bar(test_time, errors, width=15 if len(test_time) > 1 else 1, color='#4c78a8')
ax2.set_title('测试集残差（真实值 - 预测值）')
ax2.set_xlabel(TIME_COLUMN)
ax2.set_ylabel('残差')
ax2.grid(True, axis='y', linestyle='--', alpha=0.35)
fig.autofmt_xdate()
plt.tight_layout()
plt.savefig('prediction_baseline.png', dpi=300)

source_hash = hashlib.sha256(DATA_FILE.read_bytes()).hexdigest()
result_hash = hashlib.sha256(Path('prediction_baseline_results.csv').read_bytes()).hexdigest()
plot_hash = hashlib.sha256(Path('prediction_baseline.png').read_bytes()).hexdigest()
configuration = {
    'sheet': SHEET_NAME if DATA_FILE.suffix.lower() in ('.xlsx', '.xls') else None,
    'timeColumn': TIME_COLUMN,
    'targetColumn': TARGET_COLUMN,
    'testRatio': TEST_RATIO,
    'minimumRows': MIN_ROWS
}
manifest = {
    'schemaVersion': 'tmm-model-evidence-v1',
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'purpose': '教学用预测基线与评估流程检查，不代表最终模型',
    'sourceFile': DATA_FILE.as_posix(),
    'sourceSha256': source_hash,
    'configuration': configuration,
    'configurationSha256': hashlib.sha256(json.dumps(configuration, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest(),
    'algorithm': {
        'id': 'walk-forward-naive-lag-1',
        'description': '测试期每一点使用前一期已经观测到的真实值作为预测',
        'usesFutureInformation': False
    },
    'split': {
        'strategy': 'chronological-holdout',
        'trainRows': int(train_count),
        'testRows': int(test_count),
        'trainStart': work['_time'].iloc[0].isoformat(),
        'trainEnd': work['_time'].iloc[train_count - 1].isoformat(),
        'testStart': work['_time'].iloc[train_count].isoformat(),
        'testEnd': work['_time'].iloc[-1].isoformat()
    },
    'metrics': {
        'MAE': mae,
        'RMSE': rmse,
        'MAPE_percent': mape,
        'MAPE_nonzeroSamples': int(nonzero.sum())
    },
    'outputs': [
        {'path': 'prediction_baseline_results.csv', 'sha256': result_hash},
        {'path': 'prediction_baseline.png', 'sha256': plot_hash}
    ]
}
Path('model_evidence.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'时间切分: 训练 {train_count} 行，测试 {test_count} 行')
print(f'MAE={mae:.6g}, RMSE={rmse:.6g}, MAPE={mape if mape is not None else "不适用"}')
print('已生成 prediction_baseline_results.csv、prediction_baseline.png 与 model_evidence.json')
print('这是比较后续模型的最低基线，不是论文结论。')
`
}
