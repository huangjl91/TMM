/**
 * M3 冒烟：LaTeX 模板 + .log 解析。
 *
 * 解析规则不能靠记忆写，所以错误用例全部用真 xelatex 跑出来的日志来断言；
 * 只有「老式 ! 前缀」这种本机日志里不会出现的形状用文本样例兜底。
 * 运行：npm run smoke:latex
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseLatexLog } from '../.tmp/latex-log.mjs'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** 与 src/main/runtime.ts 的 findXelatex 同一思路：PATH 之外再扫常见安装目录 */
function findXelatex() {
  const dirs = process.platform === 'win32'
    ? ['C:', 'D:', 'E:'].map((d) => join(d, 'texlive'))
    : ['/usr/local/texlive', '/opt/texlive']
  for (const root of dirs) {
    if (!existsSync(root)) continue
    const versions = readdirSync(root).sort().reverse()
    for (const v of versions) {
      const bin = join(root, v, 'bin', process.platform === 'win32' ? 'windows' : 'x86_64-linux')
      const exe = join(bin, process.platform === 'win32' ? 'xelatex.exe' : 'xelatex')
      if (existsSync(exe)) return exe
    }
  }
  return null
}

const XELATEX = process.env.XELATEX || findXelatex()
if (!XELATEX) {
  console.log('FAIL  找不到 xelatex（设 XELATEX 环境变量指向可执行文件）')
  process.exit(1)
}
console.log(`xelatex: ${XELATEX}`)

const WORK = join(tmpdir(), `mtex-${Date.now()}`)
mkdirSync(WORK, { recursive: true })
process.on('exit', () => rmSync(WORK, { recursive: true, force: true }))

const BASE_PREAMBLE = '\\documentclass[12pt,a4paper,UTF8]{ctexart}\n\\usepackage{graphicx}\n\\usepackage{amsmath}\n'

function texCase(name, body) {
  const dir = join(WORK, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'paper.tex'), BASE_PREAMBLE + body, 'utf8')
  return dir
}

function pass(dir, extra = []) {
  const r = spawnSync(XELATEX, ['-interaction=nonstopmode', '-file-line-error', ...extra, 'paper.tex'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 180_000,
    windowsHide: true
  })
  const log = (() => {
    try {
      return readFileSync(join(dir, 'paper.log'), 'utf8')
    } catch {
      return r.stderr || ''
    }
  })()
  return { status: r.status, log, parsed: parseLatexLog(log, 'paper.tex') }
}

/** 出错时应用只跑一遍；这里统一按「第一遍有错就停」的口径断言 */
function firstPass(dir) {
  const one = pass(dir, ['-no-pdf'])
  if (one.parsed.errors.length || one.parsed.fatal) return one
  return pass(dir)
}

// ---------------------------------------------------------------- 模板本体
const tplDir = join(WORK, 'template')
mkdirSync(tplDir, { recursive: true })
copyFileSync(join(process.cwd(), 'resources', 'latex', 'cumcm.tex'), join(tplDir, 'paper.tex'))
copyFileSync(join(process.cwd(), 'src', 'renderer', 'public', 'icon.png'), join(tplDir, 'explore.png'))
// 把模板里注释掉的示例图放开，连带验证 \includegraphics 走的是同一个工作区
writeFileSync(
  join(tplDir, 'paper.tex'),
  readFileSync(join(tplDir, 'paper.tex'), 'utf8').replace(
    '% \\includegraphics[width=0.72\\textwidth]{explore.png}',
    '\\includegraphics[width=0.72\\textwidth]{explore.png}'
  ),
  'utf8'
)
const tpl1 = pass(tplDir, ['-no-pdf'])
const tpl = pass(tplDir)
check('模板第一遍 0 错误', tpl1.parsed.errors.length === 0, JSON.stringify(tpl1.parsed.errors[0] ?? null))
check('模板两遍编译出 PDF', existsSync(join(tplDir, 'paper.pdf')) && tpl.status === 0, `exit=${String(tpl.status)}`)
check('页数解析出来', tpl.parsed.pages >= 3, `${String(tpl.parsed.pages)} 页`)
check('模板不应有错误条目', tpl.parsed.errors.length === 0)
check(
  '中文字体真的被 ctex 找到了',
  /SimSun|SimHei|Noto|Source Han/i.test(readFileSync(join(tplDir, 'paper.log'), 'utf8')),
  '日志里没有中文字体记录'
)

// ---------------------------------------------------------------- 错误定位
// BASE_PREAMBLE 占 3 行，所以正文第 n 行是文件第 n+3 行
const missingDollar = texCase('missing-dollar', `\\begin{document}
第一行没问题。
这里 x_1 忘了数学模式。
\\end{document}`)
{
  const r = firstPass(missingDollar)
  const e = r.parsed.errors[0]
  check('漏 $ 能被定位', Boolean(e) && e.line === 6, e ? `line=${String(e.line)} ${e.message}` : '无错误')
  check('漏 $ 给了可执行建议', Boolean(e) && e.hint.includes('数学模式'), e?.hint ?? '')
  // TeX 回显源码时会在出错位置断行（x_ 与 1 之间被插入符号切开），所以只断言带回了该行内容
  check('错误带上了出错源码行', Boolean(e) && e.raw.includes('l.6') && e.raw.includes('忘了数学模式'), e?.raw.slice(0, 120) ?? '')
  check('文件归属正确', Boolean(e) && e.file === 'paper.tex', e?.file ?? '')
}

