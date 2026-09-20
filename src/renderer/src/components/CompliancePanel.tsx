import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { stageByKey } from '@shared/stages'
import type { LatexIssue } from '@shared/latex'
import type { UsageExportResult, UsageSummary } from '@shared/compliance'

interface Props {
  sessionId: number | null
  stageId: number
}

type Tab = 'gaps' | 'preview' | 'issues'

/** 切到这一阶段就把面板展开：留痕这东西，等要交了才发现缺记录就晚了 */
const DISCLOSURE_ID = stageByKey('disclosure')?.id ?? 11
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
 * 合规面板：把本机留痕统计给学生的同时，直接生成《AI 工具使用详情.pdf》。
 * 数据全部来自本机数据库与主进程，渲染层不做任何「估算」。
 */
export function CompliancePanel({ sessionId, stageId }: Props): ReactNode {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('gaps')
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [result, setResult] = useState<UsageExportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedTo, setSavedTo] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  const liveRef = useRef(true)
  const seqRef = useRef(0)

  const release = useCallback((): void => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setPdfUrl(null)
  }, [])

  const loadPdf = useCallback(async (): Promise<void> => {
    if (!sessionId) return
    const seq = seqRef.current
    const pdf = await window.api.usagePdf(sessionId).catch(() => null)
    if (!liveRef.current || seq !== seqRef.current) return
    if (!pdf?.dataUrl || pdf.size > MAX_PREVIEW) return
    release()
    const url = URL.createObjectURL(new Blob([bytesOf(pdf.dataUrl)], { type: 'application/pdf' }))
    urlRef.current = url
    setPdfUrl(url)
  }, [release, sessionId])

  const refresh = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setSummary(null)
      return
    }
    const seq = seqRef.current
    setErr(null)
    try {
      const s = await window.api.usageSummary(sessionId)
      if (liveRef.current && seq === seqRef.current) setSummary(s)
    } catch (e) {
      if (liveRef.current && seq === seqRef.current) setErr(String((e as Error).message ?? e))
    }
  }, [sessionId])

  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
    }
  }, [])

  useEffect(() => {
    seqRef.current += 1
    setResult(null)
    setSavedTo(null)
    release()
    if (stageId === DISCLOSURE_ID) setOpen(true)
    void refresh()
    if (sessionId) void loadPdf()
  }, [refresh, release, loadPdf, sessionId, stageId])

  useEffect(() => release, [release])

  const exportPdf = useCallback(async (): Promise<void> => {
    if (!sessionId || busy) return
    const seq = seqRef.current
    setBusy(true)
    setErr(null)
    setSavedTo(null)
    try {
      const r = await window.api.exportUsagePdf(sessionId)
      if (!liveRef.current || seq !== seqRef.current) return
      setResult(r)
      void refresh()
      if (r.ok) {
        await loadPdf()
        setTab('preview')
        if (r.savedTo) setSavedTo(r.savedTo)
      } else setTab(r.errors.length > 0 ? 'issues' : 'gaps')
    } catch (e) {
      if (liveRef.current && seq === seqRef.current) setErr(String((e as Error).message ?? e))
    } finally {
      if (liveRef.current && seq === seqRef.current) setBusy(false)
    }
  }, [busy, loadPdf, refresh, sessionId])

  const errors: LatexIssue[] = result?.errors ?? []
  const gaps = summary?.gaps ?? []

  return (
    <section className="shrink-0 border-t border-white/10 bg-[#12141a]">
      <div className="flex items-center gap-2 px-4 py-2">
        <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-white/45 hover:text-white/70">
          {open ? '▾' : '▸'} AI 使用详情 · 合规导出
        </button>
        {summary ? (
          <span className="text-[11px] text-white/40">
            事件 {summary.events} · 交互 {summary.turns} 条
          </span>
        ) : null}
        {gaps.length ? <span className="text-[11px] text-amber-300/80">还差 {gaps.length} 处</span> : null}
        {result?.ok ? (
          <span className="text-[11px] text-emerald-300/80">
            ✓ {result.pages} 页{savedTo ? ` · 已存到 ${savedTo.split(/[\\/]/).pop()}` : ''}
          </span>
        ) : null}
        {!result?.ok && result ? <span className="text-[11px] text-red-300/90">✗ {errors.length} 处错误</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            disabled={!sessionId || busy}
            title="留痕是追加式的：填完任务卡、跑完代码后点这里重算一次"
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/60 hover:bg-white/5"
          >
            重新统计
          </button>
          {pdfUrl && !busy ? (
            <button
              onClick={() => sessionId && void window.api.openUsagePdf(sessionId)}
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/60 hover:bg-white/5"
            >
              在工作区打开
            </button>
          ) : null}
          <button
            onClick={() => void exportPdf()}
            disabled={!sessionId || busy}
            title={sessionId ? '按本机留痕重新生成并编译，再选保存位置' : '先在中间栏把真题贴给教练，建立会话后再导出'}
            className="rounded-lg bg-indigo-700 px-4 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {busy ? '生成中…' : '生成并导出 PDF'}
          </button>
        </div>
      </div>

      {open ? (
        <div className="grid h-72 grid-cols-2 gap-3 px-4 pb-3">
          <div className="min-h-0 overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-3 text-[11px] leading-5 text-white/60">
            {err ? <p className="mb-2 text-xs text-red-300">{err}</p> : null}
            {!summary ? (
              <p className="text-white/35">
                {sessionId
                  ? '正在读取本机留痕…'
                  : '留痕挂在会话上：先在中间栏把真题贴给教练，建立会话后这里会列出每一次提问、每一次提示升级和每一次采纳示例。'}
              </p>
            ) : (
              <>
                <p className="mb-1 text-xs font-semibold text-white/50">工具与版本</p>
                <p>
                  {summary.tool.appName} {summary.tool.appVersion} · {summary.tool.provider} ·{' '}
                  {summary.tool.models.join('、') || '（未记录）'}
                </p>
                <p className="mt-1 text-white/35">
                  API 密钥不写进这份文件：密钥只存在本机系统钥匙串，导出时也不会读它。
                </p>
                <p className="mt-3 mb-1 text-xs font-semibold text-white/50">AI 参与事件</p>
                {summary.actions.length ? (
                  <ul className="space-y-0.5">
                    {summary.actions.map((a) => (
                      <li key={a.action} className="flex justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate" title={a.action}>
                          {a.label}
                        </span>
                        <span className="shrink-0 font-mono text-white/45">{a.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-white/35">还没有事件留痕。</p>
                )}
                <p className="mt-3 mb-1 text-xs font-semibold text-white/50">其他</p>
                <p>
                  沙箱运行 {summary.codeRuns} 次 · 论文存版 {summary.paperSaves} 次 · 钉选候选方法{' '}
                  {summary.pinnedMethods.length ? summary.pinnedMethods.join('、') : '无'}
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  记录复核：{summary.review.trim() || <span className="text-amber-300/80">（尚未填写）</span>}
                </p>
              </>
            )}
          </div>

          <div className="flex h-full min-w-0 flex-col rounded-lg border border-white/10 bg-black/25">
            <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-1.5 text-[11px]">
              {(
                [
                  ['gaps', `还缺什么 ${String(gaps.length)}`],
                  ['preview', 'PDF 预览'],
                  ['issues', `问题 ${String(errors.length)}`]
                ] as Array<[Tab, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={
                    'rounded px-2 py-0.5 ' + (tab === key ? 'bg-white/10 text-white/85' : 'text-white/40 hover:text-white/65')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {tab === 'gaps' ? (
                <div className="space-y-2 text-[11px] leading-5 text-white/65">
                  {gaps.length ? (
                    gaps.map((g) => (
                      <p key={g} className="border-l-2 border-amber-400/40 pl-2">
                        {g}
                      </p>
                    ))
                  ) : (
                    <p className="text-white/40">留痕里没有明显缺口。导出后仍要自己逐条核对，规定要求的是人工核实，不是应用盖章。</p>
                  )}
                  <p className="text-white/30">
                    这份文件由本机留痕自动排版生成，不能手工改成「好看的样子」再提交——评委核对的是记录与正文是否对得上。
                  </p>
                </div>
              ) : null}
              {tab === 'preview' ? (
                busy ? (
                  <p className="text-[11px] text-white/40">正在生成…</p>
                ) : pdfUrl ? (
                  <iframe title="详情 PDF 预览" src={pdfUrl} className="h-full w-full rounded border border-white/10 bg-white" />
                ) : (
                  <p className="text-[11px] text-white/30">还没有生成过。点右上角「生成并导出 PDF」。</p>
                )
              ) : null}
              {tab === 'issues' ? (
                errors.length ? (
                  <div className="space-y-2">
                    {errors.map((it, i) => (
                      <div key={`${String(it.line)}-${String(i)}`} className="border-l-2 border-red-500/50 pl-2">
                        <p className="text-[11px] leading-4 text-white/80">{it.message}</p>
                        {it.hint ? <p className="text-[11px] leading-4 text-emerald-300/70">→ {it.hint}</p> : null}
                        {it.raw ? (
                          <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] text-white/45">
                            {it.raw}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-white/30">
                    没有编译问题。{result?.logTail ? '' : '先点一次「生成并导出 PDF」。'}
                  </p>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
