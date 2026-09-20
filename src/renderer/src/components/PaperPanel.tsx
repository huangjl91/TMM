import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CompileResult, LatexIssue } from '@shared/latex'

interface Props {
  sessionId: number | null
}

type Tab = 'source' | 'preview' | 'issues' | 'log'

const AUTOSAVE_MS = 2000
/** 切会话时顺手回读旧 PDF，但超过这个体积就别拖慢切换 */
const MAX_PREVIEW = 8_000_000

function bytesOf(dataUrl: string): ArrayBuffer {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return buf
}

/**
 * 论文面板：LaTeX 源码由学生自己写，这里只负责编译、把日志翻译成人话、预览 PDF。
 * 与 Python 沙箱共用会话工作区，所以沙箱产出的图可以按文件名直接引用。
 */
export function PaperPanel({ sessionId }: Props): ReactNode {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState('')
  const [tab, setTab] = useState<Tab>('source')
  const [result, setResult] = useState<CompileResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pristine, setPristine] = useState(false)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const savedRef = useRef('')
  const urlRef = useRef<string | null>(null)

  const release = useCallback((): void => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setPdfUrl(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    setBusy(false)
    setErr(null)
    setResult(null)
    release()
    setDirty(false)
    if (!sessionId) {
      savedRef.current = ''
      setSource('')
      return
    }
    void (async () => {
      try {
        const d = await window.api.paperDraft(sessionId)
        if (cancelled) return
        savedRef.current = d.source
        setSource(d.source)
        setPristine(!d.edited)
        // 之前编译过的 PDF 还在工作区，直接给预览，不必非要重新编一次
        const pdf = await window.api.paperPdf(sessionId).catch(() => null)
        if (cancelled || !pdf?.dataUrl || pdf.size > MAX_PREVIEW) return
        const url = URL.createObjectURL(new Blob([bytesOf(pdf.dataUrl)], { type: 'application/pdf' }))
        urlRef.current = url
        setPdfUrl(url)
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, release])

  useEffect(() => release, [release])

  // 丢稿比什么都糟：停手两秒就存一版，内容与上一版相同则不追加
  useEffect(() => {
    if (!sessionId || !dirty || !source.trim()) return
    const t = setTimeout(() => {
      window.api
        .savePaper(sessionId, source)
        .then(() => {
          savedRef.current = source
          setDirty(false)
        })
        .catch((e: unknown) => setErr((e as Error).message))
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [sessionId, source, dirty])

  const showPdf = useCallback(async (): Promise<void> => {
    if (!sessionId) return
    const pdf = await window.api.paperPdf(sessionId).catch((e: unknown) => {
      setErr((e as Error).message)
      return null
    })
    if (!pdf?.dataUrl) return
    release()
    const url = URL.createObjectURL(new Blob([bytesOf(pdf.dataUrl)], { type: 'application/pdf' }))
    urlRef.current = url
    setPdfUrl(url)
    setTab('preview')
  }, [release, sessionId])

  const compile = useCallback(async (): Promise<void> => {
    if (!sessionId || busy) return
    setBusy(true)
    setErr(null)
    try {
      const r = await window.api.compilePaper(sessionId, source)
      savedRef.current = source
      setDirty(false)
      setResult(r)
      if (r.ok) await showPdf()
      else setTab(r.errors.length > 0 ? 'issues' : 'log')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [busy, sessionId, showPdf, source])

  const jump = useCallback(
    (issue: LatexIssue): void => {
      if (!issue.line) return
      const lines = source.split('\n')
      let pos = 0
      for (let i = 0; i < issue.line - 1 && i < lines.length; i++) pos += (lines[i]?.length ?? 0) + 1
      const text = lines[issue.line - 1] ?? ''
      setTab('source')
      setOpen(true)
      requestAnimationFrame(() => {
        const ta = taRef.current
        if (!ta) return
        ta.focus()
        ta.setSelectionRange(pos, pos + text.length)
      })
    },
    [source]
  )

  const errors = result?.errors ?? []
  const warnings = result?.warnings ?? []
  const issues = errors.length + warnings.length

  return (
    <section className="shrink-0 border-t border-white/10 bg-[#12141a]">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-white/45 hover:text-white/70"
        >
          {open ? '▾' : '▸'} 国赛论文 · LaTeX
        </button>
        {dirty ? <span className="text-[11px] text-amber-300/80">未保存</span> : null}
        {result?.ok ? (
          <span className="text-[11px] text-emerald-300/80">
            ✓ {result.pages} 页 · {(result.pdfSize / 1024).toFixed(0)} KB · {result.durationMs} ms
          </span>
        ) : null}
        {!result?.ok && result ? (
          <span className="text-[11px] text-red-300/90">✗ {errors.length} 处错误</span>
        ) : null}
        {warnings.length ? (
          <span className="text-[11px] text-amber-300/70">{warnings.length} 条排版警告</span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {busy ? (
            <button
              onClick={() => sessionId && void window.api.stopCompile(sessionId)}
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/70"
            >
              停止
            </button>
          ) : null}
          {pdfUrl && !busy ? (
            <button
              onClick={() => sessionId && void window.api.openPaper(sessionId)}
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/60 hover:bg-white/5"
            >
              在工作区打开
            </button>
          ) : null}
          <button
            onClick={() => void compile()}
            disabled={!sessionId || busy}
            title={sessionId ? 'xelatex 连编两遍，第二遍解交叉引用' : '先在中间栏和教练说一句话建立会话'}
            className="rounded-lg bg-indigo-700 px-4 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {busy ? '编译中…' : '编译  ⌃⏎'}
          </button>
        </div>
      </div>

      {open ? (
        <div className="grid h-72 grid-cols-2 gap-3 px-4 pb-3">
          <textarea
            ref={taRef}
            value={source}
            onChange={(e) => {
              setSource(e.target.value)
              setDirty(e.target.value !== savedRef.current)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void compile()
              }
            }}
            spellCheck={false}
            placeholder={
              sessionId
                ? undefined
                : '论文稿要挂在会话上：先在中间栏把真题贴给教练，建立会话后这里会自动载入模板。'
            }
            className="h-full w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[12px] leading-5 outline-none focus:border-indigo-500/50"
          />

          <div className="flex h-full min-w-0 flex-col rounded-lg border border-white/10 bg-black/25">
            <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-1.5 text-[11px]">
              {(
                [
                  ['source', '怎么写'],
                  ['preview', 'PDF 预览'],
                  ['issues', `问题 ${String(issues)}`],
                  ['log', '日志']
                ] as Array<[Tab, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={
                    'rounded px-2 py-0.5 ' +
                    (tab === key ? 'bg-white/10 text-white/85' : 'text-white/40 hover:text-white/65')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {err ? <p className="mb-2 text-xs text-red-300">{err}</p> : null}
              {tab === 'source' ? <Guide pristine={pristine} /> : null}
              {tab === 'preview' ? <Preview url={pdfUrl} busy={busy} /> : null}
              {tab === 'issues' ? (
                <Issues errors={errors} warnings={warnings} onJump={jump} tail={result?.logTail ?? ''} />
              ) : null}
              {tab === 'log' ? (
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-4 text-white/55">
                  {result?.logTail || '还没有编译过。'}
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Guide({ pristine }: { pristine: boolean }): ReactNode {
  return (
    <div className="space-y-2 text-[11px] leading-5 text-white/50">
      <p>
        左边是 <span className="font-mono text-white/70">paper.tex</span> 的正文，模板只给结构和空位，
        每一节的注释都写明它对应左边哪个阶段——把任务卡里你自己填过的内容改写进来。
      </p>
      <p>
        图上一步在 Python 沙箱里跑出来后，用 <span className="font-mono text-white/70">{'\\includegraphics{文件名.png}'}</span>{' '}
        引用即可：两边共用同一个会话工作区。
      </p>
      <p>
        编译是 <span className="font-mono text-white/70">xelatex</span> 连编两遍（第一遍只出 aux，第二遍解交叉引用）。
        出错就停在那一遍，点「问题」里的行号可以直接跳过去。
      </p>
      {pristine ? (
        <p className="text-amber-300/80">现在还是模板原文。国赛评的是你写的东西，先把摘要页的题目与三段式摘要填了。</p>
      ) : null}
      <p className="text-white/30">承诺页与编号页按赛区要求单独装订，不在这个文件里。</p>
    </div>
  )
}

function Preview({ url, busy }: { url: string | null; busy: boolean }): ReactNode {
  const supported = navigator.pdfViewerEnabled !== false
  if (busy) return <p className="text-[11px] text-white/40">正在编译…</p>
  if (!url) return <p className="text-[11px] text-white/30">还没有可预览的 PDF。编译成功后这里显示成品。</p>
  if (!supported)
    return (
      <p className="text-[11px] text-amber-300/80">
        当前窗口不能内嵌显示 PDF，用上方「在工作区打开」看成品。
      </p>
    )
  return <iframe title="PDF 预览" src={url} className="h-full w-full rounded border border-white/10 bg-white" />
}

function Issues({
  errors,
  warnings,
  onJump,
  tail
}: {
  errors: LatexIssue[]
  warnings: LatexIssue[]
  onJump: (issue: LatexIssue) => void
  tail: string
}): ReactNode {
  if (!errors.length && !warnings.length)
    return (
      <p className="text-[11px] text-white/30">
        没有问题可显示。{tail ? '若编译没成功，看「日志」页的原文。' : '先点一次编译。'}
      </p>
    )
  return (
    <div className="space-y-2">
      {errors.length ? (
        <p className="text-[11px] text-white/40">
          先修错误：修掉第一条之后，后面的报错常常自己就没了。别一次改好几处。
        </p>
      ) : null}
      {[...errors, ...warnings].map((it, i) => (
        <div
          key={`${it.line}-${String(i)}`}
          className={
            'border-l-2 pl-2 ' + (it.severity === 'error' ? 'border-red-500/50' : 'border-amber-400/40')
          }
        >
          <div className="flex items-baseline gap-2">
            {it.line ? (
              <button
                onClick={() => onJump(it)}
                className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300 hover:bg-white/20"
              >
                第 {it.line}
                {it.lineEnd && it.lineEnd !== it.line ? `–${String(it.lineEnd)}` : ''} 行
              </button>
            ) : (
              <span className="text-[10px] text-white/30">未定位到行</span>
            )}
            <span className="text-[10px] text-white/35">{it.severity === 'error' ? '错误' : '警告'}</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-white/80">{it.message}</p>
          {it.hint ? <p className="mt-0.5 text-[11px] leading-4 text-emerald-300/70">→ {it.hint}</p> : null}
          {it.raw ? (
            <details className="mt-0.5">
              <summary className="cursor-pointer select-none text-[10px] text-white/30">日志原文</summary>
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] text-white/45">
                {it.raw}
              </pre>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  )
}
