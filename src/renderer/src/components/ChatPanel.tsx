import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RichText } from './RichText'
import { CoachCard, ScaffoldView } from './CoachCard'
import { HINT_LEVELS } from '@shared/stages'
import type { CoachReply, MessageKind, Scaffold } from '@shared/agent'
import type { ExplainSource } from '@shared/explain'
import type { TokenUsage } from '@shared/types'

export interface Msg {
  id: number
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  streaming?: boolean
  kind?: MessageKind
  card?: CoachReply | null
  scaffold?: Scaffold | null
}

interface Props {
  messages: Msg[]
  streaming: boolean
  error: string | null
  usage: TokenUsage | null
  hintLevel: number
  intakeBusy: boolean
  /**
   * 另一条链路（右侧 AI 对话框）正在流式输出。
   * delta 事件本身不带归属，两条流同时跑会串台，所以同一时刻只放行一条。
   */
  busyElsewhere?: boolean
  onSend: (text: string, quizLog?: string) => void
  onExplain: (src: ExplainSource, level: number) => void
  onAbort: () => void
  onAskHint: () => void
  onAdopt: (scaffold: Scaffold, messageId: number) => void
  onNewSession: () => void
  onIntake: () => void
}

export function ChatPanel({
  messages,
  streaming,
  error,
  usage,
  hintLevel,
  intakeBusy,
  busyElsewhere = false,
  onSend,
  onExplain,
  onAbort,
  onAskHint,
  onAdopt,
  onNewSession,
  onIntake
}: Props): ReactNode {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  const submit = (): void => {
    const text = draft.trim()
    if (!text || streaming || busyElsewhere) return
    setDraft('')
    onSend(text)
  }

  return (
    <section className={`flex min-w-0 flex-col bg-[#0f1115] ${messages.length > 0 ? 'min-h-72 flex-1' : 'shrink-0'}`}>
      <div className={`${messages.length > 0 ? 'flex-1' : ''} space-y-4 overflow-y-auto px-5 py-4`}>
        {messages.length === 0 && (
          <div className="mx-auto max-w-lg text-center">
            <p className="mb-1 text-base text-white/70">从导入赛题开始</p>
            <p className="mb-4 text-sm leading-6 text-white/40">
              选题目 PDF 和附件目录，教练会拿着题面与数据清单逐问问你。正文和代码仍然由你自己写。
            </p>
            <button
              onClick={onIntake}
              disabled={intakeBusy}
              className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {intakeBusy ? '导入中…（PDF 提取要几秒）' : '导入赛题与附件'}
            </button>
            <p className="mt-4 text-[11px] leading-5 text-white/25">
              没有电子题面也可以直接把题目贴进下面的输入框，从读题开始。
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
            <div
              className={
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ' +
                (m.role === 'user'
                  ? 'bg-sky-600/25 text-sky-50'
                  : 'border border-white/10 bg-white/[0.04] text-white/85')
              }
            >
              {m.reasoning ? (
                <details className="mb-2 text-[11px] text-white/40">
                  <summary className="cursor-pointer select-none">思维链 {m.reasoning.length} 字</summary>
                  <div className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap border-l border-white/10 pl-2">
                    {m.reasoning}
                  </div>
                </details>
              ) : null}
              {m.card ? (
                <CoachCard
                  card={m.card}
                  disabled={streaming}
                  onQuizAnswer={(t, log) => onSend(t, log)}
                  onExplain={onExplain}
                />
              ) : m.scaffold ? (
                <ScaffoldView scaffold={m.scaffold} onAdopt={(s) => onAdopt(s, m.id)} />
              ) : m.content ? (
                <RichText text={m.content} />
              ) : m.streaming ? (
                <span className="inline-block h-4 w-1.5 animate-pulse bg-white/60" />
              ) : null}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="mx-6 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <div className="border-t border-white/10 px-6 py-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={3}
          placeholder="描述你的题目或当前产出，Enter 发送，Shift+Enter 换行"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/25 focus:border-sky-500/50"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={submit}
            disabled={streaming || busyElsewhere || !draft.trim()}
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            发送
          </button>
          {busyElsewhere && !streaming ? (
            <span className="text-[11px] text-white/35">右侧 AI 对话框正在回答，等它说完再发</span>
          ) : null}
          {streaming ? (
            <button
              onClick={onAbort}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70"
            >
              停止
            </button>
          ) : (
            <>
              <button
                onClick={onAskHint}
                title="卡住了就升级提示强度，每次升级都会记进 AI 使用详情"
                className="rounded-lg border border-sky-500/40 px-3 py-1.5 text-sm text-sky-200/90 hover:bg-sky-500/10"
              >
                要提示 · L{hintLevel} {HINT_LEVELS[hintLevel]}
              </button>
              <button
                onClick={onIntake}
                disabled={intakeBusy}
                title="补充导入题目或附件数据，文件会落进本会话的工作区"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 disabled:opacity-40"
              >
                {intakeBusy ? '导入中…' : '导入赛题/附件'}
              </button>
              <button
                onClick={onNewSession}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70"
              >
                新会话
              </button>
            </>
          )}
          {usage ? (
            <span className="ml-auto text-[11px] text-white/35">
              tokens 输入 {usage.input} / 输出 {usage.output}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}
