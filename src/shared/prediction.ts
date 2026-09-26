import type { DataPreviewSelection, SessionFileView } from './intake'
import { isReadableTabularFile } from './intake'

export interface PredictionBaselineSelection extends DataPreviewSelection {
  targetColumn?: string | null
  testRatio?: number
}

export interface PredictionEvidenceSummary {
  bestModel: string
  selectionMetric: string
  trainRange: string
  testRange: string
  trainRows: number
  testRows: number
  metrics: Array<{ model: string; mae: number; rmse: number; mape: number | null }>
}

/** 从沙箱证据文件提取可展示的客观结果；结构不完整时不猜测。 */
export function summarizePredictionEvidence(value: unknown): PredictionEvidenceSummary | null {
  if (!value || typeof value !== 'object') return null
  const evidence = value as Record<string, unknown>
  if (evidence.schemaVersion !== 'tmm-model-evidence-v1') return null
  const selection = evidence.selection as Record<string, unknown> | undefined
  const split = evidence.split as Record<string, unknown> | undefined
  const byModel = evidence.metricsByModel as Record<string, Record<string, unknown>> | undefined
  if (!selection || !split || !byModel || typeof selection.bestModel !== 'string') return null

  const metrics = Object.entries(byModel).flatMap(([model, raw]) => {
    const mae = Number(raw.MAE)
    const rmse = Number(raw.RMSE)
    const mapeRaw = raw.MAPE_percent
    const mape = mapeRaw === null ? null : Number(mapeRaw)
    return Number.isFinite(mae) && Number.isFinite(rmse) && (mape === null || Number.isFinite(mape))
      ? [{ model, mae, rmse, mape }]
      : []
  })
  if (!metrics.length) return null

  const trainRows = Number(split.trainRows)
  const testRows = Number(split.testRows)
  if (!Number.isInteger(trainRows) || !Number.isInteger(testRows)) return null
  return {
    bestModel: selection.bestModel,
    selectionMetric: typeof selection.metric === 'string' ? selection.metric : 'RMSE',
    trainRange: `${String(split.trainStart)} 至 ${String(split.trainEnd)}`,
    testRange: `${String(split.testStart)} 至 ${String(split.testEnd)}`,
    trainRows,
    testRows,
    metrics
  }
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

# 三个可解释基线共用同一个按时间留出的测试集。
actual = work['_target'].iloc[train_count:].to_numpy(dtype=float)
naive_pred = work['_target'].shift(1).iloc[train_count:].to_numpy(dtype=float)

# 线性趋势只在训练段拟合，再一次性外推测试段，不接触测试目标值。
train_x = np.arange(train_count, dtype=float)
test_x = np.arange(train_count, len(work), dtype=float)
trend_slope, trend_intercept = np.polyfit(train_x, work['_target'].iloc[:train_count].to_numpy(dtype=float), 1)
trend_pred = trend_intercept + trend_slope * test_x

# 3 期移动平均采用滚动预测；每个测试点只使用当时已经观测到的历史值。
history = work['_target'].iloc[:train_count].to_list()
moving_pred = []
for observed in actual:
    moving_pred.append(float(np.mean(history[-3:])))
    history.append(float(observed))
moving_pred = np.asarray(moving_pred, dtype=float)

nonzero = actual != 0
def metric_set(prediction):
    errors = actual - prediction
    return {
        'MAE': float(np.mean(np.abs(errors))),
        'RMSE': float(np.sqrt(np.mean(errors ** 2))),
        'MAPE_percent': float(np.mean(np.abs(errors[nonzero] / actual[nonzero])) * 100) if bool(nonzero.any()) else None,
        'MAPE_nonzeroSamples': int(nonzero.sum())
    }

predictions = {
    'walk-forward-naive-lag-1': naive_pred,
    'linear-trend': trend_pred,
    'walk-forward-moving-average-3': moving_pred
}
algorithm_records = [
    {
        'id': 'walk-forward-naive-lag-1',
        'description': '测试期每一点使用前一期已经观测到的真实值作为预测',
        'usesFutureInformation': False
    },
    {
        'id': 'linear-trend',
        'description': '只用训练段拟合线性趋势，并外推整个测试段',
        'usesFutureInformation': False,
        'parameters': {'slope': float(trend_slope), 'intercept': float(trend_intercept)}
    },
    {
        'id': 'walk-forward-moving-average-3',
        'description': '使用预测时点之前最近 3 个已观测值的均值',
        'usesFutureInformation': False,
        'parameters': {'window': 3}
    }
]

# 只有时间间隔可识别且训练段至少覆盖两个完整周期时，才加入季节朴素基线。
inferred_frequency = pd.infer_freq(work['_time']) if len(work) >= 3 else None
frequency_key = (inferred_frequency or '').lower()
seasonal_period = None
if frequency_key.startswith(('ms', 'me')):
    seasonal_period = 12
elif frequency_key.startswith(('qs', 'qe')):
    seasonal_period = 4
elif frequency_key.startswith('w'):
    seasonal_period = 52
elif frequency_key.startswith('d'):
    seasonal_period = 7
elif frequency_key.startswith('h'):
    seasonal_period = 24

skipped_models = []
if seasonal_period and train_count >= 2 * seasonal_period:
    seasonal_pred = np.asarray([
        float(work['_target'].iloc[index - seasonal_period])
        for index in range(train_count, len(work))
    ], dtype=float)
    seasonal_id = f'seasonal-naive-{seasonal_period}'
    predictions[seasonal_id] = seasonal_pred
    algorithm_records.append({
        'id': seasonal_id,
        'description': f'使用前一完整季节同位置的观测值，周期为 {seasonal_period}',
        'usesFutureInformation': False,
        'parameters': {'period': seasonal_period, 'inferredFrequency': inferred_frequency}
    })
else:
    reason = '无法从时间字段识别支持的固定频率' if not seasonal_period else f'训练段至少需要 {2 * seasonal_period} 行以覆盖两个完整周期'
    skipped_models.append({'id': 'seasonal-naive', 'reason': reason, 'inferredFrequency': inferred_frequency})

metrics = {name: metric_set(values) for name, values in predictions.items()}
best_model = min(metrics, key=lambda name: metrics[name]['RMSE'])
best_pred = predictions[best_model]
errors = actual - best_pred

result = pd.DataFrame({
    'time': work['_time'].iloc[train_count:].dt.strftime('%Y-%m-%dT%H:%M:%S').to_numpy(),
    'actual': actual,
    'naive_lag_1': naive_pred,
    'linear_trend': trend_pred,
    'moving_average_3': moving_pred,
})
if seasonal_period and train_count >= 2 * seasonal_period:
    result[f'seasonal_naive_{seasonal_period}'] = seasonal_pred
result['best_model_prediction'] = best_pred
result['residual'] = errors
result.to_csv('prediction_baseline_results.csv', index=False, encoding='utf-8-sig')

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 7), sharex=False)
test_time = work['_time'].iloc[train_count:]
ax1.plot(test_time, actual, marker='o', linewidth=1.7, label='测试集真实值')
ax1.plot(test_time, naive_pred, marker='s', linestyle='--', linewidth=1.3, label='上一期观测')
ax1.plot(test_time, trend_pred, marker='^', linestyle='--', linewidth=1.3, label='线性趋势')
ax1.plot(test_time, moving_pred, marker='d', linestyle='--', linewidth=1.3, label='3期移动平均')
if seasonal_period and train_count >= 2 * seasonal_period:
    ax1.plot(test_time, seasonal_pred, marker='x', linestyle='--', linewidth=1.3, label=f'季节朴素（周期{seasonal_period}）')
