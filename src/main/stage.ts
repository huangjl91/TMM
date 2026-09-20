import {
  getStageStates,
  latestStageOutputs,
  logAiUsage,
  pinnedMethods,
  saveStageOutputs,
  setSessionStage,
  upsertStageState,
  type StageRow
} from './repo'
import { ESCALATE_AFTER_ATTEMPTS, HINT_LEVELS, STAGES, type StageDef } from '../shared/stages'
import { digestForPrompt, methodById, topMethodsForText, type MethodCard } from '../shared/methods'
import type { CoachReply, StageView } from '../shared/agent'

const EMPTY: StageRow = {
  stageId: 0,
  status: 'todo',
  hintLevel: 0,
  attempts: 0,
  score: null
}

/** 前面还有 blocking 阶段没做完，就不许跳过去——这是"引导"能成立的结构性保证 */
function firstOpenBlocking(states: Map<number, StageRow>, before: number): StageDef | undefined {
  return STAGES.find((s) => s.id < before && s.blocking && states.get(s.id)?.status !== 'done')
}

export function stageViews(sessionId: number): StageView[] {
  const states = getStageStates(sessionId)
  return STAGES.map((def) => {
    const st = states.get(def.id) ?? EMPTY
    const blocker = firstOpenBlocking(states, def.id)
    return {
      id: def.id,
      key: def.key,
      title: def.title,
      output: def.output,
      focus: def.focus,
      fields: def.fields,
      rubric: def.rubric,
      blocking: def.blocking,
      status: st.status,
      hintLevel: st.hintLevel,
      attempts: st.attempts,
      score: st.score,
      locked: blocker !== undefined
    }
  })
}

/** 当前阶段：会话上记的那个；没记就取第一个未完成的，并把它标成 active */
export function currentStageId(sessionId: number): number {
  const views = stageViews(sessionId)
  const stored = views.find((v) => v.status === 'active' || v.status === 'submitted')
  if (stored) return stored.id
  const target = views.find((v) => v.status !== 'done') ?? views[0]
  if (!target) return STAGES[0]?.id ?? 1
  upsertStageState(sessionId, target.id, { status: 'active' })
  setSessionStage(sessionId, target.key)
  return target.id
}

export function openStage(sessionId: number, stageId: number): { ok: true } | { ok: false; error: string } {
  const def = STAGES.find((s) => s.id === stageId)
  if (!def) return { ok: false, error: '没有这个阶段的定义' }
  const states = getStageStates(sessionId)
  const blocker = firstOpenBlocking(states, stageId)
  if (blocker) {
    return {
      ok: false,
      error: `第 ${blocker.id} 阶段「${blocker.title}」还没完成，它标了强制项，不能跳过`
    }
  }
  upsertStageState(sessionId, stageId, {
    status: states.get(stageId)?.status === 'done' ? 'done' : 'active'
  })
  setSessionStage(sessionId, def.key)
  return { ok: true }
}

/**
 * 教练反馈落地到状态机：全过→done，有没过→记一次失败尝试。
 * 连续 ESCALATE_AFTER_ATTEMPTS 次没过就升一级提示，升级本身写日志（合规要真实交互过程）。
 */
export function applyCoachReply(sessionId: number, stageId: number, reply: CoachReply, model: string): StageView[] {
  const states = getStageStates(sessionId)
  const cur = states.get(stageId) ?? EMPTY
  const all = reply.checks.length > 0 && reply.checks.every((c) => c.passed) && reply.rubric_score.total >= 60
  if (all) {
    upsertStageState(sessionId, stageId, {
      status: 'done',
      score: reply.rubric_score.total
    })
    logAiUsage(sessionId, stageId, 'stage_done', `检查点全过，评分 ${reply.rubric_score.total}`, null, model)
    // 完成一个阶段就把当前指针交给下一个还没做的，否则任务卡会停在已完成的阶段上
    const next = stageViews(sessionId).find((v) => v.id > stageId && v.status === 'todo')
    if (next) {
      upsertStageState(sessionId, next.id, { status: 'active' })
      setSessionStage(sessionId, next.key)
    }
    return stageViews(sessionId)
  }
  const attempts = cur.attempts + 1
  const escalate = attempts % ESCALATE_AFTER_ATTEMPTS === 0 && cur.hintLevel < HINT_LEVELS.length - 1
  const hintLevel = escalate ? cur.hintLevel + 1 : cur.hintLevel
  upsertStageState(sessionId, stageId, {
    status: 'submitted',
    attempts,
    hintLevel,
    score: reply.rubric_score.total
  })
  if (escalate) {
    logAiUsage(
      sessionId,
      stageId,
      'hint_escalation',
      `连续 ${attempts} 次未通过检查点，提示强度升到 L${hintLevel}（${HINT_LEVELS[hintLevel]}）`,
      hintLevel,
      model
    )
  }
  return stageViews(sessionId)
}

