import { ipcMain, BrowserWindow } from 'electron'
import { PROVIDERS } from './llm/presets'
import { testConnection } from './llm/openai-compat'
import { runtimeInfo } from './runtime'
import { getApiKey, hasApiKey, setApiKey } from './secrets'
import {
  addRun,
  createSession,
  getSessionMessages,
  listAiUsage,
  listRuns,
  listSessions,
  loadSettings,
  MAX_PINNED_METHODS,
  pinMethod,
  pinnedMethods,
  saveSettings,
  unpinMethod
} from './repo'
import { readArtifact, runCode, stop as stopRun } from './sandbox'
import { adopt, askHint, abort, send } from './agent/coach'
import { currentStageId, openStage, stageCard, stageViews, submitStage } from './stage'
import { compilePaper, openPaperPdf, paperDraft, readPaperPdf, saveDraft, stopCompile } from './latex/compile'
import { usageSummary } from './compliance/collect'
import { exportUsagePdf, openUsagePdf, usagePdf } from './compliance/export'
import { methodById } from '../shared/methods'
import type { ArtifactContent, RunPayload, RunRecord } from '../shared/sandbox'
import type { AdoptPayload, StageView, SubmissionPayload } from '../shared/agent'
import type { CompileResult, PaperDraft } from '../shared/latex'
import type { UsageExportResult, UsageSummary } from '../shared/compliance'
import {
  IPC,
  type ActiveSettings,
  type ProviderId,
  type SendPayload,
  type SettingsView,
  type TestResult
} from '../shared/types'

