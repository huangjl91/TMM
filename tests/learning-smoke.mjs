import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

if (!process.argv.includes('--reload')) {
  await build({
    entryPoints: ['tests/learning-harness.ts'], bundle: true, format: 'esm', platform: 'node',
    outfile: '.tmp/learning-harness.mjs', logLevel: 'warning',
    plugins: [{ name: 'offline-electron', setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'offline' }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: `
        export const safeStorage = { isEncryptionAvailable: () => false };
        export const app = { getPath: () => '', getVersion: () => 'test' };
        export const BrowserWindow = { getAllWindows: () => [] };
        export const shell = {}; export const dialog = {};
      ` }))
    } }]
  })
}
const h = await import('../.tmp/learning-harness.mjs')
if (process.argv.includes('--reload')) {
  h.initDb(process.argv[3])
  const state = h.getGuidedState(Number(process.argv[4]), 1)
  assert.equal(state.currentStep, 'model_select')
  const note = h.readLearningNote(state.choices.intuition.userNote)
  assert.equal(note.hintLevel, 2)
  assert.equal(note.helpTopic, 'validate')
  assert.equal(note.helpLevel, 2)
  assert.equal(note.answers[0], '预测明天客流')
  assert.equal(h.learningStepReady('intuition', state.choices.intuition), true)
  console.log('PASS 跨进程恢复回答、提示等级和学习进度')
  process.exit(0)
}

mkdirSync('.tmp', { recursive: true })
const dir = mkdtempSync(resolve('.tmp/learning-db-'))
h.initDb(dir)
const sid = h.createSession('教学流程测试', 'custom', 'offline')
h.saveStageOutputs(sid, 1, { problems: '问题一：根据历史每日客流数据预测明天客流，并比较预测误差。' })
const initial = h.getGuidedState(sid, 1)
const option = initial.questions.intuition.options[0]
const answers = ['预测明天客流', '附件中的历史每日客流', '明天客流预测值，单位为人']
function choose(step, note, key) {
  const option = h.getGuidedState(sid, 1).questions[step].options[0]
  return h.handleGuidedChoose(sid, 1, step, {
    pickedKey: key ?? option.key, pickedText: '不信任客户端文案', pickedMeans: '', userNote: JSON.stringify(note)
  })
}
const note = { version: 1, answers, hintLevel: 2, submitted: false, helpTopic: 'validate', helpLevel: 2 }
assert.equal(h.readLearningNote(JSON.stringify({ ...note, helpTopic: '__proto__' })).helpTopic, undefined)
assert.equal(h.readLearningNote(JSON.stringify({ ...note, helpLevel: 999 })).helpLevel, 3)
let state = choose('intuition', note, '')
assert.equal(state.currentStep, 'intuition')
assert.equal(state.generatedDraft, undefined)
assert.equal(h.readLearningNote(state.choices.intuition.userNote).hintLevel, 2)
state = choose('intuition', { ...note, answers: [' ', '', ''], submitted: true })
assert.equal(h.learningStepReady('intuition', state.choices.intuition), false)
assert.match(h.reviewLearning('intuition', h.readLearningNote(state.choices.intuition.userNote), option.key).message, /要解决的问题/)
assert.throws(() => choose('model_select', { ...note, submitted: true }), /先提交读题/)
assert.equal(h.handleGuidedSync(sid, 1).ok, false)
state = choose('intuition', { ...note, submitted: true })
assert.equal(state.choices.intuition.pickedText, option.text)
assert.equal(state.currentStep, 'model_select')
const reload = spawnSync(process.execPath, ['tests/learning-smoke.mjs', '--reload', dir, String(sid)], { encoding: 'utf8' })
assert.equal(reload.status, 0, reload.stderr + reload.stdout)
console.log(reload.stdout.trim())
state = choose('model_select', { ...note, answers: ['存在时间顺序', '上一日人数作为基线', '留出末段数据比较误差'], submitted: true })
assert.equal(state.currentStep, 'formulation')
assert.match(state.generatedDraft.problemRestatement, /预测明天客流/)
assert.equal(h.handleGuidedSync(sid, 1).ok, true)
assert.match(h.latestStageOutputs(sid, 4)['q1:candidates'], /上一日人数/)
assert.ok(h.listAiUsage(sid).some((entry) => entry.detail.includes('留出末段数据')))
assert.throws(() => choose('intuition', note, 'INVALID'), /有效选项/)
assert.equal(h.readLearningNote('旧版理由').answers[0], '旧版理由')
assert.equal(h.readLearningNote('null').submitted, false)
h.saveGuidedChoice(sid, 2, 'intuition', option.key, option.text, option.means, '旧版理由')
assert.equal(h.learningStepReady('intuition', h.getGuidedState(sid, 2).choices.intuition), false)
assert.equal(h.getGuidedState(sid, 1).currentStep, 'formulation')
state = choose('intuition', { ...note, answers: ['', '', ''] })
assert.equal(state.choices.model_select, undefined)
assert.equal(state.generatedDraft, undefined)
assert.equal(state.currentStep, 'intuition')
assert.equal(h.handleGuidedSync(sid, 1).ok, false)
console.log('PASS 草稿/提交区分、逐项反馈、前置检查、旧记录兼容、小问隔离、真实理由同步')
