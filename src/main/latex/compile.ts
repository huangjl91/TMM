import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { Readable } from 'node:stream'
import { join } from 'node:path'
import { app, shell } from 'electron'
import { detectToolchain, xelatexPath } from '../runtime'
import { latestPaper, savePaper } from '../repo'
import { killTree, workspaceDir } from '../sandbox'
import { parseLatexLog } from './log'
import { USAGE_LOG_FILE, USAGE_PDF_FILE, USAGE_TEX_FILE } from '../../shared/compliance'
import type { CompileResult, LatexIssue, PaperDraft } from '../../shared/latex'
import type { ArtifactContent } from '../../shared/sandbox'

/**
 * 论文编译。与沙箱共用同一个会话工作区，所以 \includegraphics{curve.png}
 * 直接指向 Python 跑出来的那张图，不需要学生搬文件。
 *
 * 安全边界：nonstopmode + 不进交互提示，shell-escape 保持默认关闭（TeX 无法
 * 调外部程序），字体缓存写到 userData，绝不往只读的 TeX 安装目录里写。
 */
const PASS_TIMEOUT_MS = 180_000
const MAX_SOURCE = 300_000
/** 超过这个体积就不走 IPC 内联，让学生去工作区用系统阅读器打开 */
const MAX_PDF_INLINE = 25_000_000

/** 一次编译任务的三个文件名；论文与《AI 工具使用详情》共用同一条管线 */
export interface TexJob {
  tex: string
  log: string
  pdf: string
}

export const PAPER_JOB: TexJob = { tex: 'paper.tex', log: 'paper.log', pdf: 'paper.pdf' }
export const USAGE_JOB: TexJob = {
  tex: USAGE_TEX_FILE,
  log: USAGE_LOG_FILE,
  pdf: USAGE_PDF_FILE
}

type TexChild = ChildProcessByStdio<null, Readable, Readable>

interface Live {
  child: TexChild
  stopped: boolean
}

const running = new Map<number, Live>()

export function isCompiling(sessionId: number): boolean {
  return running.has(sessionId)
}

export function stopCompile(sessionId: number): boolean {
  const live = running.get(sessionId)
  if (!live) return false
  live.stopped = true
  killTree(live.child.pid)
  return true
}

/** 打包后模板在 asar 里，读法与 runner.py 一致：先 resourcesPath，再退回仓库目录 */
export function paperTemplate(): string {
  const candidates = [
    join(process.resourcesPath ?? '', 'latex', 'cumcm.tex'),
    // 开发态 __dirname 是 out/main，往上两级就是仓库根
    join(__dirname, '..', '..', 'resources', 'latex', 'cumcm.tex')
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) return readFileSync(p, 'utf8')
  }
  throw new Error('找不到论文模板 cumcm.tex，请重新安装应用')
}

function texEnv(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LANG', 'HOME']
  const env: NodeJS.ProcessEnv = {}
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]
  const cache = join(app.getPath('userData'), 'texcache')
  return { ...env, TEXMFVAR: cache, TEXMFCACHE: cache }
}

function readLog(workspace: string, job: TexJob): string {
  try {
    return readFileSync(join(workspace, job.log), 'utf8')
  } catch {
    return ''
  }
}

interface Pass {
  exit: number | null
  timedOut: boolean
  stopped: boolean
  log: string
}

