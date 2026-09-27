import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChatPanel, type Msg } from './components/ChatPanel'
import { CodePanel } from './components/CodePanel'
import { CompliancePanel } from './components/CompliancePanel'
import { FreeChatPanel, type FreeMsg } from './components/FreeChatPanel'
import { PaperPanel } from './components/PaperPanel'
import { SettingsModal } from './components/SettingsModal'
import { JourneyProgress, StagePanel } from './components/StagePanel'
import { TaskCard, type Injection } from './components/TaskCard'
import { WorkspacePanel } from './components/WorkspacePanel'
import { GuidedQuizPanel } from './components/GuidedQuizPanel'
import {
  extractStringField,
  parseCoachReply,
  parseScaffold,
  type Scaffold,
  type StageCard,
  type StageView
} from '@shared/agent'
import { STAGES } from '@shared/stages'
import type { SessionFileView } from '@shared/intake'
import { NO_QUESTION, type QuestionView } from '@shared/questions'
import type { MethodCard } from '@shared/methods'
import type { ExplainSource } from '@shared/explain'
import type { ProviderPreset, RuntimeInfo, SessionSummary, SettingsView, StreamEvent, TokenUsage } from '@shared/types'

/** Electron 的 IPC 错误带一层「Error invoking remote method」外壳，学生不需要看这层 */
function briefError(e: unknown): string {
  return String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

function placeholderStages(): StageView[] {
  return STAGES.map((d) => ({
    ...d,
    status: 'todo',
    hintLevel: 0,
    attempts: 0,
    score: null,
    locked: false
  }))
}

export function App(): ReactNode {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [providers, setProviders] = useState<ProviderPreset[]>([])
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<TokenUsage | null>(null)
  /** 右侧 AI 对话框自成一套状态：它和教练可以同时各跑一条流 */
  const [freeMessages, setFreeMessages] = useState<FreeMsg[]>([])
  const [freeStreaming, setFreeStreaming] = useState(false)
  const [freeError, setFreeError] = useState<string | null>(null)
  const [freeUsage, setFreeUsage] = useState<TokenUsage | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [stages, setStages] = useState<StageView[]>(placeholderStages)
  const [stageId, setStageId] = useState(1)
  const [card, setCard] = useState<StageCard | null>(null)
  const [injection, setInjection] = useState<Injection | null>(null)
  const [pinned, setPinned] = useState<string[]>([])
  const [files, setFiles] = useState<SessionFileView[]>([])
  const [intakeBusy, setIntakeBusy] = useState(false)
  const [questions, setQuestions] = useState<QuestionView[]>([])
  const [focus, setFocus] = useState(NO_QUESTION)
  const [viewMode, setViewMode] = useState<'guided' | 'coach'>('guided')
  const [coachOpen, setCoachOpen] = useState(true)
  const [activeNav, setActiveNav] = useState<'path' | 'library'>('path')
  const [assistantTab, setAssistantTab] = useState<'coach' | 'evidence' | 'resources'>('coach')

  const sessionIdRef = useRef<number | null>(null)
  sessionIdRef.current = sessionId
  const stageIdRef = useRef(1)
  stageIdRef.current = stageId
  /** 流式中的教练原始 JSON：解析完成后才变成卡片 */
  const coachRawRef = useRef('')
  const streamKindRef = useRef<string>('chat')
  /**
   * delta / reasoning / done 这些事件本身不带 kind，得靠 start 记下这一轮是谁的。
   * 教练走 JSON 解析分支，自由对话直接拼文本，两条流不能混着处理。
   */
  const activeStreamRef = useRef<'coach' | 'free'>('coach')

  /**
   * 两条流共用同一批 delta/reasoning 事件，同一时刻只能有一条在跑。
   * 界面上按钮已经按这个禁用了，但「要提示」「提交任务卡」「导入赛题」这些入口
   * 各自都能起一条教练流，所以这里再兜一层——静默失败比报错更难查。
   */
  const streamingRef = useRef(false)
  streamingRef.current = streaming
  const freeStreamingRef = useRef(false)
  freeStreamingRef.current = freeStreaming

  const currentStage = stages.find((s) => s.id === stageId) ?? null

  const loadStage = useCallback(async (sid: number, sid2?: number): Promise<void> => {
    const next = sid2 ?? (await window.api.currentStage(sid))
    stageIdRef.current = next
    setStageId(next)
    const [list, c, pins, fs, qs] = await Promise.all([
      window.api.listStages(sid),
      window.api.stageCard(sid, next),
      window.api.pinnedMethods(sid),
      window.api.listFiles(sid),
      window.api.questions(sid)
    ])
    setStages(list)
    setCard(c)
    setPinned(pins)
    setFiles(fs)
    setQuestions(qs.questions)
    setFocus(qs.focus)
  }, [])

  /**
   * 阶段推进时只在新阶段真正出现后才重读任务卡。
   * 学生正在填的字段不能被刷新冲掉，所以同阶段的状态变化一律不动 card。
   */
  const applyStageViews = useCallback(async (sid: number, list: StageView[]): Promise<void> => {
    setStages(list)
    const active = list.find((s) => s.status === 'active' || s.status === 'submitted')
    const next = active?.id
    if (next === undefined || next === stageIdRef.current) return
    stageIdRef.current = next
    setStageId(next)
    setCard(await window.api.stageCard(sid, next))
  }, [])

  const refreshSessions = async (): Promise<void> => {
    setSessions(await window.api.listSessions())
  }

  useEffect(() => {
    void (async () => {
      const [s, p, r, ss] = await Promise.all([
        window.api.getSettings(),
        window.api.listProviders(),
        window.api.runtimeInfo(),
        window.api.listSessions()
      ])
      setSettings(s)
      setProviders(p)
      setRuntime(r)
      setSessions(ss)
      if (!s.hasApiKey) setShowSettings(true)
    })().catch((e: unknown) => setError(briefError(e)))
  }, [])

  useEffect(() => {
    const patchLast = (patch: (m: Msg) => Msg): void => {
      setMessages((list) => {
        if (list.length === 0) return list
        const next = [...list]
        next[next.length - 1] = patch(next[next.length - 1] as Msg)
        return next
      })
    }

    const patchLastFree = (patch: (m: FreeMsg) => FreeMsg): void => {
      setFreeMessages((list) => {
        if (list.length === 0) return list
        const next = [...list]
        next[next.length - 1] = patch(next[next.length - 1] as FreeMsg)
        return next
      })
    }

    return window.api.onStream((e: StreamEvent) => {
      switch (e.type) {
        case 'start':
          activeStreamRef.current = e.kind === 'free' ? 'free' : 'coach'
          setSessionId(e.sessionId)
          coachRawRef.current = ''
          streamKindRef.current = e.kind
          // 首条消息才在建会话处，阶段状态得等主进程落库后才读得到
          if (sessionIdRef.current === null) void loadStage(e.sessionId)
          if (activeStreamRef.current === 'free') {
            setFreeStreaming(true)
            setFreeError(null)
            setFreeUsage(null)
            setFreeMessages((list) => [
              ...list,
              { id: e.messageId, role: 'assistant', content: '', streaming: true }
            ])
          } else {
            setStreaming(true)
            setError(null)
            setUsage(null)
            setMessages((list) => [
              ...list,
              {
                id: e.messageId,
                role: 'assistant',
                content: '',
                streaming: true,
                kind: e.kind
              }
            ])
          }
          break
        case 'delta': {
          if (activeStreamRef.current === 'free') {
            patchLastFree((m) => ({ ...m, content: m.content + e.text }))
            break
          }
          coachRawRef.current += e.text
          // 教练与示例都在流 JSON：教练只露出正在生成的那个问题，示例等定稿再显示
          if (streamKindRef.current !== 'coach') break
          const partial = extractStringField(coachRawRef.current, 'next_question')
          if (partial) patchLast((m) => ({ ...m, content: partial.value }))
          break
        }
        case 'reasoning':
          if (activeStreamRef.current === 'free') {
            patchLastFree((m) => ({ ...m, reasoning: (m.reasoning ?? '') + e.text }))
            break
          }
          patchLast((m) => ({ ...m, reasoning: (m.reasoning ?? '') + e.text }))
          break
        case 'replace':
          // 自由对话定稿时被反代写闸门换过：把已经流出去的草稿整段覆盖掉
          patchLastFree((m) => ({ ...m, content: e.text }))
          break
        case 'card':
          patchLast((m) => ({
            ...m,
            kind: 'coach',
            card: e.card,
            content: ''
          }))
          break
        case 'scaffold':
          patchLast((m) => ({
            ...m,
            kind: 'scaffold',
            scaffold: e.scaffold,
            content: ''
          }))
          break
        case 'stages':
          if (e.sessionId === sessionIdRef.current) void applyStageViews(e.sessionId, e.stages)
          break
        case 'done':
          if (activeStreamRef.current === 'free') {
            setFreeStreaming(false)
            setFreeUsage(e.usage)
            patchLastFree((m) => ({ ...m, streaming: false }))
            void refreshSessions()
            break
          }
          setStreaming(false)
          setUsage(e.usage)
          streamKindRef.current = 'chat'
          patchLast((m) => ({ ...m, streaming: false }))
          void refreshSessions()
          break
        case 'aborted':
          if (activeStreamRef.current === 'free') {
            setFreeStreaming(false)
            patchLastFree((m) => ({ ...m, streaming: false }))
            break
          }
          setStreaming(false)
          streamKindRef.current = 'chat'
          patchLast((m) => ({ ...m, streaming: false }))
          break
        case 'error':
          if (activeStreamRef.current === 'free') {
            setFreeStreaming(false)
            setFreeError(e.message)
            setFreeMessages((list) => list.map((m) => ({ ...m, streaming: false })))
            break
          }
          setStreaming(false)
          streamKindRef.current = 'chat'
          setError(e.message)
          setMessages((list) =>
            list.length > 0 && list[list.length - 1]?.content === ''
              ? list.slice(0, -1)
              : list.map((m) => ({ ...m, streaming: false }))
          )
          break
      }
    })
  }, [applyStageViews, loadStage])

  useEffect(() => {
    return window.api.onRuntimeUpdated(() => {
      window.api
        .runtimeInfo()
        .then(setRuntime)
        .catch(() => undefined)
    })
  }, [])

  const openSession = async (id: number): Promise<void> => {
    const [stored, free] = await Promise.all([window.api.getSession(id), window.api.freeHistory(id)])
    setSessionId(id)
    setMessages(
      stored
        // 自由问答属于右侧那一栏，不能混进中间的教练对话
        .filter((m) => m.content.trim().length > 0 && m.kind !== 'free')
        .map((m): Msg => {
          const role = m.role === 'user' ? 'user' : 'assistant'
          const kind = m.kind ?? 'chat'
          if (kind === 'coach') {
            const c = parseCoachReply(m.content)
            if (c) return { id: m.id, role, content: '', kind, card: c }
          }
          if (kind === 'scaffold') {
            const s = parseScaffold(m.content)
            if (s) return { id: m.id, role, content: '', kind, scaffold: s }
          }
          return {
            id: m.id,
            role,
            content: m.content,
            reasoning: m.reasoning,
            kind
          }
        })
    )
    setFreeMessages(
      free
        .filter((m) => m.content.trim().length > 0)
        .map((m): FreeMsg => {
          const role = m.role === 'user' ? 'user' : 'assistant'
          return {
            id: m.id,
            role,
            content: m.content,
            ...(m.reasoning ? { reasoning: m.reasoning } : {})
          }
        })
    )
    setError(null)
    setUsage(null)
    setFreeError(null)
    setFreeUsage(null)
    await loadStage(id)
  }

  const newSession = (): void => {
    if (streaming) return
    setSessionId(null)
    setMessages([])
    setError(null)
    setUsage(null)
    setFreeMessages([])
    setFreeError(null)
    setFreeUsage(null)
    setCard(null)
    setInjection(null)
    setStages(placeholderStages())
    setPinned([])
    stageIdRef.current = 1
    setStageId(1)
    setFiles([])
    setIntakeBusy(false)
    setQuestions([])
    setFocus(NO_QUESTION)
  }

  const onSend = useCallback(
    (text: string, quizLog?: string): void => {
      if (freeStreamingRef.current) {
        setError('右侧 AI 对话框还在回答，等它说完再发')
        return
      }
      setMessages((list) => [...list, { id: -Date.now(), role: 'user', content: text }])
      window.api
        .send({ sessionId: sessionIdRef.current, text, ...(quizLog ? { quizLog } : {}) })
        .catch((e: unknown) => {
          setStreaming(false)
          setError(briefError(e))
        })
    },
    [sessionIdRef]
  )

  /**
   * 右侧 AI 对话框：与教练走同一条会话，但消息落成 kind='free'，
   * 所以历史、上下文、合规留痕都能按这同一个会话归拢，界面却互不干扰。
   */
  const onSendFree = useCallback((text: string): void => {
    if (streamingRef.current) {
      setFreeError('教练那边还在回答，等它说完再发')
      return
    }
    setFreeMessages((list) => [...list, { id: -Date.now(), role: 'user', content: text }])
    window.api.sendFree({ sessionId: sessionIdRef.current, text }).catch((e: unknown) => {
      setFreeStreaming(false)
      setFreeError(briefError(e))
    })
  }, [])

  const onAbortFree = useCallback((): void => {
    void window.api.abortFree(sessionIdRef.current)
  }, [])

  /**
   * 讲解只走本地语料（shared/explain.ts），展开一层就记一条 explain_shown：
   * 《AI 工具使用详情》要能说明语料给到过哪一层。没建会话时不记，避免悬空动作。
   */
  const onExplain = useCallback((src: ExplainSource, level: number): void => {
    const sid = sessionIdRef.current
    if (!sid) return
    void window.api.explainShown({ sessionId: sid, ref: src.ref, title: src.title, kind: src.kind, level })
  }, [sessionIdRef])

  const onOpenStage = useCallback(async (id: number): Promise<void> => {
    const sid = sessionIdRef.current
    if (!sid) {
      stageIdRef.current = id
      setStageId(id)
      return
    }
    const r = await window.api.openStage(sid, id)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    stageIdRef.current = id
    setStageId(id)
    const [list, c] = await Promise.all([window.api.listStages(sid), window.api.stageCard(sid, id)])
    setStages(list)
    setCard(c)
  }, [])

  const onSubmitCard = useCallback(async (values: Record<string, string>): Promise<void> => {
    const sid = sessionIdRef.current
    if (!sid) {
      setError('先把题目贴进对话建立会话，任务卡才有地方存')
      return
    }
    if (freeStreamingRef.current) {
      setError('右侧 AI 对话框还在回答，等它说完再提交任务卡')
      return
    }
    const ask = '本阶段任务卡我已经填好提交了，请对照评分点逐条检查，然后只问我一个问题。'
    try {
      const [list, qs] = await Promise.all([
        window.api.submitStage({
          sessionId: sid,
          stageId: stageIdRef.current,
          values
        }),
        // 阶段 1 的「逐问拆解」就是问题清单的来源，提交完必须重读一次
        window.api.questions(sid)
      ])
      setStages(list)
      setQuestions(qs.questions)
      setFocus(qs.focus)
    } catch (e) {
      setError(briefError(e))
      return
    }
    setMessages((list) => [...list, { id: -Date.now(), role: 'user', content: ask }])
    window.api.send({ sessionId: sid, text: ask }).catch((e: unknown) => {
      setStreaming(false)
      setError(briefError(e))
    })
  }, [])

  const onAskHint = useCallback((): void => {
    const sid = sessionIdRef.current
    if (!sid) {
      setError('先描述题目建立会话，提示要知道你在哪个阶段')
      return
    }
    if (freeStreamingRef.current) {
      setError('右侧 AI 对话框还在回答，等它说完再要提示')
      return
    }
    window.api.askHint(sid).catch((e: unknown) => {
      setStreaming(false)
      setError(briefError(e))
    })
  }, [])

  const onAdopt = useCallback(async (scaffold: Scaffold, messageId: number): Promise<void> => {
    const sid = sessionIdRef.current
    if (!sid) return
    const stageId = stageIdRef.current
    try {
      await window.api.adoptScaffold({
        sessionId: sid,
        stageId,
        messageId,
        kind: scaffold.kind,
        fieldKey: scaffold.fieldKey ?? null,
        content: scaffold.content
      })
      setInjection({
        target: scaffold.kind === 'code' ? 'code' : 'field',
        fieldKey: scaffold.fieldKey,
        content: scaffold.content,
        seq: Date.now()
      })
      if (scaffold.kind === 'text') setCard(await window.api.stageCard(sid, stageId))
    } catch (e) {
      setError(briefError(e))
    }
  }, [])

  /** 导入即开问：学生不用先打字，教练拿到题面清单就主动起第一个问题 */
  const onIntake = useCallback(async (): Promise<void> => {
    if (freeStreamingRef.current) {
      setError('右侧 AI 对话框还在回答，等它说完再导入赛题')
      return
    }
    setIntakeBusy(true)
    setError(null)
    try {
      const r = await window.api.intake()
      if (!r) return
      setSessionId(r.sessionId)
      sessionIdRef.current = r.sessionId
      setMessages([])
      setFreeMessages([])
      setFreeError(null)
      setFreeUsage(null)
      setCard(null)
      setInjection(null)
      setUsage(null)
      setFiles(r.files)
      await refreshSessions()
      await loadStage(r.sessionId, 1)
      if (r.problemWarning) setError(r.problemWarning)
      const text = r.problemWarning
        ? '赛题文件已经导入，但题面文字我还需要手动补充。请先问我一个读题层面的问题。'
        : '赛题和附件已经导入好了，请对照题面开始，一次只问我一个问题。'
      setMessages((list) => [...list, { id: -Date.now(), role: 'user', content: text }])
      try {
        await window.api.send({ sessionId: r.sessionId, text })
      } catch (sendErr) {
        console.warn('Initial coach greeting omitted (offline or key not configured):', sendErr)
      }
    } catch (e) {
      setError(briefError(e))
    } finally {
      setIntakeBusy(false)
    }
  }, [loadStage])

  /** 切聚焦问题不重载任务卡：逐问的框本来就全铺开了，这里只改教练下一步围着谁问 */
  const onFocusQuestion = useCallback(async (idx: number): Promise<void> => {
    setFocus(idx)
    const sid = sessionIdRef.current
    if (sid) await window.api.setQuestion(sid, idx)
  }, [])

  const onPinMethod = useCallback(async (m: MethodCard, on: boolean): Promise<void> => {
    const sid = sessionIdRef.current
    if (!sid) {
      setError('先把题目贴进对话建立会话，候选方法才有地方存')
      return
    }
    try {
      setPinned(await window.api.pinMethod(sid, m.id, on))
    } catch (e) {
      setError(briefError(e))
    }
  }, [])

  const hintLevel = currentStage?.hintLevel ?? 0

  return (
    <div className="tmm-light flex h-screen flex-col">
      <header className="tmm-header">
        <div className="tmm-wordmark"><img src="./icon.png" alt="" /><strong>TMM</strong><span>数学建模学习教练</span></div>
        <div className="tmm-header-actions">
          <span className="tmm-model-state">{settings ? `${settings.providerId} · ${settings.model}` : '加载中'}</span>
          <span className="tmm-principle">引导思考 · 保留证据 · 不代写</span>
          <button onClick={() => setShowSettings(true)}>设置</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <StagePanel
          stages={stages}
          currentId={stageId}
          onOpen={(id) => void onOpenStage(id)}
          activeNav={activeNav}
          onNavigate={(key) => {
            setActiveNav(key)
            if (key === 'path') setViewMode('guided')
            if (key === 'library') { setAssistantTab('resources'); setCoachOpen(true) }
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <JourneyProgress stages={stages} currentId={stageId} onOpen={(id) => void onOpenStage(id)} />
          <div className="tmm-viewbar">
            <div className="tmm-viewtabs">
              <button
                onClick={() => { setViewMode('guided'); setActiveNav('path') }}
                className={viewMode === 'guided' ? 'is-active' : ''}
              >
                引导学习
              </button>
              <button
                onClick={() => { setViewMode('coach'); setActiveNav('path') }}
                className={viewMode === 'coach' ? 'is-active' : ''}
              >
                自由探究
              </button>
            </div>
            <span>{viewMode === 'guided' ? '一次只完成一个判断，需要时再展开依据' : '围绕当前阶段讨论并完成任务卡'}</span>
          </div>
          <main className="tmm-main">
          {viewMode === 'guided' ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <GuidedQuizPanel
                sessionId={sessionId}
                questions={questions}
                files={files}
                activeQuestionIdx={focus > 0 ? focus : 1}
                onSelectQuestion={(idx) => {
                  void onFocusQuestion(idx)
                }}
                onIntake={() => void onIntake()}
                intakeBusy={intakeBusy}
                onSendToSandbox={(code) => {
                  setInjection({
                    target: 'code',
                    content: code,
                    seq: Date.now()
                  })
                }}
              />
            </div>
          ) : (
            <div className="tmm-coach-flow">
              <ChatPanel
                messages={messages}
                streaming={streaming}
                error={error}
                usage={usage}
                hintLevel={hintLevel}
                intakeBusy={intakeBusy}
                busyElsewhere={freeStreaming}
                onSend={onSend}
                onExplain={onExplain}
                onAbort={() => window.api.abort(sessionIdRef.current)}
                onAskHint={onAskHint}
                onAdopt={(s, mid) => void onAdopt(s, mid)}
                onNewSession={newSession}
                onIntake={() => void onIntake()}
              />
              <TaskCard
                stage={currentStage}
                card={card}
                streaming={streaming}
                injection={injection}
                questions={questions}
                focus={focus}
                onFocus={(idx) => void onFocusQuestion(idx)}
                onSubmit={(values) => void onSubmitCard(values)}
              />
              <CodePanel
                sessionId={sessionId}
                stageId={stageId}
                onSend={onSend}
                injection={injection}
                onAdoptSession={(id) => {
                  if (sessionIdRef.current !== null) return
                  setSessionId(id)
                  void loadStage(id)
                }}
              />
              <PaperPanel sessionId={sessionId} />
              <CompliancePanel sessionId={sessionId} stageId={stageId} />
            </div>
          )}
          </main>
        </div>
        <aside className={`tmm-assistant ${coachOpen ? '' : 'is-collapsed'}`}>
          <div className="tmm-assistant-head">
            {coachOpen ? <div className="tmm-assistant-tabs">
              <button onClick={() => setAssistantTab('coach')} className={assistantTab === 'coach' ? 'is-active' : ''}>AI 教练</button>
              <button onClick={() => setAssistantTab('evidence')} className={assistantTab === 'evidence' ? 'is-active' : ''}>证据</button>
              <button onClick={() => setAssistantTab('resources')} className={assistantTab === 'resources' ? 'is-active' : ''}>资料</button>
            </div> : null}
            <button onClick={() => setCoachOpen((value) => !value)} title={coachOpen ? '收起教练' : '展开教练'}>{coachOpen ? '»' : '«'}</button>
          </div>
          {coachOpen ? <>
          {assistantTab === 'coach' ? <FreeChatPanel
            messages={freeMessages}
            streaming={freeStreaming}
            error={freeError}
            usage={freeUsage}
            hasApiKey={settings?.hasApiKey === true}
            busyElsewhere={streaming}
            onSend={onSendFree}
            onAbort={onAbortFree}
            onOpenSettings={() => setShowSettings(true)}
          /> : assistantTab === 'evidence' ? <div className="tmm-evidence-panel">
            <div className="tmm-evidence-intro">
              <strong>当前证据链</strong>
              <span>所有结论都应能回到来源和运行结果。</span>
            </div>
            <div className="tmm-evidence-kinds">
              <div><b>来源材料</b><span>{files.length > 0 ? `${files.length} 个附件` : '等待导入题面与数据'}</span></div>
              <div><b>建模决策</b><span>{sessionId ? `正在记录第 ${stageId} 阶段` : '建立会话后开始记录'}</span></div>
              <div><b>运行证据</b><span>代码、图表和指标将在运行后出现</span></div>
            </div>
            {files.length === 0 ? <button className="tmm-evidence-import" onClick={() => void onIntake()} disabled={intakeBusy}>{intakeBusy ? '正在解析…' : '导入题目与附件'}</button> : null}
          </div> : <div className="tmm-resources-panel">
            <div className="tmm-evidence-intro">
              <strong>项目资料</strong>
              <span>查看附件、收藏的方法和历史会话。</span>
            </div>
            <WorkspacePanel
            sessions={sessions}
            activeId={sessionId}
            stageId={stageId}
            runtime={runtime}
            pinned={pinned}
            files={files}
            onSelect={(id) => void openSession(id)}
            onNew={newSession}
            onPin={(m, on) => void onPinMethod(m, on)}
            onExplain={onExplain}
          /></div>}
          </> : null}
        </aside>
      </div>

      {showSettings && settings ? (
        <SettingsModal
          settings={settings}
          providers={providers}
          runtime={runtime}
          onClose={() => setShowSettings(false)}
          onChanged={setSettings}
        />
      ) : null}
    </div>
  )
}
