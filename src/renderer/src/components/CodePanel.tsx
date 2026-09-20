import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ArtifactContent, ArtifactInfo, RunRecord } from '@shared/sandbox'
import type { Injection } from './TaskCard'

interface Props {
  sessionId: number | null
  /** 第一次运行会隐式建会话，把 id 交回上层，后续对话和代码才在同一会话里 */
  onAdoptSession: (id: number) => void
  /** 采纳代码示例时由上层把内容送进来 */
  injection: Injection | null
}

const SAMPLE = `import numpy as np
import matplotlib.pyplot as plt

# 在这里写你自己的求解代码
t = np.linspace(0, 10, 200)
y = np.exp(-0.3 * t) * np.sin(2 * t)

plt.figure(figsize=(6, 3))
plt.plot(t, y)
plt.xlabel('时间 t')
plt.ylabel('种群 x(t)')
plt.title('我的第一个模型曲线')
plt.savefig('curve.png', dpi=120)
print('峰值', y.max(), 'at t =', t[y.argmax()])
`

export function CodePanel({ sessionId, onAdoptSession, injection }: Props): ReactNode {
  const [code, setCode] = useState(SAMPLE)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!injection || injection.target !== 'code') return
    setCode(injection.content)
    setOpen(true)
  }, [injection])

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
              <RunView key={r.id} run={r} sessionId={sessionId} />
            ))}
            {busy ? <p className="text-[11px] text-white/40">正在执行…</p> : null}
            <div ref={endRef} />
          </div>
        </div>
      ) : null}
    </section>
  )
}

function RunView({ run, sessionId }: { run: RunRecord; sessionId: number | null }): ReactNode {
  const lines = run.stdout.split('\n')
  const head = lines.slice(0, 40).join('\n')
  const rest = lines.length - 40
  const e = run.error
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

