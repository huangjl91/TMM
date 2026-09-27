import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import { ArrowSquareOut, ArrowsIn, ArrowsOut, FileText, SpinnerGap, Tray, Warning } from '@phosphor-icons/react'

// 将 WorkerMessageHandler 挂载至全局，彻底免除外部 Worker 文件寻址与 file:// 跨域限制
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).pdfjsWorker = pdfjsWorker
  GlobalWorkerOptions.workerSrc = 'inline-worker'
}

interface Props {
  pdfDataUrl: string | null
  fileName?: string
  currentQIdx: number
  expanded: boolean
  onToggleExpand: () => void
  onOpenExternal?: () => void
}

export function A4ProblemViewer({
  pdfDataUrl,
  fileName,
  currentQIdx,
  expanded,
  onToggleExpand,
  onOpenExternal
}: Props): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState<number>(1.25)
  const [renderedPages, setRenderedPages] = useState<{ pageNum: number; dataUrl: string; width: number; height: number }[]>([])

  useEffect(() => {
    if (!pdfDataUrl) {
      setNumPages(0)
      setRenderedPages([])
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const renderAllPages = async (): Promise<void> => {
      try {
        const b64 = (pdfDataUrl.includes(',') ? pdfDataUrl.split(',')[1] : pdfDataUrl) || ''
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

        const loadingTask = getDocument({
          data: bytes,
          useSystemFonts: true
        })

        const pdfDoc = await loadingTask.promise
        if (cancelled) return

        const total = pdfDoc.numPages
        setNumPages(total)

        const pages: { pageNum: number; dataUrl: string; width: number; height: number }[] = []

        // 渲染每一页为高清 A4 纸图像
        for (let p = 1; p <= total; p++) {
          if (cancelled) return
          const page = await pdfDoc.getPage(p)
          // 采用 1.75 倍高清渲染比例，确保公式、小字、表格完全清晰
          const renderScale = 1.75
          const viewport = page.getViewport({ scale: renderScale })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height

          const ctx = canvas.getContext('2d', { alpha: false })
          if (!ctx) continue

          // 填充纯白底色（标准 A4 白纸）
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          await page.render({
            canvasContext: ctx,
            viewport: viewport,
            canvas: canvas
          }).promise

          const imgUrl = canvas.toDataURL('image/png')
          pages.push({
            pageNum: p,
            dataUrl: imgUrl,
            width: viewport.width / renderScale,
            height: viewport.height / renderScale
          })
        }

        if (!cancelled) {
          setRenderedPages(pages)
          setLoading(false)
        }
      } catch (e) {
        console.error('Failed to render PDF pages:', e)
        if (!cancelled) {
          setError((e as Error).message || 'PDF 解析失败')
          setLoading(false)
        }
      }
    }

    void renderAllPages()

    return () => {
      cancelled = true
    }
  }, [pdfDataUrl])

  return (
    <div className="overflow-hidden rounded-xl border border-[#d8e5e2] bg-white shadow-sm transition-all duration-300">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d8e5e2] bg-[#f8fbfa] px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-sky-500/20 text-xs font-bold text-sky-400">
            <FileText size={14} weight="duotone" />
          </span>
          <span className="font-semibold text-white">赛题 A4 原件视窗</span>
          {fileName ? (
            <span
              className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] text-white/70 max-w-[180px] truncate"
              title={fileName}
            >
              {fileName}
            </span>
          ) : null}
          {numPages > 0 ? (
            <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/50">
              共 {numPages} 页
            </span>
          ) : null}
          <span className="rounded bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[11px] text-sky-300 font-medium">
            正在研读：问题 {currentQIdx}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 缩放比例控制 */}
          <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5 text-[11px]">
            <button
              onClick={() => setScale((s) => Math.max(0.8, s - 0.15))}
              className="px-2 py-0.5 text-white/60 hover:text-white transition-all"
              title="缩小"
            >
              -
            </button>
            <span className="px-1 text-white/80 font-mono">{(scale * 100).toFixed(0)}%</span>
            <button
              onClick={() => setScale((s) => Math.min(1.8, s + 0.15))}
              className="px-2 py-0.5 text-white/60 hover:text-white transition-all"
              title="放大"
            >
              +
            </button>
          </div>

          {/* 放大/还原视窗高度 */}
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white transition-all"
            title={expanded ? '还原默认高度 (480px)' : '放大视窗高度 (700px)'}
          >
            {expanded ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}
            <span>{expanded ? '默认高度' : '放大视窗'}</span>
          </button>

          {/* 系统外部阅读器打开 */}
          {onOpenExternal ? (
            <button
              onClick={onOpenExternal}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white transition-all"
              title="在系统默认 PDF 阅读器中打开原始文件"
            >
              <ArrowSquareOut size={14} />
              <span>系统打开</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* A4 纸页面展示核心区 */}
      <div
        ref={containerRef}
        className={`w-full ${
          expanded ? 'h-[720px]' : 'h-[480px]'
        } overflow-y-auto bg-[#eef3f2] p-6 flex flex-col items-center gap-6 transition-all select-text`}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-white/60 gap-3 py-16">
            <SpinnerGap size={24} className="animate-spin" />
            <span className="text-xs">正在高保真渲染 A4 试题原件...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-amber-200/80 gap-2 py-16">
            <span className="flex items-center gap-1.5"><Warning size={16} weight="fill" />{error}</span>
            <span className="text-xs text-white/40">可点击右上角「系统打开」直接查看原件文件</span>
          </div>
        ) : renderedPages.length > 0 ? (
          renderedPages.map((page) => (
            <div key={page.pageNum} className="flex flex-col items-center gap-2">
              <div
                className="bg-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5)] rounded-sm border border-slate-300 transition-all duration-150 overflow-hidden"
                style={{
                  width: `${page.width * scale}px`,
                  maxWidth: '100%'
                }}
              >
                <img
                  src={page.dataUrl}
                  alt={`赛题原件 第 ${page.pageNum} 页`}
                  className="w-full h-auto block"
                  draggable={false}
                />
              </div>
              <span className="text-[11px] font-mono text-white/40">
                - 第 {page.pageNum} 页 / 共 {numPages} 页 -
              </span>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-white/40 gap-3 py-16">
            <Tray size={30} weight="duotone" />
            <span className="text-xs">尚未检测到赛题 PDF 文件，请点击顶部「导入赛题与附件」导入题目。</span>
          </div>
        )}
      </div>
    </div>
  )
}
