import { getDb } from './db'
import type { RunAttempt } from './sandbox'
import type { ArtifactInfo, RunRecord, SandboxLimits } from '../shared/sandbox'
import type { MessageKind, StageStatus, UsageRow } from '../shared/agent'
import type { PlotAnswers } from '../shared/plots'
import type { ActiveSettings, ChatRole, SessionSummary, StoredMessage } from '../shared/types'

const DEFAULT_SETTINGS: ActiveSettings = {
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-reasoner',
  temperature: 0.3
}

export function loadSettings(): ActiveSettings {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('activeSettings') as
    { value: string } | undefined
  if (!row) return { ...DEFAULT_SETTINGS }
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(row.value) as Partial<ActiveSettings>)
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: ActiveSettings): void {
  getDb()
    .prepare(
      `INSERT INTO settings(key, value) VALUES('activeSettings', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(JSON.stringify(s))
}

export function createSession(title: string, provider: string, model: string): number {
  const now = Date.now()
  const r = getDb()
    .prepare('INSERT INTO sessions(title, provider, model, created_at, updated_at) VALUES(?,?,?,?,?)')
    .run(title.slice(0, 60), provider, model, now, now)
  return Number(r.lastInsertRowid)
}

export function touchSession(id: number): void {
  getDb().prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

export function renameSession(id: number, title: string): void {
  getDb().prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(title.slice(0, 60), Date.now(), id)
}

export function listSessions(): SessionSummary[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.title, s.model, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS n
       FROM sessions s ORDER BY s.updated_at DESC LIMIT 50`
    )
    .all()
    .map((r) => {
      const row = r as Record<string, bigint | number | string>
      return {
        id: Number(row.id),
        title: String(row.title),
        model: String(row.model),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        messageCount: Number(row.n)
      }
    })
}

export function appendMessage(sessionId: number, role: ChatRole, content: string, kind = 'chat'): number {
  const r = getDb()
    .prepare('INSERT INTO messages(session_id, role, content, kind, created_at) VALUES(?,?,?,?,?)')
    .run(sessionId, role, content, kind, Date.now())
  touchSession(sessionId)
  return Number(r.lastInsertRowid)
}

/** 流式过程中落最后一次快照，避免每次 token 都写库 */
export function finalizeMessage(
  id: number,
  content: string,
  reasoning: string | null,
  usage: { input: number; output: number } | null
): void {
  getDb()
    .prepare(`UPDATE messages SET content = ?, reasoning = ?, usage_input = ?, usage_output = ? WHERE id = ?`)
    .run(content, reasoning, usage?.input ?? null, usage?.output ?? null, id)
}

export function getSessionMessages(sessionId: number): StoredMessage[] {
  return getDb()
    .prepare('SELECT id, role, content, reasoning, kind, created_at FROM messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId)
    .map((r) => {
      const row = r as Record<string, bigint | number | string | null>
      return {
        id: Number(row.id),
        role: row.role as ChatRole,
        content: String(row.content),
        reasoning: row.reasoning ? String(row.reasoning) : undefined,
        kind: String(row.kind ?? 'chat') as MessageKind,
        createdAt: Number(row.created_at)
      }
    })
}

/**
 * 右侧 AI 对话框的历史。它和教练对话共用 messages 表，靠 kind 分流：
 * 教练那边喂历史时必须滤掉 free，否则自由问答会串进阶段的 rubric 上下文。
 */
export function getFreeMessages(sessionId: number): StoredMessage[] {
  return getSessionMessages(sessionId).filter((m) => m.kind === 'free')
}

const RUN_COLS =
  'id, session_id, code, ok, stdout, stderr, error_type, error_message, traceback, artifacts, limits, duration_ms, timed_out, exit_code, created_at'

function jsonCol<T>(raw: unknown, fallback: T): T {
  try {
    return JSON.parse(String(raw ?? '')) as T
  } catch {
    return fallback
  }
}

function toRun(r: unknown): RunRecord {
  const row = r as Record<string, bigint | number | string | null>
  const traceback = row.traceback ? String(row.traceback) : ''
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    code: String(row.code),
    ok: Number(row.ok) === 1,
    stdout: String(row.stdout ?? ''),
    stderr: String(row.stderr ?? ''),
    error: row.error_type
      ? {
          type: String(row.error_type),
          message: String(row.error_message ?? ''),
          traceback
        }
      : null,
    durationMs: Number(row.duration_ms ?? 0),
    limits: jsonCol<SandboxLimits>(row.limits, {
      jobObject: false,
      memory: false,
      error: null
    }),
    artifacts: jsonCol<ArtifactInfo[]>(row.artifacts, []),
    timedOut: Number(row.timed_out) === 1,
    exitCode: row.exit_code === null ? null : Number(row.exit_code),
    createdAt: Number(row.created_at)
  }
}

