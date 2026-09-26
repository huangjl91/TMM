import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ArtifactContent, ArtifactInfo, RunRecord } from '@shared/sandbox'
import {
  CODE_SKELETON,
  ERROR_ESCALATE_STREAK,
  PLOT_ANSWER_MIN,
  PLOT_QUESTIONS,
  PLOT_STAGES,
  errorAsksText,
  errorGuide,
  plotGate,
  unanswered,
  type PlotAnswers
} from '@shared/plots'
import type { Injection } from './TaskCard'

interface Props {
  sessionId: number | null
  /** 阶段 6/8 才有绘图三问闸门：那两段最容易「先画了再说」 */
  stageId: number
  /** 报错导读里学生署名发给教练，走同一条对话通道 */
  onSend: (text: string) => void
  /** 第一次运行会隐式建会话，把 id 交回上层，后续对话和代码才在同一会话里 */
  onAdoptSession: (id: number) => void
  /** 采纳代码示例时由上层把内容送进来 */
  injection: Injection | null
}

export function CodePanel({
  sessionId,
  stageId,
  onSend,
  onAdoptSession,
  injection
}: Props): ReactNode {
  const [code, setCode] = useState(CODE_SKELETON)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const [intent, setIntent] = useState<PlotAnswers | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const plotting = PLOT_STAGES.includes(stageId)
  const missing = plotGate(intent, code, stageId)

  useEffect(() => {
    if (!injection || injection.target !== 'code') return
    setCode(injection.content)
    setOpen(true)
  }, [injection])

  useEffect(() => {
    if (!sessionId || !plotting) {
      setIntent(null)
      setAskOpen(false)
      return
    }
    setAskOpen(true)
    window.api
      .plotIntent(sessionId, stageId)
      .then((v) => setIntent(v))
      .catch((e: unknown) => setErr((e as Error).message))
  }, [sessionId, stageId, plotting])

  useEffect(() => {
    if (!sessionId) {
      setRuns([])
      return
    }
    window.api
      .listRuns(sessionId)
      .then(setRuns)
      .catch((e: unknown) => setErr((e as Error).message))
  }, [sessionId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [runs, busy])

  const execute = async (): Promise<void> => {
    if (busy || !code.trim()) return
    // 还停在骨架上就先问三问：这三行注释是给学生自己填的，不是待运行的示例代码
    if (plotting && missing.length) {
      setAskOpen(true)
      setOpen(true)
      setErr('先答完上面这三问再运行。画什么、轴是什么、读者该看出什么——答完之前不会去要代码骨架。')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const rec = await window.api.runCode({ sessionId, code })
      onAdoptSession(rec.sessionId)
      setRuns((list) => [...list, rec])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const answer = async (answers: PlotAnswers): Promise<void> => {
    if (!sessionId) {
      setErr('还没有会话：先在左侧对话框发一句话或导入赛题，这三答才有地方存。')
      return
    }
    try {
      setIntent(await window.api.answerPlot({ sessionId, stageId, answers }))
      setAskOpen(false)
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <section className="shrink-0 border-t border-white/10 bg-[#12141a]">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-white/45 hover:text-white/70"
        >
          {open ? '▾' : '▸'} Python 沙箱
        </button>
        <span className="text-[11px] text-white/30">内存 2 GB · 墙钟 60 秒 · 无网络</span>
        {plotting && !askOpen ? (
          <button onClick={() => setAskOpen(true)} className="text-[11px] text-violet-300/80 hover:text-violet-200">
            {missing.length ? '补答绘图三问' : '改绘图三答'}
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {busy ? (
            <button
              onClick={() => sessionId && void window.api.stopRun(sessionId)}
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/70"
            >
              停止
            </button>
          ) : null}
          <button
            onClick={() => void execute()}
            disabled={busy || !code.trim()}
            className="rounded-lg bg-emerald-700 px-4 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {busy ? '运行中…' : '运行  ⌃⏎'}
          </button>
        </div>
      </div>

      {plotting && askOpen ? <PlotAsk intent={intent} onAnswer={(a) => void answer(a)} /> : null}

      {open ? (
        <div className="grid h-64 grid-cols-2 gap-3 px-4 pb-3">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void execute()
              }
            }}
            spellCheck={false}
            className="h-full w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[12px] leading-5 outline-none focus:border-emerald-500/50"
          />
          <div className="h-full overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-3">
            {err ? <p className="mb-2 text-xs text-red-300">{err}</p> : null}
            {runs.length === 0 && !busy ? (
              <p className="text-[11px] text-white/30">
                运行后这里显示输出、报错与生成的图表。跑之前先想清楚：这段代码要回答哪个问题？
              </p>
            ) : null}
            {runs.map((r) => (
              <RunView key={r.id} run={r} sessionId={sessionId} onSend={onSend} />
            ))}
            {busy ? <p className="text-[11px] text-white/40">正在执行…</p> : null}
            <div ref={endRef} />
          </div>
        </div>
      ) : null}
    </section>
  )
}

function RunView({
  run,
  sessionId,
  onSend
}: {
  run: RunRecord
  sessionId: number | null
  onSend: (text: string) => void
}): ReactNode {
  const lines = run.stdout.split('\n')
  const head = lines.slice(0, 40).join('\n')
  const rest = lines.length - 40
  const e = run.error
  const guide = errorGuide(e, run.errorStreak ?? 1)
  const escalated = (run.errorStreak ?? 1) >= ERROR_ESCALATE_STREAK
  return (
    <div
      className={
        'mb-3 border-l-2 pl-2 text-[11px] ' + (run.ok ? 'border-emerald-500/40' : 'border-red-500/50')
      }
    >
      <div className="flex flex-wrap items-baseline gap-2 text-white/40">
        <span>{new Date(run.createdAt).toLocaleTimeString('zh-CN')}</span>
        <span>{run.durationMs} ms</span>
        <span>{run.artifacts.length} 个产物</span>
        {run.limits.error ? <span className="text-amber-300/80">{run.limits.error}</span> : null}
      </div>
      {head.trim() ? (
        <pre className="mt-1 whitespace-pre-wrap text-white/80">
          {head}
          {rest > 0 ? `\n…还有 ${String(rest)} 行` : ''}
        </pre>
      ) : null}
      {e ? (
        <>
          <pre className="mt-1 whitespace-pre-wrap text-red-300">
            {e.type}: {e.message}
          </pre>
          {guide ? (
            <div className="mt-1 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-2 text-amber-100/80">
              <div className="text-[11px]">
                这条报错是说：{guide.line}
                {escalated ? `（同类报错第 ${String(run.errorStreak)} 次了）` : ''}
              </div>
              <ul className="mt-1 space-y-0.5 pl-4">
                {guide.checks.map((c) => (
                  <li key={c} className="list-disc">
                    {c}
                  </li>
                ))}
              </ul>
              {escalated ? (
                <button
                  onClick={() => onSend(errorAsksText(e, guide, run.errorStreak ?? 1))}
                  className="mt-1.5 rounded-lg border border-amber-400/35 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-400/10"
                >
                  连着两次了——把这条报错发给教练，让他针对它提问
                </button>
              ) : (
                <p className="mt-1 text-[10px] text-amber-200/45">
                  先照着这两条自己看一遍；再撞同一种错，这里会让你把报错发给教练。
                </p>
              )}
            </div>
          ) : null}
          {e.traceback ? (
            <details className="mt-1 text-white/40">
              <summary className="cursor-pointer select-none">完整回溯</summary>
              <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap">{e.traceback}</pre>
            </details>
          ) : null}
        </>
      ) : null}
      {run.artifacts.map((a) => (
        <ArtifactView key={a.name} artifact={a} sessionId={sessionId} />
      ))}
      {run.plotHints?.length ? (
        <div className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/[0.07] px-2.5 py-2 text-sky-100/80">
          <div className="text-[11px] font-medium">图表规范检查（本地读的图元数据，不经过 AI）</div>
          <ul className="mt-1 space-y-0.5 pl-4">
            {run.plotHints.map((h) => (
              <li key={h} className="list-disc">
                {h}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-sky-200/50">只列出客观缺项：要不要改、怎么改由你判断。</p>
        </div>
      ) : null}
    </div>
  )
}

/** 绘图三问：必答表单，答完才放行运行与要骨架 */
function PlotAsk({
  intent,
  onAnswer
}: {
  intent: PlotAnswers | null
  onAnswer: (answers: PlotAnswers) => void
}): ReactNode {
  const [draft, setDraft] = useState<PlotAnswers>(intent ?? {})
  const asks = new Set(unanswered(draft))
  return (
    <div className="mx-4 mb-2 space-y-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] px-3 py-2.5">
      <div className="text-[11px] text-violet-200/70">
        画图之前先把这三句话说出来。写着「画个折线图」不算回答，本地检查只看字数，能不能唬住读者由你自己判断。
      </div>
      {PLOT_QUESTIONS.map((q) => (
        <div key={q.key} className="space-y-1">
          <label className="block text-[11px] text-white/70">
            {q.ask}
            {asks.has(q.ask) ? <span className="ml-1 text-violet-300/70">（还缺）</span> : null}
          </label>
          <textarea
            value={draft[q.key] ?? ''}
            onChange={(ev) => setDraft((d) => ({ ...d, [q.key]: ev.target.value }))}
            placeholder={q.hint}
            spellCheck={false}
            rows={2}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] leading-4 outline-none placeholder:text-white/25 focus:border-violet-400/50"
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onAnswer(draft)}
          disabled={asks.size > 0}
          className="rounded-lg bg-violet-600/80 px-3 py-1 text-[12px] font-medium text-white disabled:opacity-40"
        >
          记下这三答
        </button>
        <span className="text-[10px] text-white/30">
          {asks.size
            ? `每问至少写够 ${String(PLOT_ANSWER_MIN)} 个字。这不是给 AI 填的表，是为了让你自己说清这张图要干什么。`
            : '存下来之后运行不再拦你，教练也会看到这三答。'}
        </span>
      </div>
    </div>
  )
}

function ArtifactView({
  artifact,
  sessionId
}: {
  artifact: ArtifactInfo
  sessionId: number | null
}): ReactNode {
  const [content, setContent] = useState<ArtifactContent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const isImage = artifact.ext === '.png' || artifact.ext === '.jpg'
  const src = artifact.inline ? artifact.dataUrl : content?.dataUrl

  const load = async (): Promise<void> => {
    if (!sessionId) return
    try {
      setContent(await window.api.readArtifact(sessionId, artifact.name))
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }

  if (isImage && src) {
    return (
      <figure className="mt-2">
        <img
          src={src}
          alt={artifact.name}
          className="max-h-72 w-auto rounded border border-white/10 bg-white"
        />
        <figcaption className="mt-0.5 text-[10px] text-white/35">
          {artifact.name} · {(artifact.size / 1024).toFixed(1)} KB
        </figcaption>
      </figure>
    )
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => void load()}
        className="text-[11px] text-sky-300/80 hover:text-sky-200"
      >
        {content ? `重新读取 ${artifact.name}` : `查看 ${artifact.name}`}
      </button>
      <span className="ml-2 text-[10px] text-white/30">{(artifact.size / 1024).toFixed(1)} KB</span>
      {loadError ? <p className="text-[11px] text-red-300">{loadError}</p> : null}
      {content?.text ? (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre rounded border border-white/10 bg-black/30 p-2 text-[10px] text-white/70">
          {content.text}
        </pre>
      ) : null}
    </div>
  )
}

