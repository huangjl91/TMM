import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChatPanel, type Msg } from './components/ChatPanel'
import { CodePanel } from './components/CodePanel'
import { CompliancePanel } from './components/CompliancePanel'
import { PaperPanel } from './components/PaperPanel'
import { SettingsModal } from './components/SettingsModal'
import { StagePanel } from './components/StagePanel'
import { TaskCard, type Injection } from './components/TaskCard'
import { WorkspacePanel } from './components/WorkspacePanel'
import {
  extractStringField,
  parseCoachReply,
  parseScaffold,
  type Scaffold,
  type StageCard,
  type StageView
} from '@shared/agent'
import { STAGES } from '@shared/stages'
import type { MethodCard } from '@shared/methods'
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
  const [showSettings, setShowSettings] = useState(false)
  const [stages, setStages] = useState<StageView[]>(placeholderStages)
  const [stageId, setStageId] = useState(1)
  const [card, setCard] = useState<StageCard | null>(null)
  const [injection, setInjection] = useState<Injection | null>(null)
  const [pinned, setPinned] = useState<string[]>([])

  const sessionIdRef = useRef<number | null>(null)
  sessionIdRef.current = sessionId
  const stageIdRef = useRef(1)
  stageIdRef.current = stageId
  /** 流式中的教练原始 JSON：解析完成后才变成卡片 */
  const coachRawRef = useRef('')
  const streamKindRef = useRef<string>('chat')

  const currentStage = stages.find((s) => s.id === stageId) ?? null

  const loadStage = useCallback(async (sid: number, sid2?: number): Promise<void> => {
    const next = sid2 ?? (await window.api.currentStage(sid))
    stageIdRef.current = next
    setStageId(next)
    const [list, c, pins] = await Promise.all([
      window.api.listStages(sid),
      window.api.stageCard(sid, next),
      window.api.pinnedMethods(sid)
    ])
    setStages(list)
    setCard(c)
    setPinned(pins)
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

    return window.api.onStream((e: StreamEvent) => {
      switch (e.type) {
        case 'start':
          setSessionId(e.sessionId)
          setStreaming(true)
          setError(null)
          setUsage(null)
          coachRawRef.current = ''
          streamKindRef.current = e.kind
          // 首条消息才在建会话处，阶段状态得等主进程落库后才读得到
          if (sessionIdRef.current === null) void loadStage(e.sessionId)
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
          break
        case 'delta': {
          coachRawRef.current += e.text
          // 教练与示例都在流 JSON：教练只露出正在生成的那个问题，示例等定稿再显示
          if (streamKindRef.current !== 'coach') break
          const partial = extractStringField(coachRawRef.current, 'next_question')
          if (partial) patchLast((m) => ({ ...m, content: partial.value }))
          break
        }
        case 'reasoning':
          patchLast((m) => ({ ...m, reasoning: (m.reasoning ?? '') + e.text }))
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
          setStreaming(false)
          setUsage(e.usage)
          streamKindRef.current = 'chat'
          patchLast((m) => ({ ...m, streaming: false }))
          void refreshSessions()
          break
        case 'aborted':
          setStreaming(false)
          streamKindRef.current = 'chat'
          patchLast((m) => ({ ...m, streaming: false }))
          break
        case 'error':
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
    const stored = await window.api.getSession(id)
    setSessionId(id)
    setMessages(
      stored
        .filter((m) => m.content.trim().length > 0)
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
    setError(null)
    setUsage(null)
    await loadStage(id)
  }

  const newSession = (): void => {
    if (streaming) return
    setSessionId(null)
    setMessages([])
    setError(null)
    setUsage(null)
    setCard(null)
    setInjection(null)
    setStages(placeholderStages())
    setPinned([])
    stageIdRef.current = 1
    setStageId(1)
  }

  const onSend = useCallback(
    (text: string): void => {
      setMessages((list) => [...list, { id: -Date.now(), role: 'user', content: text }])
      window.api.send({ sessionId: sessionIdRef.current, text }).catch((e: unknown) => {
        setStreaming(false)
        setError(briefError(e))
      })
    },
    [sessionIdRef]
  )

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
    const ask = '本阶段任务卡我已经填好提交了，请对照评分点逐条检查，然后只问我一个问题。'
    try {
      setStages(
        await window.api.submitStage({
          sessionId: sid,
          stageId: stageIdRef.current,
          values
        })
      )
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
    <div className="flex h-screen flex-col bg-[#0f1115] text-white/90">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#12141a] px-4 py-2.5">
        <img src="./icon.png" alt="" className="h-6 w-6 shrink-0 rounded" />
        <span className="text-sm font-semibold">数学建模教练</span>
        <span className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-white/50">
          {settings ? `${settings.providerId} · ${settings.model}` : '加载中'}
        </span>
        <span className="text-[11px] text-white/30">引导式 · 教练不代写</span>
        <button
          onClick={() => setShowSettings(true)}
          className="ml-auto rounded-lg border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/5"
        >
          设置
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <StagePanel stages={stages} currentId={stageId} onOpen={(id) => void onOpenStage(id)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatPanel
            messages={messages}
            streaming={streaming}
            error={error}
            usage={usage}
            hintLevel={hintLevel}
            onSend={onSend}
            onAbort={() => window.api.abort(sessionIdRef.current)}
            onAskHint={onAskHint}
            onAdopt={(s, mid) => void onAdopt(s, mid)}
            onNewSession={newSession}
          />
          <TaskCard
            stage={currentStage}
            card={card}
            streaming={streaming}
            injection={injection}
            onSubmit={(values) => void onSubmitCard(values)}
          />
          <CodePanel
            sessionId={sessionId}
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
        <WorkspacePanel
          sessions={sessions}
          activeId={sessionId}
          stageId={stageId}
          runtime={runtime}
          pinned={pinned}
          onSelect={(id) => void openSession(id)}
          onNew={newSession}
          onPin={(m, on) => void onPinMethod(m, on)}
        />
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
