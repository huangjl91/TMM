import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import { basename, join } from 'node:path'
import { detectToolchain, pythonInvocation } from '../runtime'
import type { ArtifactContent, ArtifactInfo, PlotMeta, RunOutcome, SandboxError, SandboxLimits } from '../../shared/sandbox'

export const TIMEOUT_MS = 60_000
export const MEM_MB = 2048
const MAX_CODE_CHARS = 20_000
/** 允许回读的文件类型：图表和结果表，不给渲染层开读任意文件的洞 */
const SERVE_EXT = new Set(['.png', '.jpg', '.csv', '.txt', '.json', '.npz', '.xlsx'])

export const UNLIMITED: SandboxLimits = { jobObject: false, memory: false, error: '沙箱未能启动' }
/** 进程起来了但没来得及写结果（超时/被杀），限额到底生效没有无从得知，别装作知道 */
const UNKNOWN_LIMITS: SandboxLimits = { jobObject: false, memory: false, error: '进程未写出结果，限额状态未知' }

/** stdin 关掉，stdout 我们不看（结果走结果文件），只留 stderr 兜底 */
type PyChild = ChildProcessByStdio<null, Readable, Readable>

function sandboxDir(): string {
  const dir = join(app.getPath('userData'), 'sandbox')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 打包后 runner.py 在 asar 里，Python 读不到，所以一律复制到 userData 再执行。
 * 源文件更新（体积或时间变了）就重新复制，省掉每次运行都写盘。
 */
function ensureRunner(): string {
  const dest = join(sandboxDir(), 'runner.py')
  const candidates = [
    join(process.resourcesPath ?? '', 'sandbox', 'runner.py'),
    // 开发态 __dirname 是 out/main，往上两级就是仓库根
    join(__dirname, '..', '..', 'sandbox', 'runner.py')
  ].filter((p) => Boolean(p) && existsSync(p))
  const src = candidates[0]
  if (!src) throw new Error('找不到沙箱执行器 runner.py，请重新安装应用')
  const fresh = existsSync(dest) && statSync(dest).size === statSync(src).size && statSync(dest).mtimeMs >= statSync(src).mtimeMs
  if (!fresh) copyFileSync(src, dest)
  return dest
}

export function workspaceDir(sessionId: number): string {
  const dir = join(app.getPath('userData'), 'workspaces', `session-${sessionId}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

interface LiveRun {
  child: PyChild
  /** 手动停止和内存被杀要给出不同解释，不能让上层猜 */
  killed: boolean
}

const running = new Map<number, LiveRun>()

export function isBusy(sessionId: number): boolean {
  return running.has(sessionId)
}

export function stop(sessionId: number): boolean {
  const live = running.get(sessionId)
  if (!live) return false
  live.killed = true
  killTree(live.child.pid)
  return true
}

/** py 启动器会再生出一个 python 子进程，只 kill 父进程会留下跑飞的孤儿 */
export function killTree(pid: number | undefined): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    /* 进程已经退出 */
  }
}

/** 只透传解释器自身需要的变量，别把会话里的 API Key 之类带进子进程 */
function childEnv(workspace: string): NodeJS.ProcessEnv {
  const keep = ['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LANG', 'HOME']
  const env: NodeJS.ProcessEnv = {}
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]
  return {
    ...env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    MPLBACKEND: 'Agg',
    MPLCONFIGDIR: join(workspace, '.mplconfig')
  }
}

function asPlotMeta(v: unknown): PlotMeta | undefined {
  if (!v || typeof v !== 'object') return undefined
  const p = v as Record<string, unknown>
  const axes = Array.isArray(p.axes)
    ? p.axes
        .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
        .map((a) => ({
          xlabel: String(a.xlabel ?? ''),
          ylabel: String(a.ylabel ?? ''),
          title: String(a.title ?? ''),
          legend: Boolean(a.legend),
          curves: Number(a.curves ?? 0)
        }))
    : []
  return { dpi: Number(p.dpi ?? 0), figWidth: Number(p.figWidth ?? 0), figHeight: Number(p.figHeight ?? 0), axes }
}

function asArtifacts(v: unknown): ArtifactInfo[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .map((a) => {
      const px = Array.isArray(a.px) ? a.px.map(Number) : undefined
      const info: ArtifactInfo = {
        name: String(a.name ?? ''),
        ext: String(a.ext ?? ''),
        size: Number(a.size ?? 0),
        inline: Boolean(a.inline),
        dataUrl: typeof a.dataUrl === 'string' ? a.dataUrl : undefined
      }
      const meta = asPlotMeta(a.plotMeta)
      if (meta) info.plotMeta = meta
      if (px && px.length === 2 && px.every((n) => Number.isFinite(n))) info.px = [px[0] as number, px[1] as number]
      return info
    })
    .filter((a) => a.name.length > 0 && a.name === basename(a.name))
}

function failed(message: string, type: string, limits: SandboxLimits): RunOutcome {
  const error: SandboxError = { type, message, traceback: '' }
  return { ok: false, stdout: '', stderr: '', error, durationMs: 0, limits, artifacts: [] }
}

/** runner 正常写回了结果就用它，没写回（超时/被杀）才用兜底说明 */
function parseOutcome(resultPath: string, fallback: RunOutcome): RunOutcome {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(resultPath, 'utf8'))
  } catch {
    return fallback
  }
  const p = raw as Record<string, unknown>
  const e = p.error as Record<string, unknown> | undefined
  return {
    ok: Boolean(p.ok),
    stdout: String(p.stdout ?? ''),
    stderr: String(p.stderr ?? ''),
    error: e ? { type: String(e.type ?? 'Error'), message: String(e.message ?? ''), traceback: String(e.traceback ?? '') } : null,
    durationMs: Number(p.durationMs ?? 0),
    limits: (p.limits as SandboxLimits | undefined) ?? fallback.limits,
    artifacts: asArtifacts(p.artifacts),
    artifactError: p.artifactError ? String(p.artifactError) : undefined
  }
}

export interface RunAttempt {
  outcome: RunOutcome
  timedOut: boolean
  killedByUser: boolean
  exitCode: number | null
  durationMs: number
}

export async function runCode(sessionId: number, code: string): Promise<RunAttempt> {
  // 探测是异步的，运行前先确保它跑完，否则启动后第一次运行会误报"未探测到 Python"
  await detectToolchain()
  const py = pythonInvocation()
  if (!py) return Promise.reject(new Error('未探测到 Python，请先安装 Python 3 后重启应用'))
  if (isBusy(sessionId)) return Promise.reject(new Error('上一次运行还没结束'))
  const src = code.trim()
  if (!src) return Promise.reject(new Error('代码为空'))
  if (src.length > MAX_CODE_CHARS) return Promise.reject(new Error('代码过长，请拆分后再运行'))

  let runner: string
  try {
    runner = ensureRunner()
  } catch (e) {
    return Promise.reject(e as Error)
  }

  const workspace = workspaceDir(sessionId)
  const tag = randomUUID().slice(0, 8)
  const jobPath = join(workspace, `.mt-job-${tag}.json`)
  const resultPath = join(workspace, `.mt-result-${tag}.json`)
  writeFileSync(jobPath, JSON.stringify({ code: src, workspace, resultPath, memMb: MEM_MB }), 'utf8')

  const startedAt = Date.now()
  return new Promise<RunAttempt>((resolve) => {
    let child: PyChild
    try {
      child = spawn(py.command, [...py.args, runner, jobPath], {
        cwd: workspace,
        env: childEnv(workspace),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (e) {
      resolve({ outcome: failed(`启动 Python 失败：${(e as Error).message}`, 'SpawnFailed', UNLIMITED), timedOut: false, killedByUser: false, exitCode: null, durationMs: 0 })
      return
    }

    running.set(sessionId, { child, killed: false })
    let pipe = ''
    child.stderr.on('data', (b: Buffer) => {
      // 正常情况下 stderr 应为空（runner 自己重定向过），非空说明解释器崩了
      pipe = (pipe + b.toString('utf8')).slice(-4000)
    })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
    }, TIMEOUT_MS)

    const finish = (exitCode: number | null): void => {
      clearTimeout(timer)
      const killedByUser = Boolean(running.get(sessionId)?.killed)
      running.delete(sessionId)
      const fallback = timedOut
        ? failed(`超过 ${Math.round(TIMEOUT_MS / 1000)} 秒未结束，已强制终止。常见原因是死循环或数据量过大。`, 'Timeout', UNKNOWN_LIMITS)
        : killedByUser
          ? failed('已手动停止', 'Stopped', UNKNOWN_LIMITS)
          : exitCode === 0
            ? failed('runner 未写出结果文件', 'NoResult', UNKNOWN_LIMITS)
            : failed(`Python 进程异常退出（退出码 ${String(exitCode)}），通常是内存超出 ${MEM_MB}MB 被系统回收。`, 'Crashed', UNKNOWN_LIMITS)
      const outcome = parseOutcome(resultPath, fallback)
      if (!outcome.error && pipe.trim()) outcome.error = { type: 'Stderr', message: pipe.trim(), traceback: '' }
      // 每次运行一套临时文件，用完就清，不然工作区会被 .mt-* 堆满
      for (const p of [jobPath, resultPath]) {
        try {
          rmSync(p, { force: true })
        } catch {
          /* 删不掉不影响结果 */
        }
      }
      resolve({ outcome, timedOut, killedByUser, exitCode, durationMs: Date.now() - startedAt })
    }

    child.on('error', () => finish(null))
    child.on('close', finish)
  })
}

/** 非内联产物（csv / 大图）按需回读，路径锁死在本会话工作区内 */
export function readArtifact(sessionId: number, name: string): ArtifactContent {
  const safe = basename(String(name))
  if (!safe || safe.startsWith('.mt-')) throw new Error('文件名不合法')
  const ext = safe.slice(safe.lastIndexOf('.')).toLowerCase()
  if (!SERVE_EXT.has(ext)) throw new Error('该类型不支持预览')
  const workspace = workspaceDir(sessionId)
  const full = join(workspace, safe)
  if (!existsSync(full)) throw new Error('文件已不在工作区')
  if (statSync(full).size > 20_000_000) throw new Error('文件过大，请到工作区目录查看')
  const buf = readFileSync(full)
  if (ext === '.csv' || ext === '.txt' || ext === '.json') {
    // 表格类给学生看前几百行就够，全量塞进 IPC 只会拖慢渲染
    const text = buf.toString('utf8')
    return { size: buf.length, text: text.length > 20_000 ? `${text.slice(0, 20_000)}\n…（共 ${text.length} 字，已截断）` : text }
  }
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'application/octet-stream'
  return { size: buf.length, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
}
