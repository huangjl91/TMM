import {
  getSessionQuestion,
  getPlotIntent,
  getStageStates,
  latestStageOutputs,
  listSessionFiles,
  logAiUsage,
  pinnedMethods,
  saveStageOutputs,
  setSessionStage,
  upsertStageState,
  type StageRow
} from './repo'
import { ESCALATE_AFTER_ATTEMPTS, HINT_LEVELS, STAGES, type CardField, type StageDef } from '../shared/stages'
import { digestForPrompt, methodById, topMethodsForText, type MethodCard } from '../shared/methods'
import { PLOT_STAGES, plotDigest, plotGate } from '../shared/plots'
import { intakeBriefing } from '../shared/intake'
import { parseQuestions, qKey, questionBrief, splitQKey, type QuestionView } from '../shared/questions'
import type { CoachReply, StageCard, StageView } from '../shared/agent'

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
    const blockerCard = stageCard(sessionId, blocker.id)
    const missing = blockerCard.fields
      .filter((field) => field.questions?.length
        ? field.questions.some((question) => !question.content.trim())
        : !field.content.trim())
      .map((field) => field.label)
    const blockerState = states.get(blocker.id)
    const nextAction = missing.length
      ? `请在下方任务卡补齐：${missing.join('、')}`
      : blockerState?.status === 'submitted'
        ? '任务卡已经提交，但尚未通过检查；请按教练反馈补充后再次提交'
        : '任务卡已经填完，请点击「提交给教练评审」完成本阶段'
    return {
      ok: false,
      error: `第 ${blocker.id} 阶段「${blocker.title}」还没完成，暂时不能进入阶段 ${stageId}。${nextAction}`
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
  const questions = questionsOf(sessionId)
  const cleaned: Record<string, string> = {}
  const keep = (key: string): void => {
    const v = values[key]
    if (typeof v === 'string' && v.trim()) cleaned[key] = v.trim()
  }
  for (const f of def.fields) {
    keep(f.key)
    if (!splittable(f, questions)) continue
    for (const q of questions) keep(qKey(q.idx, f.key))
  }
  saveStageOutputs(sessionId, stageId, cleaned)
  const cur = getStageStates(sessionId).get(stageId)
  if (cur?.status !== 'done') upsertStageState(sessionId, stageId, { status: 'submitted' })
  logAiUsage(sessionId, stageId, 'submission', `提交任务卡字段：${Object.keys(cleaned).join('、') || '（空）'}`)
}

/** 逐问清单不另建表：它就是阶段 1「逐问拆解」那一格里学生自己写的行 */
export function questionsOf(sessionId: number): QuestionView[] {
  return parseQuestions(latestStageOutputs(sessionId, 1)['problems'] ?? '')
}

/** 只有拆出两问以上才真的拆开，单问题保持原来的整格填写 */
function splittable(f: CardField, questions: QuestionView[]): boolean {
  return f.perQuestion === true && questions.length >= 2
}

export function stageCard(sessionId: number, stageId: number): StageCard {
  const def = STAGES.find((s) => s.id === stageId)
  if (!def) return { fields: [] }
  const values = latestStageOutputs(sessionId, stageId)
  const questions = questionsOf(sessionId)
  return {
    fields: def.fields.map((f) => {
      if (!splittable(f, questions)) {
        return { key: f.key, label: f.label, hint: f.hint, content: values[f.key] ?? '' }
      }
      const per = questions.map((q) => ({ idx: q.idx, label: q.label, content: values[qKey(q.idx, f.key)] ?? '' }))
      // 拆分之前写的整格内容归到第一问，别让它凭空消失
      const flat = values[f.key] ?? ''
      if (flat && !per[0]?.content) per[0] = { ...(per[0] as { idx: number; label: string; content: string }), content: flat }
      return { key: f.key, label: f.label, hint: f.hint, content: '', questions: per }
    })
  }
}

/**
 * 本阶段该参考哪几张方法卡：学生钉过的优先，没钉就按他已填的任务卡文本自动挑。
 * 挑出来只为了生成追问与检查点——卡上没有成稿正文，喂进去也不会变成代写。
 * 聚焦某一问时只看那一问写的内容，否则第 3 问的选型会被第 1 问的文本带偏。
 */
export function methodHints(
  sessionId: number,
  stageId: number
): { digest: string; cards: MethodCard[]; pinned: boolean } {
  const chosen = pinnedMethods(sessionId)
    .map((id) => methodById(id))
    .filter((m): m is MethodCard => m !== undefined)
  if (chosen.length) return { digest: digestForPrompt(chosen), cards: chosen, pinned: true }
  const focus = getSessionQuestion(sessionId)
  const text = Object.entries(latestStageOutputs(sessionId, stageId))
    .filter(([key]) => {
      if (focus <= 0) return true
      const split = splitQKey(key)
      return split === null || split.idx === focus
    })
    .map(([, v]) => v)
    .filter((v): v is string => typeof v === 'string')
    .join('\n')
  const auto = topMethodsForText(text, stageId, 3)
  return { digest: digestForPrompt(auto), cards: auto, pinned: false }
}

