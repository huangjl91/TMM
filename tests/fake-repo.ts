/**
 * 状态机离线测试用的假 repo：只实现 src/main/stage.ts 用到的那几个函数。
 * 真 repo 依赖 electron 的 userData 路径与 safeStorage，不能在裸 node 里跑。
 */
import type { StageStatus } from '../src/shared/agent'

export interface StageRow {
  stageId: number
  status: StageStatus
  hintLevel: number
  attempts: number
  score: number | null
}

export interface UsageRow {
  sessionId: number
  stageId: number | null
  action: string
  level: number | null
  detail: string
  model: string
}

const states = new Map<number, Map<number, StageRow>>()
const outputs = new Map<string, Record<string, string>>()
const stageKeys = new Map<number, string>()
const pins = new Map<number, string[]>()
const usage: UsageRow[] = []

function mapFor(sessionId: number): Map<number, StageRow> {
  let m = states.get(sessionId)
  if (!m) {
    m = new Map()
    states.set(sessionId, m)
  }
  return m
}

export function getStageStates(sessionId: number): Map<number, StageRow> {
  return new Map(mapFor(sessionId))
}

export function getStageState(sessionId: number, stageId: number): StageRow | null {
  return mapFor(sessionId).get(stageId) ?? null
}

export function upsertStageState(
  sessionId: number,
  stageId: number,
  patch: Partial<Omit<StageRow, 'stageId'>>
): StageRow {
  const cur: StageRow = getStageState(sessionId, stageId) ?? {
    stageId,
    status: 'todo',
    hintLevel: 0,
    attempts: 0,
    score: null
  }
  const next: StageRow = { ...cur, ...patch, stageId }
  mapFor(sessionId).set(stageId, next)
  return next
}

export function setSessionStage(sessionId: number, stageKey: string): void {
  stageKeys.set(sessionId, stageKey)
}

/** 真 repo 从 session_methods 读学生钉过的候选方法 */
export function pinnedMethods(sessionId: number): string[] {
  return [...(pins.get(sessionId) ?? [])]
}

export function saveStageOutputs(sessionId: number, stageId: number, values: Record<string, string>): void {
  const key = `${sessionId}:${stageId}`
  outputs.set(key, { ...(outputs.get(key) ?? {}), ...values })
}

export function latestStageOutputs(sessionId: number, stageId: number): Record<string, string> {
  return { ...(outputs.get(`${sessionId}:${stageId}`) ?? {}) }
}

export function logAiUsage(
  sessionId: number,
  stageId: number | null,
  action: string,
  detail: string,
  level: number | null = null,
  model = ''
): void {
  usage.push({ sessionId, stageId, action, level, detail, model })
}

export function _usage(): UsageRow[] {
  return usage
}

export function _stageKeyOf(sessionId: number): string | null {
  return stageKeys.get(sessionId) ?? null
}

export function _pin(sessionId: number, methodIds: string[]): void {
  pins.set(sessionId, [...methodIds])
}

export function _reset(): void {
  states.clear()
  outputs.clear()
  stageKeys.clear()
  pins.clear()
  usage.length = 0
}