export function addRun(sessionId: number, code: string, attempt: RunAttempt): number {
  const { outcome, timedOut, exitCode } = attempt
  const r = getDb()
    .prepare(
      `INSERT INTO runs(session_id, code, ok, stdout, stderr, error_type, error_message, traceback,
                         artifacts, limits, duration_ms, timed_out, exit_code, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      sessionId,
      code,
      outcome.ok ? 1 : 0,
      outcome.stdout,
      outcome.stderr,
      outcome.error?.type ?? null,
      outcome.error?.message ?? null,
      outcome.error?.traceback ?? null,
      JSON.stringify(outcome.artifacts),
      JSON.stringify(outcome.limits),
      attempt.durationMs,
      timedOut ? 1 : 0,
      exitCode,
      Date.now()
    )
  touchSession(sessionId)
  return Number(r.lastInsertRowid)
}

/** 运行历史连同代码一起回，学生要能翻回去改 */
export function listRuns(sessionId: number, limit = 20): RunRecord[] {
  const rows = getDb()
    .prepare(`SELECT ${RUN_COLS} FROM runs WHERE session_id = ? ORDER BY id DESC LIMIT ?`)
    .all(sessionId, limit)
  return (rows as unknown[]).map(toRun).reverse()
}

export interface StageRow {
  stageId: number
  status: StageStatus
  hintLevel: number
  attempts: number
  score: number | null
}

export function getStageStates(sessionId: number): Map<number, StageRow> {
  const rows = getDb()
    .prepare('SELECT stage_id, status, hint_level, attempts, score FROM stage_state WHERE session_id = ?')
    .all(sessionId) as unknown as Record<string, bigint | number | string>[]
  const map = new Map<number, StageRow>()
  for (const r of rows) {
    map.set(Number(r.stage_id), {
      stageId: Number(r.stage_id),
      status: String(r.status) as StageStatus,
      hintLevel: Number(r.hint_level),
      attempts: Number(r.attempts),
      score: r.score === null ? null : Number(r.score)
    })
  }
  return map
}

export function getStageState(sessionId: number, stageId: number): StageRow | null {
  return getStageStates(sessionId).get(stageId) ?? null
}

export function upsertStageState(
  sessionId: number,
  stageId: number,
  patch: Partial<Omit<StageRow, 'stageId'>>
): StageRow {
  const cur = getStageState(sessionId, stageId) ?? {
    stageId,
    status: 'todo' as StageStatus,
    hintLevel: 0,
    attempts: 0,
    score: null
  }
  const next: StageRow = { ...cur, ...patch, stageId }
  getDb()
    .prepare(
      `INSERT INTO stage_state(session_id, stage_id, status, hint_level, attempts, score, updated_at)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(session_id, stage_id) DO UPDATE SET
         status = excluded.status, hint_level = excluded.hint_level,
         attempts = excluded.attempts, score = excluded.score, updated_at = excluded.updated_at`
    )
    .run(sessionId, stageId, next.status, next.hintLevel, next.attempts, next.score, Date.now())
  touchSession(sessionId)
  return next
}

export function setSessionStage(sessionId: number, stageKey: string): void {
  getDb().prepare('UPDATE sessions SET stage_key = ?, updated_at = ? WHERE id = ?').run(stageKey, Date.now(), sessionId)
}

export function getSessionStageKey(sessionId: number): string | null {
  const row = getDb().prepare('SELECT stage_key FROM sessions WHERE id = ?').get(sessionId) as
    { stage_key: string | null } | undefined
  return row?.stage_key ?? null
}

/** 逐问轴上学生当前盯着第几问；0 表示不区分（还没拆出多问） */
export function getSessionQuestion(sessionId: number): number {
  const row = getDb().prepare('SELECT question_idx FROM sessions WHERE id = ?').get(sessionId) as
    { question_idx: bigint | number | null } | undefined
  return Number(row?.question_idx ?? 0) || 0
}

export function setSessionQuestion(sessionId: number, idx: number): void {
  const n = Number.isInteger(idx) && (idx as number) >= 1 && (idx as number) <= 12 ? (idx as number) : 0
  getDb().prepare('UPDATE sessions SET question_idx = ?, updated_at = ? WHERE id = ?').run(n, Date.now(), sessionId)
}

/**
 * 绘图三问按阶段各存一份：阶段 6 求解与阶段 8 图表要画的图不是一回事。
 * Executor 的代码骨架要照着学生自己写的这三答给，不能替他改主意。
 */
export function getPlotIntent(sessionId: number, stageId: number): PlotAnswers | null {
  const row = getDb()
    .prepare('SELECT question, axes, takeaway FROM plot_intents WHERE session_id = ? AND stage_id = ?')
    .get(sessionId, stageId) as { question: string; axes: string; takeaway: string } | undefined
  if (!row) return null
  return { question: String(row.question ?? ''), axes: String(row.axes ?? ''), takeaway: String(row.takeaway ?? '') }
}

export function setPlotIntent(sessionId: number, stageId: number, answers: PlotAnswers): void {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO plot_intents(session_id, stage_id, question, axes, takeaway, updated_at) VALUES(?,?,?,?,?,?)
       ON CONFLICT(session_id, stage_id) DO UPDATE SET
         question = excluded.question, axes = excluded.axes, takeaway = excluded.takeaway, updated_at = excluded.updated_at`
    )
    .run(
      sessionId,
      stageId,
      (answers.question ?? '').trim().slice(0, 400),
      (answers.axes ?? '').trim().slice(0, 400),
      (answers.takeaway ?? '').trim().slice(0, 400),
      now
    )
  touchSession(sessionId)
}