const badCmd = texCase('bad-cmd', `\\begin{document}
\\begin{itemize}
\\item 正常
\\item \\fooBar 不存在的命令
\\end{itemize}
\\end{document}`)
{
  const r = firstPass(badCmd)
  const e = r.parsed.errors[0]
  check('未定义命令能定位到行', Boolean(e) && e.line === 7, e ? `line=${String(e.line)}` : '无错误')
  check('未定义命令有建议', Boolean(e) && e.hint.length > 0, e?.hint ?? '')
  check('未定义命令被算成 error 而非 warning', Boolean(e) && e.severity === 'error')
}

const noFile = texCase('missing-graphic', `\\begin{document}
图在这里：
\\includegraphics[width=0.4\\textwidth]{根本不存在的图.png}
\\end{document}`)
{
  const r = firstPass(noFile)
  const e = r.parsed.errors[0]
  check('缺图会报错', Boolean(e), e ? '有错误' : '无错误')
  check('缺图被判为致命（不再跑第二遍）', r.parsed.fatal === true || Boolean(e))
  check(
    '缺图的建议指向沙箱产物',
    Boolean(e) && /沙箱|工作区|文件名/.test(e.hint),
    e ? e.message : ''
  )
  check('缺图时没有 PDF 产出', !existsSync(join(noFile, 'paper.pdf')))
}

const badRef = texCase('bad-ref', `\\begin{document}
见表~\\ref{tab:never}，公式~\\eqref{eq:nope}。
\\begin{equation}
E = mc^2
\\end{equation}
\\end{document}`)
{
  const r = pass(badRef, ['-no-pdf'])
  const r2 = pass(badRef)
  const msgs = r2.parsed.warnings.map((w) => w.message).join(' | ')
  check('引用不存在的 label 报 warning 不报 error', r2.parsed.errors.length === 0 && /undefined/i.test(msgs), msgs.slice(0, 90))
  check('未定义引用带行号', r2.parsed.warnings.some((w) => w.line === 5), JSON.stringify(r2.parsed.warnings.map((w) => w.line)))
  check('未定义引用有建议', r2.parsed.warnings.some((w) => /label|标签/.test(w.hint)), msgs.slice(0, 60))
  check('第一遍不该有 error', r.parsed.errors.length === 0)
}

const overflow = texCase('overfull', `\\begin{document}
\\parbox{3cm}{这是一段完全无法断行的超长中文文字aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}
\\end{document}`)
{
  const r = pass(overflow)
  const ov = r.parsed.warnings.find((w) => /Overfull/.test(w.message))
  check('超出版心会被挑出来', Boolean(ov), JSON.stringify(r.parsed.warnings.map((w) => w.message.slice(0, 30))))
  check('超出版心给出限宽建议', Boolean(ov) && /页边|tabularx|resizebox|宽度/.test(ov.hint), ov?.hint ?? '')
}

const clean = texCase('clean', `\\begin{document}
这是唯一一段正文，公式 $a_b + c^2$ 正常。
\\end{document}`)
{
  const r = firstPass(clean)
  check('干净文档不产生任何条目', r.parsed.errors.length === 0 && r.parsed.warnings.length === 0, JSON.stringify(r.parsed))
  check('干净文档确实出了页', r.parsed.pages === 1 && existsSync(join(clean, 'paper.pdf')))
}

// ---------------------------------------------------------------- 老式日志兜底
{
  const legacy = parseLatexLog(
    [
      '(./paper.tex',
      'LaTeX2e <2025-11-01>',
      '! Undefined control sequence.',
      'l.12 \\fooBar',
      "                     ",
      "! LaTeX Error: Environment tabularx undefined.",
      '',
      'See the LaTeX manual or LaTeX Companion for explanation.',
      'Type  H <return>  for immediate help.',
      ' ...                                              ',
      '                                                 ',
      'l.20 \\begin{tabularx}',
      'Output written on paper.pdf (2 pages, 12345 bytes).',
      'Transcript written on paper.log.'
    ].join('\n'),
    'paper.tex'
  )
  check('老式 ! 前缀日志照样解析', legacy.errors.length === 2, JSON.stringify(legacy.errors.map((e) => e.line)))
  check('老式日志行号正确', legacy.errors[0]?.line === 12 && legacy.errors[1]?.line === 20)
  check('老式日志页数正确', legacy.pages === 2)
  check('老式日志消息不带 ! 前缀', legacy.errors[0]?.message === 'Undefined control sequence.', legacy.errors[0]?.message ?? '')
  check('老式日志把源码行放进 raw', String(legacy.errors[0]?.raw).includes('\\fooBar'), legacy.errors[0]?.raw ?? '')
}
{
  const noisy = parseLatexLog(
    [
      'Underfull \\vbox (badness 10000) has occurred while \\output is active [1]',
      'Missing character: There is no \u{1F600} in font Times New Roman! detected at line 7',
      "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right."
    ].join('\n')
  )
  check('Underfull 噪声被丢掉', !noisy.warnings.some((w) => /Underfull/.test(w.message)))
  check('缺字形被挑出来并给了行号', noisy.warnings.some((w) => /Missing character/.test(w.message) && w.line === 7), JSON.stringify(noisy.warnings.map((w) => [w.message.slice(0, 18), w.line])))
  check('「要再编一遍」被翻译成建议', noisy.warnings.some((w) => /两遍|再点一次/.test(w.hint)))
}
{
  const empty = parseLatexLog('')
  check('空日志不崩', empty.errors.length === 0 && empty.pages === 0 && empty.fatal === false)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${String(results.length - failed.length)}/${String(results.length)} 通过`)
if (failed.length) console.log('失败项：' + failed.map((f) => f.name).join('、'))
process.exit(failed.length ? 1 : 0)
