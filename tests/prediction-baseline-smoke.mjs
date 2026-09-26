import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildPredictionBaselineCode, summarizePredictionEvidence } from '../.tmp/prediction.mjs'

const root = resolve('.tmp/prediction-baseline')
const attachmentDir = join(root, '附件')
rmSync(root, { recursive: true, force: true })
mkdirSync(attachmentDir, { recursive: true })

const rows = ['月份,用电负荷_kWh']
for (let month = 1; month <= 30; month += 1) {
  const date = new Date(Date.UTC(2024, month - 1, 1)).toISOString().slice(0, 10)
  rows.push(`${date},${1000 + month * 12 + (month % 3) * 5}`)
}
writeFileSync(join(attachmentDir, '基线夹具.csv'), `${rows.join('\n')}\n`, 'utf8')

const code = buildPredictionBaselineCode(
  { kind: 'data', name: '基线夹具.csv', relPath: '附件/基线夹具.csv' },
  { xColumn: '月份', targetColumn: '用电负荷_kWh', testRatio: 0.2 }
)
assert.ok(code)
writeFileSync(join(root, 'run_baseline.py'), code, 'utf8')

const python = process.env.PYTHON312 || 'py'
const args = process.env.PYTHON312 ? ['run_baseline.py'] : ['-3.12', 'run_baseline.py']
execFileSync(python, args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, MPLBACKEND: 'Agg', MPLCONFIGDIR: join(root, '.mplconfig') }
})

for (const name of ['prediction_baseline_results.csv', 'prediction_baseline.png', 'model_evidence.json']) {
  assert.ok(existsSync(join(root, name)), `缺少产物 ${name}`)
}
const manifest = JSON.parse(readFileSync(join(root, 'model_evidence.json'), 'utf8'))
assert.equal(manifest.schemaVersion, 'tmm-model-evidence-v1')
assert.deepEqual(manifest.algorithms.map((item) => item.id), [
  'walk-forward-naive-lag-1',
  'linear-trend',
  'walk-forward-moving-average-3'
])
assert.ok(manifest.algorithms.every((item) => item.usesFutureInformation === false))
assert.equal(manifest.split.trainRows, 24)
assert.equal(manifest.split.testRows, 6)
assert.equal(manifest.selection.metric, 'RMSE')
assert.ok(manifest.metricsByModel[manifest.selection.bestModel])
for (const metrics of Object.values(manifest.metricsByModel)) {
  assert.ok(metrics.MAE >= 0)
  assert.ok(metrics.RMSE >= metrics.MAE)
}
assert.equal(manifest.outputs.length, 2)
assert.ok(manifest.outputs.every((item) => item.sha256.length === 64))
assert.equal(manifest.sourceSha256.length, 64)
assert.equal(manifest.configurationSha256.length, 64)
const summary = summarizePredictionEvidence(manifest)
assert.ok(summary)
assert.equal(summary.bestModel, manifest.selection.bestModel)
assert.equal(summary.metrics.length, 3)
assert.equal(summary.trainRows, 24)
assert.equal(summary.testRows, 6)
assert.equal(summarizePredictionEvidence({ schemaVersion: 'wrong' }), null)

console.log('PASS  时间切分 → 三模型同集比较 → 指标选优 → 预测图 → 模型证据清单')
