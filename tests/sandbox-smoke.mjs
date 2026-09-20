/**
 * 沙箱冒烟：验证策略与限额，两层一起测。
 * - Python 层：spawn sandbox/runner.py（job -> result 协议与主进程完全一致）
 * - Node 层：墙钟超时用 taskkill /T /F 终止进程树（src/main/sandbox/index.ts 同机制）
 * 运行：npm run smoke:sandbox   （需本机有 Python 3.12+）
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RUNNER = join(process.cwd(), 'sandbox', 'runner.py')
const results = []
let pyCmd

function detectPython() {
  if (pyCmd !== undefined) return pyCmd
  const candidates =
    process.platform === 'win32'
      ? [
          { command: 'py', args: ['-3.12'] },
          { command: 'py', args: ['-3'] },
          { command: 'python', args: [] }
        ]
      : [
          { command: 'python3', args: [] },
          { command: 'python', args: [] }
        ]
  pyCmd =
    candidates.find(
      (c) => spawnSync(c.command, [...c.args, '-c', 'pass'], { windowsHide: true }).status === 0
    ) ?? null
  return pyCmd
}

function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** 跑一段代码，返回 { outcome, exitCode, timedOut, killed } */
function exec(code, { memMb = 1024, wallMs = 20000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mt-sbx-'))
  // 和主进程一样用 .mt- 前缀，runner 会跳过这些文件，不把协议文件当学习产物
  const jobPath = join(dir, '.mt-job.json')
  const resultPath = join(dir, '.mt-result.json')
  writeFileSync(jobPath, JSON.stringify({ code, workspace: dir, resultPath, memMb }), 'utf8')
  const py = detectPython()
  if (!py) {
    console.error('未探测到可用的 Python，跳过沙箱冒烟')
    process.exitCode = 1
    return Promise.resolve({ outcome: null, exitCode: null, timedOut: false, stderr: '' })
  }
  return new Promise((resolve) => {
    const child = spawn(py.command, [...py.args, RUNNER, jobPath], {
      cwd: dir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr.on('data', (b) => (stderr = (stderr + b.toString()).slice(-4000)))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
      } else {
        child.kill('SIGKILL')
      }
    }, wallMs)
    child.once('close', (exitCode) => {
      clearTimeout(timer)
      let outcome = null
      try {
        outcome = JSON.parse(readFileSync(resultPath, 'utf8'))
      } catch {
        outcome = null
      }
      // 顺手把 node 侧的墙钟 kill 也验证了：超时用例必须真的没有结果文件
      rmSync(dir, { recursive: true, force: true })
      resolve({ outcome, exitCode, timedOut, stderr })
    })
  })
}

const errType = (r) => r.outcome?.error?.type ?? ''
const errMsg = (r) => r.outcome?.error?.message ?? ''

async function main() {
  // 1. 正常出图：产物里要有内联 PNG
  const plot = await exec(
    [
      'import numpy as np, matplotlib.pyplot as plt',
      "x = np.linspace(0, 3, 50)",
      "plt.plot(x, np.sin(x)); plt.title('灵敏度曲线'); plt.savefig('curve.png')",
      "print('sum=', x.sum())"
    ].join('\n')
  )
  check('正常出图可执行', plot.outcome?.ok === true, `stdout=${JSON.stringify(plot.outcome?.stdout?.trim())}`)
  const png = (plot.outcome?.artifacts ?? []).find((a) => a.name === 'curve.png')
  check('图表作为内联产物回传', Boolean(png?.inline) && String(png?.dataUrl ?? '').startsWith('data:image/png'), `size=${png?.size}`)
  check(
    '中文标题不炸字体',
    !errMsg(plot).includes('Glyph') && !errMsg(plot).includes('missing from'),
    errMsg(plot).slice(0, 80)
  )

  // 2. pandas 这类科学计算栈不能被策略误伤
  const pd = await exec("import pandas as pd\nprint(pd.DataFrame({'a':[1,2,3]}).sum().to_dict())")
  check('pandas 可用', pd.outcome?.ok === true && pd.outcome.stdout.includes('6'), errMsg(pd).slice(0, 80))

  // 3. 网络：直接 import 与绕过 import 都要拦
  const net = await exec("import socket\nprint(socket.create_connection(('1.1.1.1', 443), 3))")
  check('禁止联网', errType(net) === 'PermissionError', errMsg(net).slice(0, 60))
  const dns = await exec("import socket\nprint(socket.getaddrinfo('example.com', 443))")
  check('禁止 DNS 解析', errType(dns) === 'PermissionError', errMsg(dns).slice(0, 60))
  const bypass = await exec(
    "import importlib\nm = importlib.import_module('socket')\nprint(m.socket().connect(('1.1.1.1', 443)))"
  )
  check('importlib 绕过 import 仍拦得住操作', errType(bypass) === 'PermissionError', errMsg(bypass).slice(0, 60))

  // 4. 子进程
  const sub = await exec("import subprocess\nprint(subprocess.run(['cmd','/c','whoami']))")
  check('禁止子进程', errType(sub) === 'PermissionError', errMsg(sub).slice(0, 60))
  const subBypass = await exec(
    "import importlib\nm = importlib.import_module('subprocess')\nprint(m.run(['cmd','/c','whoami']))"
  )
  check('importlib 绕过的子进程同样拦得住', errType(subBypass) === 'PermissionError', errMsg(subBypass).slice(0, 60))

  // 5. ctypes：动态库加载是唯一能力来源
  const ct = await exec("import ctypes\nprint(ctypes.windll.kernel32.GetCurrentProcess())")
  check('禁止 ctypes 加载动态库', errType(ct) === 'PermissionError', errMsg(ct).slice(0, 60))

  // 6. 内存上限由 Job Object 执行，超限必须是 MemoryError 而不是把机器拖死
  const mem = await exec('x = bytearray(600 * 1024 * 1024)\nprint(len(x))', { memMb: 256 })
  check(
    '内存超限被拦',
    errType(mem) === 'MemoryError' && mem.outcome?.limits?.memory === true,
    `type=${errType(mem)} limits=${JSON.stringify(mem.outcome?.limits)}`
  )

  // 7. 文件只能写进工作区
  const escape = await exec("open(r'C:\\Windows\\Temp\\mt-pwn.txt', 'w').write('x')")
  check('禁止越目录写入', errType(escape) === 'PermissionError', errMsg(escape).slice(0, 60))
  const inner = await exec("open('out.csv','w').write('a,b\\n1,2\\n')\nprint('wrote')")
  const csv = (inner.outcome?.artifacts ?? []).find((a) => a.name === 'out.csv')
  check('工作区写入正常并登记产物', inner.outcome?.ok === true && Boolean(csv), errMsg(inner).slice(0, 60))

  // 8. 死循环：Job Object 给不了 CPU 限额，靠 node 侧墙钟 kill 兜底
  const loop = await exec('while True:\n    pass', { wallMs: 5000 })
  check(
    '死循环被墙钟超时终止',
    loop.timedOut === true && loop.outcome === null && loop.exitCode !== 0,
    `timedOut=${loop.timedOut} exit=${String(loop.exitCode)}`
  )

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) {
    console.log('失败：' + failed.map((r) => r.name).join('、'))
    process.exitCode = 1
  }
}

void main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})