/** 任务卡按字段逐条追加，历史版本留着——合规导出要能看出学生改了几轮 */
export function saveStageOutputs(sessionId: number, stageId: number, values: Record<string, string>): void {
  const ins = getDb().prepare(
    'INSERT INTO stage_outputs(session_id, stage_id, field_key, content, created_at) VALUES(?,?,?,?,?)'
  )
  const now = Date.now()
  for (const [key, content] of Object.entries(values)) {
    if (typeof content !== 'string') continue
    ins.run(sessionId, stageId, key.slice(0, 40), content.slice(0, 20_000), now)
  }
  touchSession(sessionId)
}

export function latestStageOutputs(sessionId: number, stageId: number): Record<string, string> {
  const rows = getDb()
    .prepare(
      `SELECT field_key, content FROM stage_outputs
       WHERE session_id = ? AND stage_id = ? AND id IN
         (SELECT MAX(id) FROM stage_outputs WHERE session_id = ? AND stage_id = ? GROUP BY field_key)`
    )
    .all(sessionId, stageId, sessionId, stageId) as unknown as {
    field_key: string
    content: string
  }[]
  const out: Record<string, string> = {}
  for (const r of rows) out[String(r.field_key)] = String(r.content)
  return out
}

/** AI 使用日志：M5 的《AI 工具使用详情.pdf》直接读这张表 */
export function logAiUsage(
  sessionId: number,
  stageId: number | null,
  action: string,
  detail: string,
  level: number | null = null,
  model = ''
): void {
  getDb()
    .prepare(
      'INSERT INTO ai_usage_log(session_id, stage_id, action, level, detail, model, created_at) VALUES(?,?,?,?,?,?,?)'
    )
    .run(sessionId, stageId, action.slice(0, 40), level, detail.slice(0, 2000), model.slice(0, 60), Date.now())
}

export function listAiUsage(sessionId: number): UsageRow[] {
  const rows = getDb()
    .prepare(
      'SELECT id, stage_id, action, level, detail, model, created_at FROM ai_usage_log WHERE session_id = ? ORDER BY id ASC'
    )
    .all(sessionId) as unknown as Record<string, bigint | number | string | null>[]
  return rows.map((r) => ({
    id: Number(r.id),
    stageId: r.stage_id === null ? null : Number(r.stage_id),
    action: String(r.action),
    level: r.level === null ? null : Number(r.level),
    detail: String(r.detail),
    model: String(r.model),
    createdAt: Number(r.created_at)
  }))
}

