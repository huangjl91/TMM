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
  'walk-forward-moving-average-3',
  'seasonal-naive-12'
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
assert.equal(manifest.timeFrequency.inferred, 'MS')
assert.equal(manifest.timeFrequency.seasonalPeriod, 12)
assert.deepEqual(manifest.skippedModels, [])
assert.equal(summary.metrics.length, 4)
assert.equal(summary.trainRows, 24)
assert.equal(summary.testRows, 6)
assert.equal(summarizePredictionEvidence({ schemaVersion: 'wrong' }), null)

const shortRoot = resolve('.tmp/prediction-seasonal-skip')
const shortAttachmentDir = join(shortRoot, '附件')
rmSync(shortRoot, { recursive: true, force: true })
mkdirSync(shortAttachmentDir, { recursive: true })
writeFileSync(
  join(shortAttachmentDir, '短月度序列.csv'),
  `${rows.slice(0, 19).join('\n')}\n`,
  'utf8'
)
const shortCode = buildPredictionBaselineCode(
  { kind: 'data', name: '短月度序列.csv', relPath: '附件/短月度序列.csv' },
  { xColumn: '月份', targetColumn: '用电负荷_kWh', testRatio: 0.2 }
)
assert.ok(shortCode)
writeFileSync(join(shortRoot, 'run_baseline.py'), shortCode, 'utf8')
execFileSync(python, args, {
  cwd: shortRoot,
  stdio: 'pipe',
  env: { ...process.env, MPLBACKEND: 'Agg', MPLCONFIGDIR: join(shortRoot, '.mplconfig') }
})
const shortManifest = JSON.parse(readFileSync(join(shortRoot, 'model_evidence.json'), 'utf8'))
assert.equal(shortManifest.timeFrequency.inferred, 'MS')
assert.equal(shortManifest.algorithms.some((item) => item.id.startsWith('seasonal-naive-')), false)
assert.match(shortManifest.skippedModels[0].reason, /至少需要 24 行/)

console.log('PASS  时间切分 → 基础与季节模型同集比较 → 指标选优 → 预测图 → 模型证据清单')
