import { dialog, BrowserWindow, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { workspaceDir } from './sandbox'
import { addSessionFile, createSession, listSessionFiles, loadSettings, logAiUsage, renameSession, saveStageOutputs } from './repo'
import { parseQuestions } from '../shared/questions'
import {
  buildDigest,
  defaultKind,
  digestKind,
  humanSize,
  needsVerify,
  safeName,
  type IntakeKind,
  type SessionFileView
} from '../shared/intake'
import type { IntakeResult } from '../shared/intake'

/** 扫描件与超大 PDF 会让提取变成无底洞，先给硬上限 */
const MAX_PDF_PAGES = 40
const MAX_TEXT_BYTES = 2_000_000
const MAX_FILE_BYTES = 200_000_000
const MAX_FILES_PER_INTAKE = 300
const MAX_WALK_DEPTH = 3

/**
 * pdfjs 的 worker、cmaps、标准字体必须以普通文件形式存在：
 * Electron 不支持从 asar 里 import() ESM，所以打包态走 resources/pdf（见 electron-builder.yml），
 * 开发态直接指 node_modules 里的 legacy 构建。worker 与 assetDir 成对给出，别按同一层找。
 */
function pdfAssets(): { worker: string; assetDir: string } | null {
  const pkg = join(process.resourcesPath, 'pdf')
  const dist = join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist')
  const candidates = [
    { worker: join(pkg, 'pdf.worker.mjs'), assetDir: pkg },
    { worker: join(dist, 'legacy', 'build', 'pdf.worker.mjs'), assetDir: dist }
  ]
  for (const c of candidates) {
    if (existsSync(c.worker)) return c
  }
  return null
}

let workerConfigured = false

/** 不显式设 workerSrc，bundle 里的相对解析会找不到 worker（M6-0 实测） */
function ensureWorker(): boolean {
  if (workerConfigured) return true
  const a = pdfAssets()
  if (!a) return false
  GlobalWorkerOptions.workerSrc = pathToFileURL(a.worker).href
  workerConfigured = true
  return true
}

async function pdfText(file: string): Promise<{ text: string; note: string }> {
  const assets = pdfAssets()
  if (!assets || !ensureWorker()) {
    return { text: '', note: '应用里没找到 PDF 解析资源，题目文本请手动粘贴' }
  }
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(file)),
    useWorkerFetch: false,
    disableFontFace: true,
    cMapUrl: join(assets.assetDir, 'cmaps') + '/',
    cMapPacked: true,
    standardFontDataUrl: join(assets.assetDir, 'standard_fonts') + '/'
  }).promise
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
  let text = ''
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    text += tc.items.map((it) => ('str' in it ? String(it.str) : '')).join(' ') + '\n'
  }
  const note =
    doc.numPages > pages
      ? `共 ${String(doc.numPages)} 页，只提取了前 ${String(pages)} 页`
      : text.trim().length < 40
        ? '几乎没提取到文本，可能是扫描件'
        : ''
  return { text, note }
}

/** 中文竞赛附件的 CSV 常常是 GBK，直接按 UTF-8 读会得到乱码 */
function decodeSmart(buf: Buffer): string {
  const utf = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (!utf.includes('\uFFFD')) return utf
  try {
    return new TextDecoder('gbk').decode(buf)
  } catch {
    return utf
  }
}

function walk(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_WALK_DEPTH || out.length >= MAX_FILES_PER_INTAKE) return
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (out.length >= MAX_FILES_PER_INTAKE) return
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, depth + 1, out)
    else if (st.isFile()) out.push(full)
  }
}

function uniqueTarget(dir: string, name: string): { full: string; collision: boolean } {
  let target = join(dir, name)
  if (!existsSync(target)) return { full: target, collision: false }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; i < 100; i++) {
    target = join(dir, `${stem} (${String(i)})${ext}`)
    if (!existsSync(target)) return { full: target, collision: true }
  }
  return { full: target, collision: true }
}

async function pick(): Promise<string[]> {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null
  const options: Electron.OpenDialogOptions = {
    title: '导入赛题与附件',
    buttonLabel: '导入',
    properties: ['openFile', 'openDirectory', 'multiSelections']
  }
  const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (r.canceled) return []
  const files: string[] = []
  for (const p of r.filePaths) {
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(p, 1, files)
    else if (st.isFile()) files.push(p)
  }
  return files.slice(0, MAX_FILES_PER_INTAKE)
}

const SUBDIR: Record<IntakeKind, string> = { problem: '题目', data: '附件' }

/**
 * 学生点「导入赛题与附件」的唯一入口。
 * 会话在这里就建好：导入失败也要留下痕迹，不能让文件落进一个不存在的会话。
 */