ax1.set_title(f'预测模型同测试集比较：{TARGET_COLUMN}')
ax1.set_ylabel(TARGET_COLUMN)
ax1.grid(True, linestyle='--', alpha=0.35)
ax1.legend()
ax2.axhline(0, color='#555555', linewidth=1)
ax2.bar(test_time, errors, width=15 if len(test_time) > 1 else 1, color='#4c78a8')
ax2.set_title(f'最佳模型残差（真实值 - 预测值）：{best_model}')
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
    'purpose': '教学用预测基线比较与评估流程检查，不代表最终模型',
    'sourceFile': DATA_FILE.as_posix(),
    'sourceSha256': source_hash,
    'configuration': configuration,
    'configurationSha256': hashlib.sha256(json.dumps(configuration, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest(),
    'algorithms': algorithm_records,
    'skippedModels': skipped_models,
    'timeFrequency': {'inferred': inferred_frequency, 'seasonalPeriod': seasonal_period},
    'split': {
        'strategy': 'chronological-holdout',
        'trainRows': int(train_count),
        'testRows': int(test_count),
        'trainStart': work['_time'].iloc[0].isoformat(),
        'trainEnd': work['_time'].iloc[train_count - 1].isoformat(),
        'testStart': work['_time'].iloc[train_count].isoformat(),
        'testEnd': work['_time'].iloc[-1].isoformat()
    },
    'selection': {
        'metric': 'RMSE',
        'bestModel': best_model,
        'scope': 'same chronological holdout test set'
    },
    'metricsByModel': metrics,
    'outputs': [
        {'path': 'prediction_baseline_results.csv', 'sha256': result_hash},
        {'path': 'prediction_baseline.png', 'sha256': plot_hash}
    ]
}
Path('model_evidence.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'时间切分: 训练 {train_count} 行，测试 {test_count} 行')
print('同一测试集模型比较:')
for name, values in metrics.items():
    print(f"  {name}: MAE={values['MAE']:.6g}, RMSE={values['RMSE']:.6g}, MAPE={values['MAPE_percent'] if values['MAPE_percent'] is not None else '不适用'}")
print(f'当前测试集最佳模型（按 RMSE）: {best_model}')
print('已生成 prediction_baseline_results.csv、prediction_baseline.png 与 model_evidence.json')
print('这是比较后续模型的最低基线，不是论文结论。')
`
}
