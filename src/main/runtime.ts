import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getDbFile } from './db'
import type { RuntimeInfo } from '../shared/types'

export interface PythonInvocation {
  command: string
  args: string[]
}

interface PyProbe extends PythonInvocation {
  exe: string
  version: string
  numpy: boolean
  matplotlib: boolean
}

let cached: RuntimeInfo | null = null
let cachedPy: PyProbe | null = null
let cachedTex: string | null = null
let probing: Promise<RuntimeInfo> | null = null

/** sys.executable 才是真身：py 启动器只是个转发器，直接用绝对路径才不会被别名绕进另一个环境 */
const PROBE = [
  'import json, sys, os',
  'out = {"exe": os.path.realpath(sys.executable), "version": ".".join(map(str, sys.version_info[:3]))}',
  'for m in ("numpy", "matplotlib"):',
  '    try:',
  '        __import__(m)',
  '        out[m] = True',
  '    except Exception:',
  '        out[m] = False',
  'print(json.dumps(out))'
].join('\n')

function candidates(): PythonInvocation[] {
  return process.platform === 'win32'
    ? [
        { command: 'py', args: ['-3.12'] },
        { command: 'py', args: ['-3.13'] },
        { command: 'py', args: ['-3'] },
        { command: 'python', args: [] },
        { command: 'python3', args: [] }
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] }
      ]
}

function runProbe(inv: PythonInvocation, timeout: number): Promise<PyProbe> {
  return new Promise((resolve, reject) => {
    execFile(
      inv.command,
      [...inv.args, '-c', PROBE],
      { encoding: 'utf8', timeout, windowsHide: true },
      (err, stdout) => {
        if (err) return reject(err)
        try {
          const line = stdout.trim().split(/\r?\n/).pop() ?? ''
          const p = JSON.parse(line) as Record<string, string | boolean>
          resolve({
            ...inv,
            exe: String(p.exe),
            version: String(p.version),
            numpy: p.numpy === true,
            matplotlib: p.matplotlib === true
          })
        } catch (e) {
          reject(e as Error)
        }
      }
    )
  })
}

function which(cmd: string): string | null {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true
    })
    const first = out.split(/\r?\n/).find((l) => l.trim())
    return first ? first.trim() : null
  } catch {
    return null
  }
}

/**
 * TeX Live 在 Windows 上默认不进 PATH（安装器只写了注册表），只 `where` 一次会
 * 把装了 TeX 的机器误判成「没装」，所以再按常见安装目录扫一遍，取年份最新的。
 */
function findXelatex(): string | null {
  const onPath = which('xelatex')
  if (onPath) return onPath
  const roots: string[] = []
  if (process.platform === 'win32') {
    for (const d of ['C:', 'D:', 'E:']) roots.push(join(d, 'texlive'))
    const local = process.env.LOCALAPPDATA
    if (local) roots.push(join(local, 'Programs', 'MiKTeX'))
    roots.push(join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'MiKTeX'))
  } else {
    roots.push('/usr/local/texlive', '/opt/texlive', join(app.getPath('home'), 'texlive'))
  }
  const found: string[] = []
  for (const root of roots) {
    let versions: string[] = []
    try {
      versions = readdirSync(root)
    } catch {
      continue
    }
    for (const v of versions.sort().reverse()) {
      const bins = process.platform === 'win32' ? [join(root, v, 'bin', 'windows')] : readdirSafe(join(root, v, 'bin'))
      for (const bin of bins) {
        const exe = join(bin, process.platform === 'win32' ? 'xelatex.exe' : 'xelatex')
        if (existsSync(exe)) found.push(exe)
      }
    }
  }
  return found[0] ?? null
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

function labelOf(p: PyProbe | null): string | null {
  if (!p) return null
  // 右栏很窄，版本号放前面才看得见，完整路径留给 hover
  return p.numpy && p.matplotlib
    ? `Python ${p.version} · ${p.exe}`
    : `Python ${p.version} · 缺 numpy/matplotlib · ${p.exe}`
}

function info(python: string | null, xelatex: string | null): RuntimeInfo {
  return {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    dbPath: getDbFile(),
    sandboxRoot: join(app.getPath('userData'), 'workspaces'),
    python,
    pythonReady: Boolean(cachedPy?.numpy && cachedPy?.matplotlib),
    xelatex
  }
}

/**
 * 异步探测，绝不在窗口显示路径上阻塞。
 * 本机常装多个 Python（py 别名、Store 版、conda），谁带 matplotlib 就用谁。
 */
export function detectToolchain(): Promise<RuntimeInfo> {
  if (cached) return Promise.resolve(cached)
  if (probing) return probing
  probing = (async () => {
    cachedTex = findXelatex()
    const probes = candidates().map((c) => runProbe(c, 20_000))
    const settled = await Promise.allSettled(probes)
    const found = settled.filter((s) => s.status === 'fulfilled').map((s) => (s as PromiseFulfilledResult<PyProbe>).value)
    // 全都没探测到时也要留一个可报错的对象，别让"未探测到"掩盖真实原因
    cachedPy = found.find((p) => p.numpy && p.matplotlib) ?? found[0] ?? null
    if (!cachedPy && found.length === 0) console.warn('Python 探测失败：候选解释器全部不可用')
    cached = info(labelOf(cachedPy), cachedTex)
    return cached
  })()
  return probing
}

export function pythonInvocation(): PythonInvocation | null {
  return cachedPy ? { command: cachedPy.exe, args: [] } : null
}

/** 编译前调用；探测还没跑完时返回 null，调用方自己决定要不要等 */
export function xelatexPath(): string | null {
  return cachedTex
}

export function runtimeInfo(): RuntimeInfo {
  return cached ?? info(null, null)
}