/** 论文稿只在编译时落一版：正文永远以学生手写的为准 */
export function savePaper(sessionId: number, source: string): void {
  getDb()
    .prepare('INSERT INTO paper_versions(session_id, source, created_at) VALUES(?,?,?)')
    .run(sessionId, source, Date.now())
  touchSession(sessionId)
}

export interface PaperRow {
  source: string
  createdAt: number
}

export function latestPaper(sessionId: number): PaperRow | null {
  const row = getDb()
    .prepare('SELECT source, created_at FROM paper_versions WHERE session_id = ? ORDER BY id DESC LIMIT 1')
    .get(sessionId) as { source: string; created_at: bigint | number } | undefined
  if (!row) return null
  return { source: String(row.source), createdAt: Number(row.created_at) }
}

/** 钉选上限压到 3：再多就不是「候选比较」而是把整份方法库灌给模型了 */
export const MAX_PINNED_METHODS = 3

export function pinnedMethods(sessionId: number): string[] {
  const rows = getDb()
    .prepare('SELECT method_id FROM session_methods WHERE session_id = ? ORDER BY pinned_at, method_id')
    .all(sessionId) as unknown as { method_id: string | number }[]
  return rows.map((r) => String(r.method_id))
}

/** 已钉满则拒绝并返回 false，让界面提示学生先取消一张 */
export function pinMethod(sessionId: number, methodId: string): boolean {
  const cur = pinnedMethods(sessionId)
  if (cur.includes(methodId)) return true
  if (cur.length >= MAX_PINNED_METHODS) return false
  getDb()
    .prepare('INSERT INTO session_methods(session_id, method_id, pinned_at) VALUES(?,?,?)')
    .run(sessionId, methodId, Date.now())
  return true
}

export function unpinMethod(sessionId: number, methodId: string): void {
  getDb().prepare('DELETE FROM session_methods WHERE session_id = ? AND method_id = ?').run(sessionId, methodId)
}

export interface SessionInfo {
  title: string
  provider: string
  model: string
  createdAt: number
}

export function sessionInfo(sessionId: number): SessionInfo | null {
  const row = getDb().prepare('SELECT title, provider, model, created_at FROM sessions WHERE id = ?').get(sessionId) as
    { title: string; provider: string; model: string; created_at: bigint | number } | undefined
  if (!row) return null
  return { title: String(row.title), provider: String(row.provider), model: String(row.model), createdAt: Number(row.created_at) }
}

const countOf = (sql: string, sessionId: number): number => {
  const row = getDb().prepare(sql).get(sessionId) as { n: bigint | number } | undefined
  return Number(row?.n ?? 0)
}

/** 合规导出只要计数，别把 stdout 整表捞进内存 */
export function countRuns(sessionId: number): number {
  return countOf('SELECT COUNT(*) AS n FROM runs WHERE session_id = ?', sessionId)
}

export function countPaperVersions(sessionId: number): number {
  return countOf('SELECT COUNT(*) AS n FROM paper_versions WHERE session_id = ?', sessionId)
}

/** 导入的赛题与附件：digest 是提取摘要，不是文件内容 */
export function addSessionFile(
  sessionId: number,
  kind: 'problem' | 'data',
  name: string,
  relPath: string,
  size: number,
  digestKind: string,
  digest: string
): number {
  const r = getDb()
    .prepare(
      `INSERT INTO session_files(session_id, kind, name, rel_path, size, digest_kind, digest, created_at)
       VALUES(?,?,?,?,?,?,?,?)`
    )
    .run(sessionId, kind, name.slice(0, 160), relPath.slice(0, 300), size, digestKind, digest.slice(0, 20_000), Date.now())
  touchSession(sessionId)
  return Number(r.lastInsertRowid)
}