function runPass(engine: string, workspace: string, job: TexJob, extra: string[], sessionId: number): Promise<Pass> {
  return new Promise((resolve) => {
    let child: TexChild
    try {
      child = spawn(engine, ['-interaction=nonstopmode', '-file-line-error', ...extra, job.tex], {
        cwd: workspace,
        env: texEnv(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (e) {
      resolve({ exit: null, timedOut: false, stopped: false, log: `启动 xelatex 失败：${(e as Error).message}` })
      return
    }
    running.set(sessionId, { child, stopped: false })
    let pipe = ''
    child.stderr.on('data', (b: Buffer) => {
      pipe = (pipe + b.toString('utf8')).slice(-4000)
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
    }, PASS_TIMEOUT_MS)

    const finish = (exit: number | null): void => {
      clearTimeout(timer)
      const stopped = Boolean(running.get(sessionId)?.stopped)
      running.delete(sessionId)
      let log = readLog(workspace, job)
      if (!log) log = pipe || `xelatex 没有写出 ${job.log}（退出码 ${String(exit)}）`
      else if (pipe.trim()) log += `\n${pipe}`
      resolve({ exit, timedOut, stopped, log })
    }
    child.on('error', () => finish(null))
    child.on('close', finish)
  })
}

function envIssue(what: string): LatexIssue {
  return {
    severity: 'error',
    line: 0,
    file: '',
    message: '没有探测到 xelatex',
    hint: `${what}需要本地 TeX 发行版（TeX Live 完整版，或只剩 MiKTeX 时把 xelatex 加进 PATH）。装好后重启应用即可，正文不会因为缺编译器而丢失。`,
    raw: ''
  }
}

function resultOf(
  startedAt: number,
  engine: string | null,
  workspace: string,
  job: TexJob,
  passes: number,
  log: string,
  extra: Partial<CompileResult> = {}
): CompileResult {
  const parsed = parseLatexLog(log, job.tex)
  const pdfPath = join(workspace, job.pdf)
  const stat = existsSync(pdfPath) ? statSync(pdfPath) : null
  const clean = parsed.errors.length === 0 && !parsed.fatal && stat !== null && parsed.pages > 0
  return {
    ok: clean,
    engine,
    durationMs: Date.now() - startedAt,
    passes,
    pages: parsed.pages,
    pdfSize: stat?.size ?? 0,
    pdfRev: stat ? Math.round(stat.mtimeMs) : 0,
    errors: clean ? [] : parsed.errors,
    warnings: parsed.warnings,
    logTail: log.slice(-2500),
    ...extra
  }
}

/** 防丢稿：内容与最新一版一样就不追加，免得每敲一下存一版 */
export function saveDraft(sessionId: number, source: string): boolean {
  const cur = latestPaper(sessionId)
  if (cur && cur.source === source) return false
  savePaper(sessionId, source)
  return true
}

/**
 * 两遍编译：第一遍 -no-pdf 只出 .aux（快，且错误当场返回），
 * 干净才跑第二遍出 PDF 并解交叉引用。论文与合规详情文档共用这条管线。
 */
export async function runTexJob(
  sessionId: number,
  source: string,
  job: TexJob,
  what = '论文编译'
): Promise<CompileResult> {
  await detectToolchain()
  const engine = xelatexPath()
  const started = Date.now()
  const workspace = workspaceDir(sessionId)
  if (!engine) {
    return resultOf(started, null, workspace, job, 0, '', { ok: false, errors: [envIssue(what)] })
  }
  if (isCompiling(sessionId)) throw new Error('上一次编译还没结束')
  const src = String(source ?? '')
  if (!src.trim()) throw new Error('正文是空的')
  if (src.length > MAX_SOURCE) throw new Error('源文件过长，请拆分附录')

  writeFileSync(join(workspace, job.tex), src, 'utf8')

  const first = await runPass(engine, workspace, job, ['-no-pdf'], sessionId)
  if (first.stopped) return resultOf(started, engine, workspace, job, 1, first.log, { ok: false, stopped: true })
  const p1 = parseLatexLog(first.log, job.tex)
  if (p1.errors.length > 0 || p1.fatal) {
    return resultOf(started, engine, workspace, job, 1, first.log, {
      ok: false,
      timedOut: first.timedOut || undefined
    })
  }

  const second = await runPass(engine, workspace, job, [], sessionId)
  // 只用第二遍的警告：第一遍的 Reference undefined 会被它自己写出的 aux 解掉，合并等于假报警
  const res = resultOf(started, engine, workspace, job, 2, second.log, {
    timedOut: second.timedOut || undefined,
    stopped: second.stopped || undefined
  })
  if (!res.ok && res.errors.length === 0) {
    res.errors = [
      {
        severity: 'error',
        line: 0,
        file: job.tex,
        message: second.timedOut
          ? `超过 ${Math.round(PASS_TIMEOUT_MS / 1000)} 秒没编完，已强制终止`
          : '编译没有产出 PDF，日志里也没定位到具体错误行',
        hint: second.timedOut
          ? '常见原因是循环交叉引用或超大图片：先把图缩小，再逐节注释定位。'
          : '把下面的日志原文贴给教练，让它帮你定位；不要凭猜改。',
        raw: second.log.slice(-1200)
      }
    ]
  }
  return res
}

export async function compilePaper(sessionId: number, source: string): Promise<CompileResult> {
  const src = String(source ?? '')
  if (!src.trim()) throw new Error('正文是空的')
  // 先落一版再编译：中途超时、被终止或进程崩了都不能让学生丢手写正文
  saveDraft(sessionId, src)
  return runTexJob(sessionId, src, PAPER_JOB)
}

export function paperDraft(sessionId: number): PaperDraft {
  const row = latestPaper(sessionId)
  if (!row) return { source: paperTemplate(), edited: false, updatedAt: null }
  let same = false
  try {
    const t = paperTemplate()
    same = row.source.replace(/\s+/g, '') === t.replace(/\s+/g, '')
  } catch {
    same = false
  }
  return { source: row.source, edited: !same, updatedAt: row.createdAt }
}

/** 预览用的 PDF：整份内联成 dataUrl，渲染层转 blob 交给内置阅读器。还没编译过是常态，返回 null 而不是抛错。 */
export function jobPdfPath(sessionId: number, job: TexJob): string {
  return join(workspaceDir(sessionId), job.pdf)
}

export function readJobPdf(sessionId: number, job: TexJob): ArtifactContent | null {
  const pdf = jobPdfPath(sessionId, job)
  if (!existsSync(pdf)) return null
  const buf = readFileSync(pdf)
  if (buf.length > MAX_PDF_INLINE)
    throw new Error(`PDF 有 ${(buf.length / 1048576).toFixed(1)} MB，请用「在工作区打开」查看`)
  return { size: buf.length, dataUrl: `data:application/pdf;base64,${buf.toString('base64')}` }
}

export function openJobPdf(sessionId: number, job: TexJob): void {
  const workspace = workspaceDir(sessionId)
  const pdf = join(workspace, job.pdf)
  void shell.openPath(existsSync(pdf) ? pdf : workspace)
}

export function readPaperPdf(sessionId: number): ArtifactContent | null {
  return readJobPdf(sessionId, PAPER_JOB)
}

export function openPaperPdf(sessionId: number): void {
  openJobPdf(sessionId, PAPER_JOB)
}