export async function intake(): Promise<IntakeResult | null> {
  const picked = await pick()
  if (picked.length === 0) return null

  const s = loadSettings()
  const first = picked[0] ?? ''
  const sessionId = createSession(safeName(first).replace(/\.[^.]+$/, '') || '导入的赛题', s.providerId, s.model)
  const ws = workspaceDir(sessionId)
  const files: SessionFileView[] = []
  let problemText = 0

  for (const full of picked) {
    const rawName = full.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? full
    const name = safeName(rawName)
    const kind = defaultKind(name)
    let size = 0
    try {
      size = statSync(full).size
    } catch {
      continue
    }
    if (size > MAX_FILE_BYTES) {
      files.push({
        id: 0,
        kind,
        name,
        relPath: '',
        size,
        digestKind: digestKind(name),
        digest: `文件超过 ${humanSize(MAX_FILE_BYTES)}，未导入。请只导建模要用的数据。`,
        needsVerify: false,
        createdAt: Date.now()
      })
      continue
    }

    const dir = join(ws, SUBDIR[kind])
    mkdirSync(dir, { recursive: true })
    const { full: dest } = uniqueTarget(dir, name)
    try {
      copyFileSync(full, dest)
    } catch (e) {
      files.push({
        id: 0,
        kind,
        name,
        relPath: '',
        size,
        digestKind: digestKind(name),
        digest: `复制失败：${(e as Error).message}`,
        needsVerify: false,
        createdAt: Date.now()
      })
      continue
    }
    const relPath = `${SUBDIR[kind]}/${name}`

    let extracted: string | null = null
    let note = ''
    const dk = digestKind(name)
    try {
      if (dk === 'pdf') {
        const r = await pdfText(dest)
        extracted = r.text
        note = r.note
        problemText += r.text.trim().length
      } else if (dk === 'text' || dk === 'csv') {
        const buf = readFileSync(dest)
        extracted = decodeSmart(buf.length > MAX_TEXT_BYTES ? buf.subarray(0, MAX_TEXT_BYTES) : buf)
        if (dk === 'text') problemText += extracted.trim().length
      }
    } catch (e) {
      extracted = null
      note = `读取失败：${(e as Error).message}`
    }

    const id = addSessionFile(sessionId, kind, name, relPath, size, dk, buildDigest(name, size, extracted))
    files.push({
      id,
      kind,
      name,
      relPath,
      size,
      digestKind: dk,
      digest: buildDigest(name, size, extracted),
      needsVerify: needsVerify(name),
      createdAt: Date.now()
    })
    logAiUsage(sessionId, 1, kind === 'problem' ? 'intake_problem' : 'intake_data', `导入 ${relPath}（${humanSize(size)}）${note ? '；' + note : ''}`)
  }

  const named = files.find((f) => f.kind === 'problem' && f.relPath)
  if (named) {
    renameSession(sessionId, named.name.slice(0, 60))
    // 自动将提取出的题目小问切分与附件清单写入阶段 1 任务卡，使逐问轴与引导式做题立即生效
    const qs = parseQuestions(named.digest)
    const problemLines =
      qs.length >= 2
        ? qs.map((q) => `${q.label}：${q.brief}`).join('\n')
        : named.digest.slice(0, 3000)

    const dataSummary = files
      .filter((f) => f.kind === 'data')
      .map((f) => `${f.name}（${humanSize(f.size)}）`)
      .join('；')

    saveStageOutputs(sessionId, 1, {
      problems: problemLines,
      data: dataSummary || '已导入附件'
    })
  }
  const problemWarning =
    files.some((f) => f.kind === 'problem' && f.relPath) && problemText < 40
      ? '题目文档没提取出可用文本（扫描件或加密 PDF）。请把题目文字贴在下面输入框里，导入的附件照常可用。'
      : null

  return { sessionId, files, problemWarning }
}

export function filesOf(sessionId: number): SessionFileView[] {
  return listSessionFiles(sessionId)
}

export function readProblemPdf(sessionId: number): import('../shared/types').ProblemFileContent | null {
  const files = listSessionFiles(sessionId)
  const prob = files.find((f) => f.kind === 'problem')
  if (!prob) return null

  const ws = workspaceDir(sessionId)
  const candidates = [
    join(ws, SUBDIR.problem, prob.name),
    join(ws, '题目', prob.name),
    join(ws, prob.name)
  ]

  let foundPath: string | null = null
  for (const c of candidates) {
    if (existsSync(c)) {
      foundPath = c
      break
    }
  }

  if (foundPath && (prob.name.toLowerCase().endsWith('.pdf') || prob.digestKind === 'pdf')) {
    try {
      const buf = readFileSync(foundPath)
      const dataUrl = `data:application/pdf;base64,${buf.toString('base64')}`
      return {
        name: prob.name,
        kind: 'pdf',
        size: buf.length,
        dataUrl,
        fullText: prob.digest
      }
    } catch (e) {
      console.warn('[readProblemPdf] Failed to read PDF file:', e)
    }
  }

  return {
    name: prob.name,
    kind: 'text',
    size: prob.size,
    fullText: prob.digest
  }
}

export function openProblemPdf(sessionId: number): void {
  const files = listSessionFiles(sessionId)
  const prob = files.find((f) => f.kind === 'problem')
  const ws = workspaceDir(sessionId)
  if (!prob) {
    void shell.openPath(ws)
    return
  }

  const candidates = [
    join(ws, SUBDIR.problem, prob.name),
    join(ws, '题目', prob.name),
    join(ws, prob.name)
  ]

  for (const c of candidates) {
    if (existsSync(c)) {
      void shell.openPath(c)
      return
    }
  }
  void shell.openPath(ws)
}
