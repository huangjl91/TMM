import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync, realpathSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'
import { getDb } from './db'
import { addRun, getGuidedChoices, listSessionFiles, logAiUsage, sessionInfo } from './repo'
import { learningStepReady } from '../shared/learning'
import { readArtifact, runCode, workspaceDir } from './sandbox'
import { buildPredictionBaselineCode, summarizePredictionEvidence } from '../shared/prediction'
import { emptyLab, labInputKey, planMissing, type PredictionLabPlan, type PredictionLabState } from '../shared/predictionLab'

function validate(sid: number, q: number): void {
  if (!Number.isInteger(sid) || !sessionInfo(sid)) throw new Error('会话不存在。')
  if (!Number.isInteger(q) || q < 1 || q > 12) throw new Error('小问编号无效。')
}
function sourceHash(sid: number, file: string): string {
  if (!listSessionFiles(sid).some((entry) => entry.kind === 'data' && entry.relPath === file)) throw new Error('数据附件不存在。')
  const root = realpathSync(workspaceDir(sid))
  const path = realpathSync(resolve(root, file))
  const rel = relative(root, path)
  if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('数据路径超出工作区。')
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
function store(sid: number, q: number, state: PredictionLabState): PredictionLabState {
  const { staleReason: _stale, ...saved } = state
  getDb().prepare('INSERT INTO prediction_labs(session_id,question_idx,state_json) VALUES(?,?,?) ON CONFLICT(session_id,question_idx) DO UPDATE SET state_json=excluded.state_json')
    .run(sid, q, JSON.stringify(saved))
  return getPredictionLab(sid, q)
}
export function getPredictionLab(sid: number, q: number): PredictionLabState {
  validate(sid, q)
  const row = getDb().prepare('SELECT state_json FROM prediction_labs WHERE session_id=? AND question_idx=?').get(sid, q) as { state_json: string } | undefined
  const state: PredictionLabState = row ? JSON.parse(row.state_json) : emptyLab()
  if (state.experiment) {
    try {
      if (sourceHash(sid, state.plan.file) !== state.experiment.sourceHash) state.staleReason = '附件内容已改变，旧指标仅供查看，请重新运行。'
    } catch { state.staleReason = '原数据附件不可读取，请重新选择并运行。' }
  }
  return state
}
export function savePredictionPlan(sid: number, q: number, input: PredictionLabPlan): PredictionLabState {
  const state = getPredictionLab(sid, q)
  if (!input || ['file', 'sheet', 'timeColumn', 'targetColumn', 'unit', 'expectation'].some((key) => typeof input[key as keyof PredictionLabPlan] !== 'string' || input[key as keyof PredictionLabPlan].length > 4000)) throw new Error('实验计划格式不正确。')
  const plan = Object.fromEntries(Object.entries(input).filter(([key]) => ['file', 'sheet', 'timeColumn', 'targetColumn', 'unit', 'expectation'].includes(key)).map(([key, value]) => [key, value.trim()])) as unknown as PredictionLabPlan
  const missing = planMissing(plan)
  if (missing) throw new Error(missing)
  sourceHash(sid, plan.file)
  const next = labInputKey(plan) === labInputKey(state.plan) ? { ...state, plan } : { ...emptyLab(), plan }
  return store(sid, q, next)
}
const busy = new Set<number>()
export async function runPredictionLab(sid: number, q: number): Promise<PredictionLabState> {
  if (busy.has(sid)) throw new Error('本会话的预测实验正在运行。')
  const state = getPredictionLab(sid, q)
  const choices = getGuidedChoices(sid, q)
  if (!learningStepReady('intuition', choices.intuition) || !learningStepReady('model_select', choices.model_select)) throw new Error('请先提交读题复述和模型选择理由。')
  const missing = planMissing(state.plan)
  if (missing) throw new Error(missing)
  const file = listSessionFiles(sid).find((entry) => entry.relPath === state.plan.file)
  if (!file) throw new Error('数据附件不存在。')
  const code = buildPredictionBaselineCode({ kind: 'data', name: file.name, relPath: file.relPath }, {
    sheetName: state.plan.sheet || null, xColumn: state.plan.timeColumn, targetColumn: state.plan.targetColumn
  })
  if (!code) throw new Error('该数据格式不能用于预测实验。')
  const hash = sourceHash(sid, state.plan.file)
  busy.add(sid)
  try {
    const attempt = await runCode(sid, code)
    const runId = addRun(sid, code, attempt)
    if (!attempt.outcome.ok) throw new Error(attempt.outcome.error?.message || attempt.outcome.stderr || '实验运行失败，请检查数据和 Python 环境。')
    if (!attempt.outcome.artifacts.some((artifact) => artifact.name === 'model_evidence.json')) throw new Error('本次运行没有生成证据文件，不能标记为完成。')
    const raw = JSON.parse(readArtifact(sid, 'model_evidence.json').text ?? '{}')
    const summary = summarizePredictionEvidence(raw)
    if (!summary || raw.sourceSha256 !== hash || sourceHash(sid, state.plan.file) !== hash ||
      raw.configuration?.timeColumn !== state.plan.timeColumn || raw.configuration?.targetColumn !== state.plan.targetColumn) throw new Error('证据与当前数据不匹配，请重新运行。')
    const current = getPredictionLab(sid, q)
    if (labInputKey(current.plan) !== labInputKey(state.plan)) throw new Error('运行期间实验配置已改变，结果保留在运行历史，请按新配置重跑。')
    const plotName = `prediction-lab-${q}-${runId}.png`
    copyFileSync(resolve(workspaceDir(sid), 'prediction_baseline.png'), resolve(workspaceDir(sid), plotName))
    const next: PredictionLabState = { ...current, experiment: { runId, createdAt: Date.now(), sourceHash: hash, plan: state.plan, summary, plotName }, reflection: emptyLab().reflection }
    delete next.reflectedAt
    logAiUsage(sid, null, 'prediction_lab_run', `问题 ${q}：运行 ${runId}；数据 ${state.plan.file}；目标 ${state.plan.targetColumn}；结果待学生核对。`)
    return store(sid, q, next)
  } finally { busy.delete(sid) }
}
export function savePredictionReflection(sid: number, q: number, runId: number, reflection: PredictionLabState['reflection']): PredictionLabState {
  const state = getPredictionLab(sid, q)
  if (!state.experiment || state.staleReason || state.experiment.runId !== runId) throw new Error('请先运行当前配置的实验，再依据本次证据复盘。')
  if (!reflection || ['comparison', 'limitation', 'nextAction'].some((key) => typeof reflection[key as keyof typeof reflection] !== 'string' || !reflection[key as keyof typeof reflection].trim() || reflection[key as keyof typeof reflection].length > 4000)) throw new Error('请补全指标比较、局限和下一步计划。')
  state.reflection = { comparison: reflection.comparison.trim(), limitation: reflection.limitation.trim(), nextAction: reflection.nextAction.trim() }
  state.reflectedAt = Date.now()
  logAiUsage(sid, null, 'prediction_lab_reflect', `问题 ${q}；运行 ${runId}；${JSON.stringify(state.reflection)}；仅记录学生复盘，不代表验证通过。`)
  return store(sid, q, state)
}
