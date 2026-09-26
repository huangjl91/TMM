import { BrowserWindow } from 'electron'
import { getApiKey } from '../secrets'
import {
  appendMessage,
  createSession,
  finalizeMessage,
  getPlotIntent,
  getSessionMessages,
  latestStageOutputs,
  loadSettings,
  logAiUsage,
  renameSession,
  saveStageOutputs
} from '../repo'
import { completeText, streamChat, type ChatMsg } from '../llm/openai-compat'
import { applyCoachReply, coachBriefing, currentStageId, methodHints, requestHint, stageViews } from '../stage'
import {
  COACH_SYSTEM,
  CRITIC_SYSTEM,
  EXECUTOR_SYSTEM,
  REWRITE_INSTRUCTION,
  coachUserBrief,
  executorUserBrief
} from './prompts'
import { detectGhostwriting, filterQuizOptions } from './anti-ghostwrite'
import { parseCoachReply, parseScaffold, sliceJsonObject, type AdoptPayload, type CoachReply } from '../../shared/agent'
import { HINT_LEVELS, STAGES } from '../../shared/stages'
import { plotDigest, plotGate } from '../../shared/plots'
import { IPC, type SendPayload, type StoredMessage, type StreamEvent } from '../../shared/types'

const controllers = new Map<number, AbortController>()
/** 历史别无限喂，长会话会把 token 吃光 */
const HISTORY_LIMIT = 24

export function broadcast(event: StreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.ChatStream, event)
  }
}

function broadcastStages(sessionId: number): void {
  broadcast({ type: 'stages', sessionId, stages: stageViews(sessionId) })
}

export function keyOrFail(): {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
} {
  const s = loadSettings()
  const key = getApiKey(s.providerId)
  if (!key) throw new Error(`尚未配置 ${s.providerId} 的 API Key`)
  return {
    baseUrl: s.baseUrl,
    apiKey: key,
    model: s.model,
    temperature: s.temperature
  }
}

/** 教练卡片以 JSON 存库，喂回模型时还原成人能读的样子，否则它会照着 JSON 格式继续输出 */
function renderForHistory(m: StoredMessage): string {
  if (m.role !== 'assistant') return m.content
  if (m.kind !== 'coach') return m.content
  const reply = parseCoachReply(m.content)
  if (!reply) return m.content
  const checks = reply.checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.item}${c.note ? `（${c.note}）` : ''}`)
  const quiz = (reply.quiz ?? []).map(
    (q) => `选择题：${q.ask}（${q.options.map((o) => `${o.key}. ${o.text}`).join('；')}）`
  )
  return [
    `问题：${reply.next_question}`,
    checks.length ? `检查点：\n${checks.join('\n')}` : '',
    reply.hint ? `提示 L${reply.hint.level}：${reply.hint.text}` : '',
    ...quiz,
    reply.blockers ? `还缺：${reply.blockers}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export async function judgeViolation(
  endpoint: ReturnType<typeof keyOrFail>,
  model: string,
  text: string
): Promise<boolean> {
  try {
    const raw = await completeText({
      ...endpoint,
      model,
      jsonMode: true,
      maxTokens: 200,
      messages: [
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: text.slice(0, 6000) }
      ]
    })
    const json = sliceJsonObject(raw)
    if (!json) return false
    return (JSON.parse(json) as { violation?: unknown }).violation === true
  } catch {
    // 判定调用挂了不能把对话也拖死：启发式已经报了可疑，就按可疑处理
    return true
  }
}

function sanitize(reply: CoachReply): CoachReply {
  const failed = reply.checks.find((c) => !c.passed)
  return {
    ...reply,
    next_question: failed
      ? `上面这几条里，「${failed.item}」你还没答上。先只回答这一条：你现在的做法依据是什么？`
      : '你这段产出里，哪一句是你自己能核对的？先只说那一句。',
    // 这一轮已被判越界，提示与选项一并撤掉：留下的只能是一句提问
    hint: null,
    quiz: undefined
  }
}

function coachText(reply: CoachReply): string {
  return [reply.next_question, reply.hint ? `提示：${reply.hint.text}` : '', ...reply.rubric_score.comments].join(
    '\n\n'
  )
}

type Endpoint = ReturnType<typeof keyOrFail>
interface TurnOpts {
  sessionId: number
  stageId: number
  userText?: string
  directive?: string
}

/**
 * 反代写闸门：启发式先筛，可疑再让小模型判，判实了就要求重写一次，
 * 重写仍越界就直接改写成提问形态。宁可少给内容，也不能把论文替学生写了。
 */
