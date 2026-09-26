import { ipcMain, BrowserWindow } from 'electron'
import { PROVIDERS } from './llm/presets'
import { testConnection } from './llm/openai-compat'
import { runtimeInfo } from './runtime'
import { getApiKey, hasApiKey, setApiKey } from './secrets'
import {
  addRun,
  createSession,
  getPlotIntent,
  getFreeMessages,
  getSessionMessages,
  getSessionQuestion,
  listAiUsage,
  listRuns,
  listSessions,
  loadSettings,
  logAiUsage,
  MAX_PINNED_METHODS,
  pinMethod,
  pinnedMethods,
  saveSettings,
  setPlotIntent,
  setSessionQuestion,
  unpinMethod
} from './repo'
import { readArtifact, runCode, stop as stopRun } from './sandbox'
import { filesOf, intake, openProblemPdf, readProblemPdf } from './intake'
import { adopt, askHint, abort, send } from './agent/coach'
import { abortFree, sendFree } from './agent/freechat'
import { currentStageId, openStage, questionsOf, stageCard, stageViews, submitStage } from './stage'
import { compilePaper, openPaperPdf, paperDraft, readPaperPdf, saveDraft, stopCompile } from './latex/compile'
import { usageSummary } from './compliance/collect'
import { exportUsagePdf, openUsagePdf, usagePdf } from './compliance/export'
import { getGuidedState, handleGuidedAskAi, handleGuidedCategory, handleGuidedChoose, handleGuidedReanalyze, handleGuidedSync } from './guidedQuiz'
import { methodById } from '../shared/methods'
import { ERROR_ESCALATE_STREAK, errorGuide, plotDigest, plotHints, sameErrorStreak, type PlotAnswers } from '../shared/plots'
import type { ArtifactContent, RunPayload, RunRecord } from '../shared/sandbox'
import type { IntakeResult, SessionFileView } from '../shared/intake'
import type { QuestionFocus } from '../shared/questions'
import type { AdoptPayload, StageView, SubmissionPayload } from '../shared/agent'
import type { CompileResult, PaperDraft } from '../shared/latex'
import type { UsageExportResult, UsageSummary } from '../shared/compliance'
import type { GuidedSessionState, AiAdvice } from '../shared/guidedQuiz'
import {
  IPC,
  type ActiveSettings,
  type ExplainShownPayload,
  type FreeSendPayload,
  type GuidedAskAiPayload,
  type GuidedChoosePayload,
  type GuidedCategoryPayload,
  type GuidedGetPayload,
  type GuidedReanalyzePayload,
  type GuidedSyncPayload,
  type PlotAnswerPayload,
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
  ipcMain.handle(IPC.SessionIntake, (_e): Promise<IntakeResult | null> => intake())
  ipcMain.handle(IPC.SessionFiles, (_e, sessionId: unknown): SessionFileView[] => filesOf(needSession(sessionId)))
  ipcMain.handle(IPC.SessionProblemPdf, (_e, sessionId: unknown) => readProblemPdf(needSession(sessionId)))
  ipcMain.handle(IPC.SessionProblemOpen, (_e, sessionId: unknown) => openProblemPdf(needSession(sessionId)))
  ipcMain.handle(IPC.SessionQuestions, (_e, sessionId: unknown): QuestionFocus => {
    const sid = needSession(sessionId)
    return { questions: questionsOf(sid), focus: getSessionQuestion(sid) }
  })
  ipcMain.handle(
    IPC.SessionQuestionSet,
    (_e, sessionId: unknown, idx: unknown): number => {
      const sid = needSession(sessionId)
      const n = Number.isInteger(idx) ? Number(idx) : 0
      setSessionQuestion(sid, n)
      return getSessionQuestion(sid)
    }
  )
  ipcMain.handle(IPC.ChatSend, (_e, payload: SendPayload) => send(payload))
  ipcMain.handle(IPC.ChatAbort, (_e, id: number | null) =>
    abort(Number.isInteger(id as number) ? (id as number) : null)
  )

  /** 右侧 AI 对话框：与教练并列的第二条链路，历史和留痕都靠 kind='free' 分流 */
  ipcMain.handle(IPC.ChatFree, (_e, payload: FreeSendPayload) => {
    const text = typeof payload?.text === 'string' ? payload.text : ''
    if (text.length > 20_000) throw new Error('这一条太长了，拆成几句分别问效果更好')
    const sid = payload?.sessionId
    return sendFree({ sessionId: Number.isInteger(sid) ? (sid as number) : null, text })
  })
  ipcMain.handle(IPC.ChatFreeAbort, (_e, id: number | null) =>
    abortFree(Number.isInteger(id as number) ? (id as number) : null)
  )
  ipcMain.handle(IPC.ChatFreeHistory, (_e, sessionId: unknown) =>
    Number.isInteger(sessionId) && (sessionId as number) > 0 ? getFreeMessages(sessionId as number) : []
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
    const stageId = currentStageId(id)
    const attempt = await runCode(id, code)
    const runId = addRun(id, code, attempt)
    const hints = plotHints(attempt.outcome.artifacts).map((h) => `${h.name}：${h.text}`)
    if (hints.length) {
      logAiUsage(id, stageId, 'plot_hint', `图表规范检查报了 ${String(hints.length)} 条：${hints.join(' / ')}`.slice(0, 600))
    }
    const record: RunRecord = {
      ...attempt.outcome,
      id: runId,
      sessionId: id,
      code,
      timedOut: attempt.timedOut,
      exitCode: attempt.exitCode,
      durationMs: attempt.durationMs,
      createdAt: Date.now()
    }
    if (hints.length) record.plotHints = hints
    const err = attempt.outcome.error
    if (err) {
      const streak = sameErrorStreak(listRuns(id), err.type)
      const guide = errorGuide(err, streak)
      if (guide) {
        record.errorStreak = streak
        // 第一次只给清单；连着第二次才升级成「发给教练」，免得每错一次就把学生推给模型
        if (streak >= ERROR_ESCALATE_STREAK) {
          logAiUsage(
            id,
            stageId,
            'error_hint',
            `同类报错（${guide.type}）连续第 ${String(streak)} 次：${err.message.slice(0, 160)}；排查方向 ${guide.checks.join('；')}`.slice(0, 600)
          )
        }
      }
    }
    return record
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
  /** 讲解只留痕不返回内容：语料在渲染层直接 import 自 shared，主进程这边只负责记「看到第几层」 */
  ipcMain.handle(IPC.ExplainShown, (_e, payload: ExplainShownPayload): boolean => {
    const sid = Number(payload?.sessionId)
    const title = String(payload?.title ?? '').trim().slice(0, 60)
    if (!Number.isInteger(sid) || sid < 1 || !title) return false
    const level = Math.max(0, Math.min(3, Number(payload?.level) || 0))
    logAiUsage(
      sid,
      currentStageId(sid),
      'explain_shown',
      `讲到第 ${String(level + 1)} 层：${title}（${payload?.kind === 'method' ? '方法卡' : '名词'}）`
    )
    return true
  })
  /** 绘图三问：读回来给 Python 面板判断闸门开不开，写进去才允许向 Executor 要代码骨架 */
  ipcMain.handle(IPC.PlotGet, (_e, sessionId: unknown, stageId: unknown): PlotAnswers | null => {
    const n = Number(stageId)
    return getPlotIntent(needSession(sessionId), Number.isInteger(n) && n >= 1 ? n : 1)
  })
  ipcMain.handle(IPC.PlotAnswer, (_e, payload: PlotAnswerPayload): PlotAnswers => {
    const sid = needSession(payload?.sessionId)
    const n = Number(payload?.stageId)
    const stageId = Number.isInteger(n) && n >= 1 ? n : currentStageId(sid)
    const clean: PlotAnswers = {}
    for (const key of ['question', 'axes', 'takeaway'] as const) {
      const v = payload?.answers?.[key]
      if (typeof v === 'string') clean[key] = v.trim().slice(0, 400)
    }
    setPlotIntent(sid, stageId, clean)
    logAiUsage(sid, stageId, 'plot_intent', `绘图三答：${plotDigest(clean)}`.slice(0, 600))
    return clean
  })
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

  ipcMain.handle(IPC.GuidedGet, (_e, payload: GuidedGetPayload): GuidedSessionState => {
    const sid = needSession(payload?.sessionId)
    const qIdx = Number.isInteger(payload?.questionIdx) ? Number(payload.questionIdx) : 1
    return getGuidedState(sid, qIdx)
  })

  ipcMain.handle(IPC.GuidedChoose, (_e, payload: GuidedChoosePayload): GuidedSessionState => {
    const sid = needSession(payload?.sessionId)
    return handleGuidedChoose(sid, payload.questionIdx, payload.step, {
      pickedKey: payload.pickedKey,
      pickedText: payload.pickedText,
      pickedMeans: payload.pickedMeans,
      userNote: payload.userNote
    })
  })

  ipcMain.handle(IPC.GuidedAskAi, (_e, payload: GuidedAskAiPayload): Promise<AiAdvice> => {
    const sid = needSession(payload?.sessionId)
    return handleGuidedAskAi(sid, payload.questionIdx, payload.step, payload.ask, payload.options)
  })

  ipcMain.handle(IPC.GuidedSync, (_e, payload: GuidedSyncPayload): { ok: boolean; message: string } => {
    const sid = needSession(payload?.sessionId)
    return handleGuidedSync(sid, payload.questionIdx)
  })

  ipcMain.handle(IPC.GuidedReanalyze, (_e, payload: GuidedReanalyzePayload): Promise<GuidedSessionState> => {
    const sid = needSession(payload?.sessionId)
    const qIdx = Number.isInteger(payload?.questionIdx) ? Number(payload.questionIdx) : 1
    return handleGuidedReanalyze(sid, qIdx)
  })

  ipcMain.handle(IPC.GuidedCategorySet, (_e, payload: GuidedCategoryPayload): GuidedSessionState => {
    const sid = needSession(payload?.sessionId)
    const qIdx = Number.isInteger(payload?.questionIdx) ? Number(payload.questionIdx) : 1
    const allowed = new Set(['auto', 'prediction', 'optimization', 'evaluation'])
    if (!allowed.has(payload?.category)) throw new Error('不支持的题型')
    return handleGuidedCategory(sid, qIdx, payload.category)
  })
}
