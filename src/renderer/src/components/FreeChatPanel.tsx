import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RichText } from './RichText'
import type { TokenUsage } from '@shared/types'

export interface FreeMsg {
  id: number
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  streaming?: boolean
}

interface Props {
  messages: FreeMsg[]
  streaming: boolean
  error: string | null
  usage: TokenUsage | null
  hasApiKey: boolean
  /** 中间的教练正在流式输出：delta 事件不带归属，两条流同时跑会串台，一次只放行一条 */
  busyElsewhere?: boolean
  onSend: (text: string) => void
  onAbort: () => void
  onOpenSettings: () => void
}

/**
 * 右侧的 AI 对话框：和中间的教练是两条链路。
 * 这一栏可以直接回答，不按竞赛阶段走；但成稿仍会被主进程的反代写闸门拦下并替换，
 * 所以这里不需要再做一层内容审查——渲染层只负责把事件如实显示出来。
 */
export function FreeChatPanel({
  messages,
  streaming,
  error,
  usage,
  hasApiKey,
  busyElsewhere = false,
  onSend,
  onAbort,
  onOpenSettings
}: Props): ReactNode {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  const canSend = hasApiKey && !streaming && !busyElsewhere

  const submit = (): void => {
    const text = draft.trim()
    if (!text || !canSend) return
    setDraft('')
    onSend(text)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#0f1115]">
      <div className="flex shrink-0 items-baseline justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-white/60">AI 对话框</span>
        <span className="text-[10px] text-white/30">
          {usage ? `tokens 入 ${usage.input} / 出 ${usage.output}` : '直接问，随时'}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!hasApiKey ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-3 py-3">
            <p className="text-[13px] text-amber-100/90">还没有配 API Key，这一栏连不上模型。</p>
            <p className="mt-1 text-[11px] leading-5 text-white/45">
              Key 只存进本机系统钥匙串，不写明文、不同步、不会出现在导出的合规 PDF 里。
            </p>
            <button
              onClick={onOpenSettings}
              className="mt-2.5 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-black/80"
            >
              去设置里填
            </button>
          </div>
        ) : null}

        {messages.length === 0 && hasApiKey ? (
          <div className="mt-6 px-1">
            <p className="text-[13px] text-white/60">问我点什么都行。</p>
            <p className="mt-1.5 text-[11px] leading-5 text-white/35">
              解释概念、比较方法、看报错、捋思路都可以。唯一的例外是成稿——
              要直接粘进论文的段落会被拦下，那部分仍然得你自己写。
            </p>
          </div>
        ) : null}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-sky-600/25 px-3 py-2 text-[13px] text-sky-50">
                <RichText text={m.content} />
              </div>
            </div>
          ) : (
            <div key={m.id} className="rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3 py-2">
              {m.reasoning ? (
                <details className="mb-2 text-[11px] text-white/40">
                  <summary className="cursor-pointer select-none">思维链 {m.reasoning.length} 字</summary>
                  <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap border-l border-white/10 pl-2">
                    {m.reasoning}
                  </div>
                </details>
              ) : null}
              {m.content ? (
                <div className="text-[13px] text-white/85">
                  <RichText text={m.content} />
                </div>
              ) : m.streaming ? (
                <span className="inline-block h-3.5 w-1.5 animate-pulse bg-white/60" />
              ) : null}
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="mx-4 mb-2 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-red-200">
          {error}
        </div>
      ) : null}

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
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
          disabled={!hasApiKey}
          placeholder={
            !hasApiKey ? '先在设置里填 API Key' : busyElsewhere ? '等教练那边说完…' : 'Enter 发送，Shift+Enter 换行'
          }
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[13px] outline-none placeholder:text-white/25 focus:border-sky-500/50 disabled:opacity-50"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={submit}
            disabled={!canSend || !draft.trim()}
            className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
          >
            发送
          </button>
          {streaming ? (
            <button
              onClick={onAbort}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-[13px] text-white/70"
            >
              停止
            </button>
          ) : busyElsewhere ? (
            <span className="text-[11px] text-white/35">教练正在回答，等它说完再发</span>
          ) : null}
        </div>
      </div>
    </section>
  )
}