async function enforceCoach(reply: CoachReply, base: ChatMsg[], endpoint: Endpoint, o: TurnOpts): Promise<CoachReply> {
  const text = coachText(reply)
  const first = detectGhostwriting(text)
  if (!first.suspect) return reply
  if (!(await judgeViolation(endpoint, endpoint.model, text))) return reply

  logAiUsage(o.sessionId, o.stageId, 'critic_block', `判为越界：${first.reasons.join('；')}`, null, endpoint.model)
  try {
    const retry = await completeText({
      ...endpoint,
      jsonMode: true,
      messages: [
        ...base,
        { role: 'assistant', content: JSON.stringify(reply) },
        {
          role: 'user',
          content: `${REWRITE_INSTRUCTION}\n违规证据：${first.reasons.join('；')}`
        }
      ]
    })
    const rewritten = parseCoachReply(retry)
    if (rewritten && !detectGhostwriting(coachText(rewritten)).suspect) return rewritten
    logAiUsage(o.sessionId, o.stageId, 'critic_sanitize', '重写后仍越界，已强制改为提问形态', null, endpoint.model)
  } catch (e) {
    logAiUsage(o.sessionId, o.stageId, 'critic_rewrite_failed', (e as Error).message, null, endpoint.model)
  }
  return sanitize(reply)
}

async function coachTurn(o: TurnOpts): Promise<void> {
  let endpoint: Endpoint
  try {
    endpoint = keyOrFail()
  } catch (e) {
    broadcast({ type: 'error', message: (e as Error).message })
    return
  }

  if (o.userText) appendMessage(o.sessionId, 'user', o.userText, 'chat')
  const history: ChatMsg[] = getSessionMessages(o.sessionId)
    // 右侧自由问答不进教练上下文：它没有阶段归属，混进来会让 rubric 反馈跑偏
    .filter((m) => m.kind !== 'free')
    .slice(-HISTORY_LIMIT)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: renderForHistory(m) }))
  const messages: ChatMsg[] = [
    {
      role: 'system',
      content: `${COACH_SYSTEM}\n\n${coachUserBrief(coachBriefing(o.sessionId, o.stageId))}`
    },
    ...history
  ]
  if (o.directive) messages.push({ role: 'user', content: o.directive })

  const controller = new AbortController()
  controllers.set(o.sessionId, controller)
  const messageId = appendMessage(o.sessionId, 'assistant', '', 'coach')
  broadcast({
    type: 'start',
    sessionId: o.sessionId,
    messageId,
    kind: 'coach'
  })

  let raw = ''
  let reasoning = ''
  try {
    const r = await streamChat({ ...endpoint, messages, signal: controller.signal, jsonMode: true }, (kind, chunk) => {
      if (kind === 'delta') {
        raw += chunk
        broadcast({ type: 'delta', text: chunk })
      } else {
        reasoning += chunk
        broadcast({ type: 'reasoning', text: chunk })
      }
    })
    raw = r.content
    const parsed = parseCoachReply(r.content)
    if (!parsed) {
      // 端点没按 JSON 出来：降级成普通教练消息，别让回答丢掉，也别硬改状态机
      finalizeMessage(messageId, raw, reasoning || null, r.usage)
      logAiUsage(o.sessionId, o.stageId, 'coach_parse_failed', raw.slice(0, 200), null, endpoint.model)
      broadcast({ type: 'done', usage: r.usage })
      return
    }
    // 选择题只给「路」不给「段落」：写成论文的选项在这一步就被摘掉，进不了卡片也进不了历史
    if (parsed.quiz) parsed.quiz = filterQuizOptions(parsed.quiz)
    const reply = await enforceCoach(parsed, messages, endpoint, o)
    finalizeMessage(messageId, JSON.stringify(reply), reasoning || null, r.usage)
    broadcast({ type: 'card', card: reply })
    const stages = applyCoachReply(o.sessionId, o.stageId, reply, endpoint.model)
    broadcast({ type: 'stages', sessionId: o.sessionId, stages })
    const hints = methodHints(o.sessionId, o.stageId)
    logAiUsage(
      o.sessionId,
      o.stageId,
      'coach_reply',
      [
        `评分 ${reply.rubric_score.total}`,
        `检查点 ${reply.checks.filter((c) => c.passed).length}/${reply.checks.length}`,
        hints.cards.length
          ? `参考方法卡（${hints.pinned ? '学生钉选' : '按任务卡自动匹配'}）：${hints.cards.map((c) => c.name).join('、')}`
          : '未参考方法卡',
        reply.quiz?.length ? `出了 ${reply.quiz.length} 道诊断选择题` : ''
      ]
        .filter(Boolean)
        .join('；'),
      reply.hint?.level ?? null,
      endpoint.model
    )
    broadcast({ type: 'done', usage: r.usage })
  } catch (e) {
    const aborted = controller.signal.aborted
    if (raw) finalizeMessage(messageId, raw + '\n\n_(已中断)_', reasoning || null, null)
    broadcast(aborted ? { type: 'aborted' } : { type: 'error', message: (e as Error).message })
  } finally {
    controllers.delete(o.sessionId)
  }
}
/**
 * L2/L3 才走到这里：示例由 Executor 产出，落地必须学生点「采纳」。
 * 阶段 6/8 先卡绘图三问——没答完就不发请求，因为骨架会照着「随便画个图」生成，
 * 那等于替学生跳过了科研绘图里唯一需要他思考的那一步。
 */