export function listSessionFiles(sessionId: number): {
  id: number
  kind: 'problem' | 'data'
  name: string
  relPath: string
  size: number
  digestKind: 'text' | 'pdf' | 'csv' | 'binary'
  digest: string
  needsVerify: boolean
  createdAt: number
}[] {
  const rows = getDb()
    .prepare(
      'SELECT id, kind, name, rel_path, size, digest_kind, digest, created_at FROM session_files WHERE session_id = ? ORDER BY kind, id'
    )
    .all(sessionId) as unknown as Record<string, bigint | number | string>[]
  return rows.map((r) => ({
    id: Number(r.id),
    kind: String(r.kind) === 'problem' ? ('problem' as const) : ('data' as const),
    name: String(r.name),
    relPath: String(r.rel_path),
    size: Number(r.size),
    digestKind: String(r.digest_kind) as 'text' | 'pdf' | 'csv' | 'binary',
    digest: String(r.digest),
    needsVerify: String(r.digest_kind) === 'pdf',
    createdAt: Number(r.created_at)
  }))
}

export function countSessionFiles(sessionId: number): number {
  return countOf('SELECT COUNT(*) AS n FROM session_files WHERE session_id = ?', sessionId)
}

export function getGuidedChoices(
  sessionId: number,
  questionIdx: number
): Partial<Record<string, { pickedKey: string; pickedText: string; pickedMeans: string; userNote?: string; timestamp: number }>> {
  const rows = getDb()
    .prepare(
      'SELECT step, picked_key, picked_text, picked_means, user_note, updated_at FROM guided_choices WHERE session_id = ? AND question_idx = ?'
    )
    .all(sessionId, questionIdx) as unknown as Record<string, bigint | number | string>[]
  const out: Record<string, { pickedKey: string; pickedText: string; pickedMeans: string; userNote?: string; timestamp: number }> = {}
  for (const r of rows) {
    out[String(r.step)] = {
      pickedKey: String(r.picked_key),
      pickedText: String(r.picked_text),
      pickedMeans: String(r.picked_means),
      userNote: String(r.user_note ?? ''),
      timestamp: Number(r.updated_at)
    }
  }
  return out
}

export function clearGuidedChoices(sessionId: number, questionIdx: number): void {
  getDb().prepare('DELETE FROM guided_choices WHERE session_id = ? AND question_idx = ?').run(sessionId, questionIdx)
  touchSession(sessionId)
}

export function saveGuidedChoice(
  sessionId: number,
  questionIdx: number,
  step: string,
  pickedKey: string,
  pickedText: string,
  pickedMeans: string,
  userNote = ''
): void {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO guided_choices(session_id, question_idx, step, picked_key, picked_text, picked_means, user_note, updated_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id, question_idx, step) DO UPDATE SET
         picked_key = excluded.picked_key,
         picked_text = excluded.picked_text,
         picked_means = excluded.picked_means,
         user_note = excluded.user_note,
         updated_at = excluded.updated_at`
    )
    .run(sessionId, questionIdx, step, pickedKey, pickedText, pickedMeans, userNote, now)
  touchSession(sessionId)
}

export interface StoredGuidedAnalysis {
  knowledgeJson: string
  questionsJson: string
  elementsJson: string
  updatedAt: number
}

export function getGuidedAnalysis(sessionId: number, questionIdx: number): StoredGuidedAnalysis | null {
  const row = getDb()
    .prepare(
      'SELECT knowledge_json, questions_json, elements_json, updated_at FROM guided_analyses WHERE session_id = ? AND question_idx = ?'
    )
    .get(sessionId, questionIdx) as
    | { knowledge_json: string; questions_json: string; elements_json: string; updated_at: bigint | number }
    | undefined
  if (!row) return null
  return {
    knowledgeJson: String(row.knowledge_json),
    questionsJson: String(row.questions_json),
    elementsJson: String(row.elements_json),
    updatedAt: Number(row.updated_at)
  }
}

export function saveGuidedAnalysis(
  sessionId: number,
  questionIdx: number,
  knowledgeJson: string,
  questionsJson: string,
  elementsJson: string
): void {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO guided_analyses(session_id, question_idx, knowledge_json, questions_json, elements_json, updated_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(session_id, question_idx) DO UPDATE SET
         knowledge_json = excluded.knowledge_json,
         questions_json = excluded.questions_json,
         elements_json = excluded.elements_json,
         updated_at = excluded.updated_at`
    )
    .run(sessionId, questionIdx, knowledgeJson, questionsJson, elementsJson, now)
  touchSession(sessionId)
}