function assertSettings(input: unknown): ActiveSettings {
  const s = input as Partial<ActiveSettings>
  if (!s || typeof s !== 'object') throw new Error('设置格式不正确')
  if (!PROVIDERS.some((p) => p.id === s.providerId)) throw new Error('未知的 provider')
  if (typeof s.baseUrl !== 'string' || !/^https?:\/\//.test(s.baseUrl.trim()))
    throw new Error('baseUrl 必须是 http(s) 地址')
  if (typeof s.model !== 'string' || !s.model.trim() || s.model.length > 120) throw new Error('model 名称不正确')
  const temperature = Number(s.temperature)
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
    throw new Error('temperature 需在 0 到 2 之间')
  return {
    providerId: s.providerId as ProviderId,
    baseUrl: s.baseUrl.trim(),
    model: s.model.trim(),
    temperature
  }
}

function view(): SettingsView {
  const s = loadSettings()
  return { ...s, hasApiKey: hasApiKey(s.providerId) }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.SettingsGet, () => view())

  ipcMain.handle(IPC.SettingsSave, (_e, input: unknown) => {
    saveSettings(assertSettings(input))
    return view()
  })

  ipcMain.handle(IPC.ApiKeySet, (_e, providerId: string, key: string) => {
    if (!PROVIDERS.some((p) => p.id === providerId)) throw new Error('未知的 provider')
    if (typeof key !== 'string' || !key.trim()) throw new Error('API Key 不能为空')
    setApiKey(providerId as ProviderId, key.trim())
    return view()
  })

  ipcMain.handle(IPC.ApiKeyClear, (_e, providerId: string) => {
    if (!PROVIDERS.some((p) => p.id === providerId)) throw new Error('未知的 provider')
    setApiKey(providerId as ProviderId, '')
    return view()
  })

  ipcMain.handle(IPC.ProviderList, () => PROVIDERS)

  ipcMain.handle(IPC.ProviderTest, async (_e, baseUrl: string, model: string, apiKey?: string): Promise<TestResult> => {
    const started = Date.now()
    try {
      const key = apiKey?.trim() || getApiKey(loadSettings().providerId)
      if (!key) throw new Error('请先填写 API Key')
      const r = await testConnection({ baseUrl, model, apiKey: key })
      return { ok: true, latencyMs: r.latencyMs, detail: r.reply || '连通' }
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        detail: (e as Error).message
      }
    }
  })

  ipcMain.handle(IPC.SessionList, () => listSessions())
  ipcMain.handle(IPC.SessionGet, (_e, id: number) => (Number.isInteger(id) ? getSessionMessages(id) : []))
  ipcMain.handle(IPC.ChatSend, (_e, payload: SendPayload) => send(payload))
  ipcMain.handle(IPC.ChatAbort, (_e, id: number | null) =>
    abort(Number.isInteger(id as number) ? (id as number) : null)
  )
  ipcMain.handle(IPC.RuntimeInfo, () => runtimeInfo())

  ipcMain.handle(IPC.CodeRun, async (_e, payload: RunPayload): Promise<RunRecord> => {
    const code = typeof payload?.code === 'string' ? payload.code : ''
    if (!code.trim()) throw new Error('代码为空')
    if (code.length > 20_000) throw new Error('代码过长，请拆分后再运行')
    let sessionId = payload?.sessionId
    if (!Number.isInteger(sessionId) || (sessionId as number) < 1) {
      // 还没聊过就先跑代码，给这条代码单独开一个会话，别让结果无处可存
      sessionId = createSession(`代码草稿 ${new Date().toLocaleString('zh-CN')}`, 'sandbox', 'local')
    }
    const id = sessionId as number
    const attempt = await runCode(id, code)
    const runId = addRun(id, code, attempt)
    return {
      ...attempt.outcome,
      id: runId,
      sessionId: id,
      code,
      timedOut: attempt.timedOut,
      exitCode: attempt.exitCode,
      durationMs: attempt.durationMs,
      createdAt: Date.now()
    }
  })

  ipcMain.handle(IPC.CodeStop, (_e, sessionId: number) => (Number.isInteger(sessionId) ? stopRun(sessionId) : false))

  ipcMain.handle(IPC.CodeHistory, (_e, sessionId: number): RunRecord[] =>
    Number.isInteger(sessionId) && sessionId > 0 ? listRuns(sessionId) : []
  )

  ipcMain.handle(IPC.CodeArtifact, (_e, sessionId: number, name: string): ArtifactContent => {
    if (!Number.isInteger(sessionId) || sessionId < 1) throw new Error('会话不存在')
    if (typeof name !== 'string') throw new Error('文件名不合法')
    return readArtifact(sessionId, name)
  })

  const needSession = (id: unknown): number => {
    if (!Number.isInteger(id) || (id as number) < 1) throw new Error('会话不存在')
    return id as number
  }

  ipcMain.handle(IPC.StageList, (_e, sessionId: unknown): StageView[] => stageViews(needSession(sessionId)))
  ipcMain.handle(IPC.StageCurrent, (_e, sessionId: unknown): number => currentStageId(needSession(sessionId)))
  ipcMain.handle(IPC.StageOpen, (_e, sessionId: unknown, stageId: unknown) => {
    const sid = needSession(sessionId)
    const n = Number(stageId)
    if (!Number.isInteger(n) || n < 1) throw new Error('阶段编号不合法')
    return openStage(sid, n)
  })
  ipcMain.handle(IPC.StageCard, (_e, sessionId: unknown, stageId: unknown) => {
    const sid = needSession(sessionId)
    const n = Number(stageId)
    if (!Number.isInteger(n) || n < 1) throw new Error('阶段编号不合法')
    return stageCard(sid, n)
  })
  ipcMain.handle(IPC.StageSubmit, (_e, payload: SubmissionPayload): StageView[] => {
    const sid = needSession(payload?.sessionId)
    const n = Number(payload?.stageId)
    if (!Number.isInteger(n) || n < 1) throw new Error('阶段编号不合法')
    const values: Record<string, string> = {}
    for (const [k, v] of Object.entries(payload?.values ?? {})) {
      if (typeof v === 'string') values[k.slice(0, 40)] = v
    }
    submitStage(sid, n, values)
    return stageViews(sid)
  })
  ipcMain.handle(IPC.HintAsk, (_e, sessionId: unknown) => askHint(needSession(sessionId)))
  ipcMain.handle(IPC.ScaffoldAdopt, (_e, payload: AdoptPayload) => adopt(payload))
  ipcMain.handle(IPC.UsageList, (_e, sessionId: unknown) => listAiUsage(needSession(sessionId)))

  ipcMain.handle(IPC.PaperDraft, (_e, sessionId: unknown): PaperDraft => paperDraft(needSession(sessionId)))
  ipcMain.handle(IPC.PaperSave, (_e, sessionId: unknown, source: unknown) => {
    const src = typeof source === 'string' ? source : ''
    if (src.length > 300_000) throw new Error('论文源文件过长，请拆分附录')
    return saveDraft(needSession(sessionId), src)
  })
  ipcMain.handle(IPC.PaperCompile, (_e, sessionId: unknown, source: unknown): Promise<CompileResult> => {
    const src = typeof source === 'string' ? source : ''
    if (!src.trim()) throw new Error('正文是空的')
    return compilePaper(needSession(sessionId), src)
  })
  ipcMain.handle(IPC.PaperStop, (_e, sessionId: unknown) => stopCompile(needSession(sessionId)))
  ipcMain.handle(IPC.PaperPdf, (_e, sessionId: unknown): ArtifactContent | null => readPaperPdf(needSession(sessionId)))
  ipcMain.handle(IPC.PaperOpen, (_e, sessionId: unknown) => openPaperPdf(needSession(sessionId)))

  ipcMain.handle(IPC.MethodsPinned, (_e, sessionId: unknown): string[] => pinnedMethods(needSession(sessionId)))
  ipcMain.handle(IPC.MethodsPin, (_e, sessionId: unknown, methodId: unknown, on: unknown): string[] => {
    const sid = needSession(sessionId)
    if (typeof methodId !== 'string' || !methodById(methodId)) throw new Error('未知的方法卡')
    if (on === false) unpinMethod(sid, methodId)
    else if (!pinMethod(sid, methodId))
      throw new Error(`同时最多钉 ${String(MAX_PINNED_METHODS)} 张候选方法，先取消一张`)
    return pinnedMethods(sid)
  })

  ipcMain.handle(IPC.UsageSummary, (_e, sessionId: unknown): UsageSummary => usageSummary(needSession(sessionId)))
  ipcMain.handle(IPC.UsagePdf, (_e, sessionId: unknown): ArtifactContent | null => usagePdf(needSession(sessionId)))
  ipcMain.handle(IPC.UsageOpen, (_e, sessionId: unknown) => openUsagePdf(needSession(sessionId)))
  ipcMain.handle(IPC.UsageExport, (_e, sessionId: unknown): Promise<UsageExportResult> => {
    const sid = needSession(sessionId)
    // 另存对话框挂在这条会话的窗口上，学生点「取消」不是错误，savedTo 给 null 就行
    return exportUsagePdf(sid, BrowserWindow.fromWebContents(_e.sender))
  })
}