async function scaffoldTurn(sessionId: number, stageId: number, level: number, endpoint: Endpoint): Promise<void> {
  const def = STAGES.find((s) => s.id === stageId)
  const intent = getPlotIntent(sessionId, stageId)
  const missing = plotGate(intent, '', stageId)
  if (missing.length) {
    broadcast({
      type: 'error',
      message: `这次没有向 AI 要骨架：${def?.title ?? '本阶段'}要先在右侧 Python 面板答完绘图三问，还剩 ${String(missing.length)} 问没答。答完的骨架才会照你写的轴名与单位来。`
    })
    return
  }
  const outputs = latestStageOutputs(sessionId, stageId)
  const emptyField = def?.fields.find((f) => !outputs[f.key])?.key ?? def?.fields[0]?.key ?? null
  const messageId = appendMessage(sessionId, 'assistant', '', 'scaffold')
  broadcast({ type: 'start', sessionId, messageId, kind: 'scaffold' })
  try {
    const raw = await completeText({
      baseUrl: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      model: endpoint.model,
      temperature: endpoint.temperature,
      jsonMode: true,
      messages: [
        { role: 'system', content: EXECUTOR_SYSTEM },
        {
          role: 'user',
          content: executorUserBrief(
            level,
            def?.title ?? '',
            emptyField,
            JSON.stringify(outputs),
            methodHints(sessionId, stageId).digest,
            intent ? plotDigest(intent) : ''
          )
        }
      ]
    })
    const scaffold = parseScaffold(raw)
    if (!scaffold) throw new Error('示例解析失败，再点一次「要提示」试试')
    finalizeMessage(messageId, JSON.stringify(scaffold), null, null)
    broadcast({ type: 'scaffold', scaffold })
    logAiUsage(
      sessionId,
      stageId,
      'scaffold_given',
      `L${level} ${scaffold.kind} 示例：${scaffold.content.slice(0, 200)}`,
      level,
      endpoint.model
    )
    broadcast({ type: 'done', usage: null })
  } catch (e) {
    finalizeMessage(messageId, `_(示例生成失败：${(e as Error).message})_`, null, null)
    broadcast({ type: 'error', message: (e as Error).message })
  }
}

export async function send(payload: SendPayload): Promise<void> {
  const text = payload.text?.trim()
  if (!text) return
  try {
    keyOrFail()
  } catch (e) {
    broadcast({ type: 'error', message: (e as Error).message })
    return
  }
  let sessionId = payload.sessionId
  if (!Number.isInteger(sessionId) || (sessionId as number) < 1) {
    const s = loadSettings()
    sessionId = createSession(text, s.providerId, s.model)
    renameSession(sessionId, text)
  }
  const id = sessionId as number
  /** 选择题作答是学生在做判断，不是 AI 产出，但它是《AI 工具使用详情》里最能说明「谁在做决定」的一条 */
  if (payload.quizLog?.trim()) {
    logAiUsage(id, currentStageId(id), 'quiz_answered', payload.quizLog.trim().slice(0, 600), null, loadSettings().model)
  }
  await coachTurn({
    sessionId: id,
    stageId: currentStageId(id),
    userText: text
  })
}

/** 学生主动点「要提示」：不等教练判失败，直接升一级 */
export async function askHint(sessionId: number): Promise<void> {
  let endpoint: Endpoint
  try {
    endpoint = keyOrFail()
  } catch (e) {
    broadcast({ type: 'error', message: (e as Error).message })
    return
  }
  const stageId = currentStageId(sessionId)
  const hint = requestHint(sessionId, stageId, endpoint.model)
  broadcastStages(sessionId)
  if (hint.level <= 1) {
    await coachTurn({
      sessionId,
      stageId,
      directive: `学生点了「要提示」，当前强度 L${hint.level}（${HINT_LEVELS[hint.level]}）。只给这一级的提示：hint 字段写这一条，next_question 紧跟一个把球踢回给学生的问题。不要给成段示例。`
    })
    return
  }
  await scaffoldTurn(sessionId, stageId, hint.level, endpoint)
}

/** 采纳动作必须留痕：这是《AI 工具使用详情》里"学生采纳示例的位置"的来源 */
export function adopt(payload: AdoptPayload): void {
  const sessionId = Number(payload?.sessionId)
  if (!Number.isInteger(sessionId) || sessionId < 1) throw new Error('会话不存在')
  const content = typeof payload?.content === 'string' ? payload.content.trim() : ''
  if (!content) throw new Error('示例内容为空')
  const stageId = Number(payload.stageId) || currentStageId(sessionId)
  const fieldKey = typeof payload.fieldKey === 'string' ? payload.fieldKey : null
  logAiUsage(
    sessionId,
    stageId,
    'scaffold_adopted',
    `${payload.kind === 'code' ? '代码' : '文本'}示例已采纳${fieldKey ? `到字段 ${fieldKey}` : '到代码编辑器'}：${content.slice(0, 300)}`,
    null,
    loadSettings().model
  )
  if (payload.kind === 'text' && fieldKey) saveStageOutputs(sessionId, stageId, { [fieldKey]: content })
}

export function abort(sessionId: number | null): void {
  if (sessionId === null) for (const c of controllers.values()) c.abort()
  else controllers.get(sessionId)?.abort()
}
