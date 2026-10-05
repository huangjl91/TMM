import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

if (!process.argv.includes('--reload')) await build({
  entryPoints: ['tests/prediction-lab-harness.ts'], bundle: true, format: 'esm', platform: 'node',
  outfile: '.tmp/prediction-lab-harness.mjs', define: { __dirname: JSON.stringify(resolve('out/main')) },
  plugins: [{ name: 'isolated-electron', setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const app = { getPath: () => process.env.TMM_LAB_TEST_ROOT, getAppPath: () => process.cwd(), getVersion: () => 'test' };
      export const safeStorage = { isEncryptionAvailable: () => false };
      export const BrowserWindow = { getAllWindows: () => [] }; export const shell = {}; export const dialog = {};
    ` }))
  } }]
})
mkdirSync('.tmp', { recursive: true })
process.env.TMM_LAB_TEST_ROOT ||= mkdtempSync(resolve('.tmp/prediction-lab-test-'))
const h = await import('../.tmp/prediction-lab-harness.mjs')
h.initDb(process.env.TMM_LAB_TEST_ROOT)
if (process.argv.includes('--reload')) {
  const state = h.getPredictionLab(Number(process.argv[3]), 1)
  assert.ok(state.reflectedAt)
  assert.ok(state.experiment.summary.metrics.length >= 3)
  assert.ok(existsSync(join(h.workspaceDir(Number(process.argv[3])), state.experiment.plotName)))
  console.log('PASS 跨进程恢复实验指标、专属图表与复盘')
  process.exit(0)
}
const sid = h.createSession('预测实验测试（合成数据）', 'custom', 'offline')
const tutorialId = h.createTutorial()
const tutorial = h.getGuidedState(tutorialId, 1)
assert.equal(tutorial.sourceReady, true)
assert.equal(tutorial.categoryAssessment.active, 'prediction')
assert.equal(tutorial.currentStep, 'intuition')
assert.equal(tutorial.generatedDraft, undefined)
assert.equal(h.listSessionFiles(tutorialId).length, 2)
assert.equal(h.getPredictionLab(tutorialId, 1).experiment, undefined)
await assert.rejects(h.runPredictionLab(tutorialId, 1), /先提交/)
const root = h.workspaceDir(sid)
const file = join(root, 'fixture.csv')
const csv = 'date,value\n' + Array.from({ length: 60 }, (_, i) => `${new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10)},${100 + i * 2 + (i % 7)}`).join('\n')
writeFileSync(file, csv)
h.addSessionFile(sid, 'data', 'fixture.csv', 'fixture.csv', Buffer.byteLength(csv), 'text', '合成测试数据')
const plan = { file: 'fixture.csv', sheet: '', timeColumn: 'date', targetColumn: 'value', unit: '人', expectation: '预计趋势法误差较小，用测试集 RMSE 与上一期基线比较。' }
assert.throws(() => h.savePredictionPlan(sid, 1, { ...plan, unit: '' }), /单位/)
h.savePredictionPlan(sid, 1, plan)
await assert.rejects(h.runPredictionLab(sid, 1), /先提交/)
for (const step of ['intuition', 'model_select']) h.saveGuidedChoice(sid, 1, step, 'A', '测试选项', '', JSON.stringify({ version: 1, submitted: true, hintLevel: 0, answers: ['时间序列', '比较简单基线', '用末段测试集检查误差'] }))
const result = await h.runPredictionLab(sid, 1)
assert.equal(result.experiment.summary.testRows, 12)
assert.ok(result.experiment.summary.metrics.every(m => Number.isFinite(m.rmse)))
assert.equal(h.getPredictionLab(sid, 2).experiment, undefined)
const reflection = { comparison: '按表中 RMSE 比较候选与基线。', limitation: '仅有 12 行测试数据，不能推断长期表现。', nextAction: '增加跨时间段验证并检查残差。' }
assert.throws(() => h.savePredictionReflection(sid, 1, -1, reflection), /本次证据/)
h.savePredictionReflection(sid, 1, result.experiment.runId, reflection)
const reload = spawnSync(process.execPath, ['tests/prediction-lab-smoke.mjs', '--reload', String(sid)], { encoding: 'utf8', env: process.env })
assert.equal(reload.status, 0, reload.stderr + reload.stdout)
console.log(reload.stdout.trim())
writeFileSync(file, csv + '\n2025-03-02,230')
assert.match(h.getPredictionLab(sid, 1).staleReason, /已改变/)
assert.throws(() => h.savePredictionReflection(sid, 1, result.experiment.runId, reflection), /先运行/)
assert.equal(h.savePredictionPlan(sid, 1, { ...plan, targetColumn: 'missing' }).experiment, undefined)
await assert.rejects(h.runPredictionLab(sid, 1))
assert.equal(h.getPredictionLab(sid, 1).experiment, undefined)
console.log('PASS 真实沙箱执行、前置检查、小问隔离、证据失效、失败不标记完成')