/** 学生主动点「要提示」：不等教练判失败，直接升一级 */
export function requestHint(sessionId: number, stageId: number, model: string): { level: number; label: string } {
  const states = getStageStates(sessionId)
  const cur = states.get(stageId) ?? EMPTY
  const level = Math.min(HINT_LEVELS.length - 1, cur.hintLevel + 1)
  upsertStageState(sessionId, stageId, {
    status: cur.status === 'done' ? 'done' : 'active',
    hintLevel: level
  })
  logAiUsage(
    sessionId,
    stageId,
    'hint_escalation',
    `学生主动请求提示，L${level}（${HINT_LEVELS[level]}）`,
    level,
    model
  )
  return { level, label: HINT_LEVELS[level] ?? '' }
}

export function setHintLevel(sessionId: number, stageId: number, level: number): void {
  upsertStageState(sessionId, stageId, {
    hintLevel: Math.max(0, Math.min(HINT_LEVELS.length - 1, level))
  })
}

export function submitStage(sessionId: number, stageId: number, values: Record<string, string>): void {
  const def = STAGES.find((s) => s.id === stageId)
  if (!def) throw new Error('没有这个阶段的定义')
  const cleaned: Record<string, string> = {}
  for (const f of def.fields) {
    const v = values[f.key]
    if (typeof v === 'string' && v.trim()) cleaned[f.key] = v.trim()
  }
  saveStageOutputs(sessionId, stageId, cleaned)
  const cur = getStageStates(sessionId).get(stageId)
  if (cur?.status !== 'done') upsertStageState(sessionId, stageId, { status: 'submitted' })
  logAiUsage(sessionId, stageId, 'submission', `提交任务卡字段：${Object.keys(cleaned).join('、') || '（空）'}`)
}

export function stageCard(
  sessionId: number,
  stageId: number
): {
  fields: { key: string; label: string; hint: string; content: string }[]
} {
  const def = STAGES.find((s) => s.id === stageId)
  if (!def) return { fields: [] }
  const values = latestStageOutputs(sessionId, stageId)
  return {
    fields: def.fields.map((f) => ({
      key: f.key,
      label: f.label,
      hint: f.hint,
      content: values[f.key] ?? ''
    }))
  }
}

/** 把学生已提交的任务卡 + 阶段 rubric 拼成教练看得见的上下文 */
/**
 * 本阶段该参考哪几张方法卡：学生钉过的优先，没钉就按他已填的任务卡文本自动挑。
 * 挑出来只为了生成追问与检查点——卡上没有成稿正文，喂进去也不会变成代写。
 */
export function methodHints(
  sessionId: number,
  stageId: number
): { digest: string; cards: MethodCard[]; pinned: boolean } {
  const chosen = pinnedMethods(sessionId)
    .map((id) => methodById(id))
    .filter((m): m is MethodCard => m !== undefined)
  if (chosen.length) return { digest: digestForPrompt(chosen), cards: chosen, pinned: true }
  const text = Object.values(latestStageOutputs(sessionId, stageId))
    .filter((v): v is string => typeof v === 'string')
    .join('\n')
  const auto = topMethodsForText(text, stageId, 3)
  return { digest: digestForPrompt(auto), cards: auto, pinned: false }
}

export function coachBriefing(sessionId: number, stageId: number): string {
  const def = STAGES.find((s) => s.id === stageId)
  if (!def) return ''
  const card = stageCard(sessionId, stageId)
  const states = getStageStates(sessionId)
  const st = states.get(stageId) ?? EMPTY
  const filled = card.fields.filter((f) => f.content)
  const digest = methodHints(sessionId, stageId).digest
  return [
    `当前阶段：${def.id} ${def.title}（强制项：${def.blocking ? '是' : '否'}）`,
    `本阶段学生要交出：${def.output}`,
    `你的提问方向：${def.focus}`,
    `评分点：${def.rubric.points.join('；')}`,
    `常见失分项：${def.rubric.pitfalls.join('；')}`,
    `提示强度：L${st.hintLevel} ${HINT_LEVELS[st.hintLevel]}（本阶段已失败 ${st.attempts} 次）`,
    filled.length
      ? `学生已提交的任务卡内容：\n${filled.map((f) => `【${f.label}】\n${f.content}`).join('\n\n')}`
      : '学生还没有提交任务卡内容。',
    digest
  ]
    .filter(Boolean)
    .join('\n')
}
