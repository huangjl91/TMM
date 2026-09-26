import type { CardField, Rubric } from './stages'

/**
 * free 是右侧「AI 对话框」的通用问答：它不绑阶段任务卡，直接调模型，
 * 但仍然过反代写闸门、仍然写进 AI 使用日志。与 coach 分表不必要，靠 kind 分流即可。
 */
export type MessageKind = 'chat' | 'coach' | 'scaffold' | 'submission' | 'system' | 'free'

export type StageStatus = 'todo' | 'active' | 'submitted' | 'done'

/** 阶段状态 + 渲染层要显示的定义，一次给全，省得前端再拼 */
export interface StageView {
  id: number
  key: string
  title: string
  output: string
  focus: string
  fields: CardField[]
  rubric: Rubric
  blocking: boolean
  status: StageStatus
  hintLevel: number
  attempts: number
  score: number | null
  /** 前面还有 blocking 阶段没完成，不许跳过去 */
  locked: boolean
}

export interface CheckItem {
  item: string
  passed: boolean
  note?: string
}

export interface QuizOption {
  key: string
  text: string
  /** 选这条意味着什么：只解释路径与代价，不判对错 */
  means: string
}

/**
 * 诊断式选择题：教练把「这一步有哪几条路」摊成选项让学生挑。
 * 刻意没有 correct/score 之类字段——答完只把选择与理由送回教练，由它继续追问。
 */
export interface QuizItem {
  ask: string
  options: QuizOption[]
  multi: boolean
}

/**
 * Coach 的输出契约。刻意没有"正文"这个字段：
 * 教练能说的只有提问、检查点、当前等级的提示和 rubric 反馈。
 * 成段的示例文字走 Executor，且必须学生点「采纳」才落地。
 */
export interface CoachReply {
  next_question: string
  checks: CheckItem[]
  hint: { level: number; text: string } | null
  rubric_score: { total: number; comments: string[] }
  blockers: string
  /** 只在阶段状态里被允许的那几轮出现；空或未给就不渲染 */
  quiz?: QuizItem[]
}

export interface Scaffold {
  kind: 'code' | 'text'
  /** text 类脚手架落地到任务卡的哪个字段 */
  fieldKey?: string
  content: string
}

export interface SubmissionPayload {
  sessionId: number
  stageId: number
  values: Record<string, string>
}

export interface AdoptPayload {
  sessionId: number
  stageId: number
  messageId: number
  kind: 'code' | 'text'
  fieldKey: string | null
  content: string
}

export interface StageCardField {
  key: string
  label: string
  hint: string
  content: string
  /**
   * 拆出多问后该字段按问各填一份。有这一项时渲染层只认 questions，
   * content 留空——免得同一格出现两个都能写的入口。
   */
  questions?: { idx: number; label: string; content: string }[]
}

export interface StageCard {
  fields: StageCardField[]
}

/** AI 使用日志的一行：M5 的《AI 工具使用详情.pdf》就是这张表的渲染 */
export interface UsageRow {
  id: number
  stageId: number | null
  action: string
  level: number | null
  detail: string
  model: string
  createdAt: number
}

/** 从可能只生成了一半的 JSON 里取出某个字符串字段的已有内容，用于流式显示 */
export function extractStringField(text: string, key: string): { value: string; closed: boolean } | null {
  const at = text.indexOf(`"${key}"`)
  if (at < 0) return null
  const colon = text.indexOf(':', at + key.length + 2)
  if (colon < 0) return null
  let i = colon + 1
  while (i < text.length && /\s/.test(text[i] as string)) i++
  if (text[i] !== '"') return null
  let out = ''
  for (i++; i < text.length; i++) {
    const ch = text[i] as string
    if (ch === '\\') {
      const nx = text[i + 1]
      if (nx === undefined) return { value: out, closed: false }
      out += nx === 'n' ? '\n' : nx === 't' ? '\t' : nx
      i++
      continue
    }
    if (ch === '"') return { value: out, closed: true }
    out += ch
  }
  return { value: out, closed: false }
}

/** 剥掉 ```json 包裹，再取第一个配平的 {...} 块（模型爱在前后加解释） */
export function sliceJsonObject(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, '')
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i] as string
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return cleaned.slice(start, i + 1)
    }
  }
  return null
}