/** 任务卡里已经写下的内容，逐问字段按「标签 · 问题 N」摊平，教练才看得出哪一问还空着 */
function submittedLines(card: StageCard): string[] {
  const lines: string[] = []
  for (const f of card.fields) {
    if (f.content.trim()) lines.push(`【${f.label}】\n${f.content}`)
    for (const q of f.questions ?? []) {
      if (q.content.trim()) lines.push(`【${f.label} · ${q.label}】\n${q.content}`)
    }
  }
  return lines
}

/** 逐问进度：这是「只答了第一问」这个高频失分项唯一的机器可见证据 */
function questionProgress(sessionId: number, stageId: number, questions: QuestionView[], focus: number): string {
  if (questions.length < 2) return ''
  const def = STAGES.find((s) => s.id === stageId)
  const splitKeys = (def?.fields ?? []).filter((f) => splittable(f, questions)).map((f) => f.key)
  if (splitKeys.length === 0) return ''
  const values = latestStageOutputs(sessionId, stageId)
  const parts = questions.map((q) => {
    const done = splitKeys.filter((k) => (values[qKey(q.idx, k)] ?? '').trim()).length
    return `${q.label} ${String(done)}/${String(splitKeys.length)}`
  })
  const brief = questionBrief(questions, focus)
  const label = questions.find((q) => q.idx === focus)?.label ?? ''
  return `${`本阶段逐问进度：${parts.join('，')}`}${brief ? `；当前聚焦 ${label}「${brief}」，这一问没写完不要跳到别问` : ''}`
}

/** 阶段 6/8 的绘图三答：教练据此追问图的用途，也据此知道骨架为什么还没发 */
function plotBrief(sessionId: number, stageId: number): string {
  if (!PLOT_STAGES.includes(stageId)) return ''
  const intent = getPlotIntent(sessionId, stageId)
  const missing = plotGate(intent, '', stageId)
  return missing.length
    ? `绘图三问还剩 ${String(missing.length)} 问没答（${missing.join('；')}）：可以追问这张图到底要说什么，但不要替他写出轴该怎么画。`
    : `学生的绘图三答：\n${plotDigest(intent ?? {})}`
}

/** 只有这三段需要「先挑路」：读题、探索、选型。再往后学生已经在写具体产出，选项反而像刷题 */
const QUIZ_STAGES = new Set([1, 2, 4])

/** 一旦升到提示档位，学生要的是提示而不是又一堆选项 */
export function quizAllowed(sessionId: number, stageId: number): boolean {
  return QUIZ_STAGES.has(stageId) && (getStageStates(sessionId).get(stageId)?.hintLevel ?? 0) === 0
}

export function coachBriefing(sessionId: number, stageId: number): string {
  const def = STAGES.find((s) => s.id === stageId)
  if (!def) return ''
  const card = stageCard(sessionId, stageId)
  const states = getStageStates(sessionId)
  const st = states.get(stageId) ?? EMPTY
  const submitted = submittedLines(card)
  const digest = methodHints(sessionId, stageId).digest
  const imported = intakeBriefing(listSessionFiles(sessionId))
  const progress = questionProgress(sessionId, stageId, questionsOf(sessionId), getSessionQuestion(sessionId))
  return [
    `当前阶段：${def.id} ${def.title}（强制项：${def.blocking ? '是' : '否'}）`,
    `本阶段学生要交出：${def.output}`,
    `你的提问方向：${def.focus}`,
    `评分点：${def.rubric.points.join('；')}`,
    `常见失分项：${def.rubric.pitfalls.join('；')}`,
    `提示强度：L${st.hintLevel} ${HINT_LEVELS[st.hintLevel]}（本阶段已失败 ${st.attempts} 次）`,
    quizAllowed(sessionId, stageId)
      ? '选择题闸门=开：在 quiz 字段给 1-2 题，每题 2-5 个选项，选项只写「这条路是什么」与「选它意味着什么」，不标对错。'
      : '选择题闸门=关：本轮不要出 quiz 字段。',
    progress,
    plotBrief(sessionId, stageId),
    submitted.length
      ? `学生已提交的任务卡内容：\n${submitted.join('\n\n')}`
      : '学生还没有提交任务卡内容。',
    imported
      ? `学生导入的赛题与附件（题面来自 PDF 提取，可能与纸质原文有出入，以学生的表述为准）：\n${imported}`
      : '学生没有导入题面文件，题目信息只能来自对话。',
    digest
  ]
    .filter(Boolean)
    .join('\n')
}
