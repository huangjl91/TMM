import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RichText } from './RichText'
import { CoachCard, ScaffoldView } from './CoachCard'
import { HINT_LEVELS } from '@shared/stages'
import type { CoachReply, MessageKind, Scaffold } from '@shared/agent'
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
  onSend: (text: string) => void
  onAbort: () => void
  onAskHint: () => void
  onAdopt: (scaffold: Scaffold, messageId: number) => void
  onNewSession: () => void
}

export function ChatPanel({
  messages,
  streaming,
  error,
  usage,
  hintLevel,
  onSend,
  onAbort,
  onAskHint,
  onAdopt,
  onNewSession
}: Props): ReactNode {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  const submit = (): void => {
    const text = draft.trim()
    if (!text || streaming) return
    setDraft('')
    onSend(text)
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#0f1115]">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {messages.length === 0 && (
          <div className="mx-auto mt-16 max-w-lg text-center text-sm leading-6 text-white/40">
            <p className="mb-2 text-base text-white/70">把国赛真题贴进来，我们从读题开始。</p>
            <p>教练只会提问和给分级提示，正文与代码由你自己写出来。</p>
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
                <CoachCard card={m.card} />
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
            disabled={streaming || !draft.trim()}
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            发送
          </button>
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