function str(v: unknown, max = 4000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback
}

const MAX_QUIZ_ITEMS = 2
const MAX_QUIZ_OPTIONS = 5
const LETTERS = 'ABCDEFGHIJ'

/**
 * 选择题的容错解析：条数、长度、重复 key 都在这里收口。
 * 任何一条不合格只丢那一条，整题不足两个选项就丢掉那一题——
 * 掉几道题不算失败，把半截 JSON 当成卡片才糟。
 */
function parseQuiz(raw: unknown): QuizItem[] {
  if (!Array.isArray(raw)) return []
  const out: QuizItem[] = []
  for (const row of raw) {
    if (out.length >= MAX_QUIZ_ITEMS) break
    const r = (row ?? {}) as Record<string, unknown>
    const ask = str(r.ask, 160).trim()
    const seen = new Set<string>()
    const options: QuizOption[] = []
    for (const [i, opt] of (Array.isArray(r.options) ? r.options : []).slice(0, MAX_QUIZ_OPTIONS).entries()) {
      const o = (opt ?? {}) as Record<string, unknown>
      const text = str(o.text, 80).trim()
      if (!text) continue
      const given = str(o.key, 4).trim().toUpperCase()
      const key = LETTERS.includes(given) && !seen.has(given) ? given : LETTERS[i] ?? ''
      if (!key || seen.has(key)) continue
      seen.add(key)
      options.push({ key, text, means: str(o.means, 160).trim() })
    }
    if (!ask || options.length < 2) continue
    out.push({ ask, options, multi: r.multi === true })
  }
  return out
}

/** 容错解析：字段缺失按空处理，整体不可解析才返回 null（调用方降级为普通对话） */
export function parseCoachReply(raw: string): CoachReply | null {
  const json = sliceJsonObject(raw)
  if (!json) return null
  let obj: unknown
  try {
    obj = JSON.parse(json)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const checks = Array.isArray(o.checks)
    ? o.checks
        .map((c): CheckItem | null => {
          const r = (c ?? {}) as Record<string, unknown>
          const item = str(r.item, 200)
          return item ? { item, passed: r.passed === true, note: str(r.note, 300) || undefined } : null
        })
        .filter((c): c is CheckItem => c !== null)
    : []
  const hintRaw = (o.hint ?? {}) as Record<string, unknown>
  const hintText = str(hintRaw.text)
  const scoreRaw = (o.rubric_score ?? {}) as Record<string, unknown>
  const question = str(o.next_question).trim()
  // 形状对但内容不是教练契约（端点返回了别的东西）就当解析失败，别让空卡片冒充反馈
  if (!question && checks.length === 0) return null
  const quiz = parseQuiz(o.quiz)
  return {
    next_question: question,
    checks,
    hint: hintText ? { level: clampInt(hintRaw.level, 0, 3, 0), text: hintText } : null,
    rubric_score: {
      total: clampInt(scoreRaw.total, 0, 100, 0),
      comments: Array.isArray(scoreRaw.comments) ? scoreRaw.comments.map((c) => str(c, 400)).filter(Boolean) : []
    },
    blockers: str(o.blockers),
    ...(quiz.length ? { quiz } : {})
  }
}

/** 检查点通过比例：0~1，状态机据此判断能否推进 */
export function passRate(checks: CheckItem[]): number {
  if (checks.length === 0) return 0
  return checks.filter((c) => c.passed).length / checks.length
}

/** Executor 的示例解析：kind 只认 code/text，其余按 text 处理 */
export function parseScaffold(raw: string): Scaffold | null {
  const json = sliceJsonObject(raw)
  if (!json) return null
  let obj: unknown
  try {
    obj = JSON.parse(json)
  } catch {
    return null
  }
  const o = (obj ?? {}) as Record<string, unknown>
  const content = str(o.content).trim()
  if (!content) return null
  const fieldKey = str(o.fieldKey, 40).trim()
  return {
    kind: o.kind === 'code' ? 'code' : 'text',
    fieldKey: fieldKey && fieldKey.toLowerCase() !== 'null' ? fieldKey : undefined,
    content
  }
}
