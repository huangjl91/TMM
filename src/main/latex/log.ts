import type { LatexIssue } from '../../shared/latex'

/**
 * XeLaTeX 的 .log 解析。
 *
 * 只做两件事：把「编译失败的原因」定位到源码行，把「能过但会被扣分的问题」
 * 挑出来。日志格式是隐式的（TeX 没有正式规范），所以每条规则都配一组真实
 * 样例做冒烟，解析不出来就退回原始日志片段，不猜。
 *
 * 行号取自 `l.N`。本应用单文件编译（论文就是一个 paper.tex），所以行号一定
 * 属于源码本身；学生若日后 \input 拆分章节，最深一层的行号会归属另一个文件，
 * 那时再补文件名跟踪。
 */

export interface LogParse {
  errors: LatexIssue[]
  warnings: LatexIssue[]
  pages: number
  /** Emergency stop / No pages of output：后面再编也没意义 */
  fatal: boolean
}

/** 明确不告诉学生的噪声：Underfull 只是排版松散，几乎每篇都有，报了只会淹没真问题 */
const IGNORED = /^Underfull\b/

const ERROR_HEAD = /^!\s/
/**
 * 编译时带了 -file-line-error，所以绝大多数错误长这样：
 *   ./paper.tex:12: Undefined control sequence.
 *   ./paper.tex:42: LaTeX Warning: Reference `fig:x' on page 1 undefined on input line 42.
 * 没有这个前缀的老式 `! ` 输出也继续支持（MiKTeX 或学生自己命令行编译时）。
 */
const FILE_LINE = /^(?:\.?\.?[/\\])?([^:\r\n]*\.tex):(\d+):\s+(.*)$/
/** 报错块的结束标记：拿到行号就收，或者撞上下一条错误 */
const LINE_NO = /^l\.(\d+)/
/** file-line-error 格式下，`l.N` 之前可能夹着 <to be read again> 之类的上下文块 */
const CONTEXT_WINDOW = 6
const BLOCK_START = /^<[a-z*]+>/
/** 分页信息：注意一页时 TeX 写的是 "1 page"，不带 s */
const PAGES = /Output written on .*\((\d+) pages?/i
const NO_OUTPUT = /No pages of output/i
const EMERGENCY = /Emergency stop/i

/** 消息到建议的映射：命中才给建议，宁可少说不要说错 */
const HINTS: Array<[RegExp, string]> = [
  [/Missing \$ inserted/i, '公式里的 _ ^ & # 只能在数学模式中出现：把这段放进 $...$，或者写成 \\_ 这样的转义形式。'],
  [/Unable to load picture|Couldn't read (?:graphic|picture|file)|Graphic file \(type/i, '这张图读不出来：图必须是会话工作区里真实存在的文件（Python 沙箱里 savefig 用文件名即可），\\includegraphics 写的名字要和它完全一致。'],
  [/not found\./i, '引用的文件不在会话工作区里。图要先在 Python 沙箱里跑出来，文件名要和 \\includegraphics 里写的完全一致（含扩展名）。'],
  [/Undefined control sequence/i, '这个命令不存在：检查拼写，或者开头漏了对应的 \\usepackage。中文标点在公式里也会报这个错。'],
  [/Environment .{1,40} undefined/i, '环境名没有对应的定义：\\begin 与 \\end 要成对且拼写一致，表格类环境需要相应宏包。'],
  [/Runaway argument|Missing \\end[{| ]|Too many .*brackets|Can't figure out slogan/i, '括号或环境没闭合：从报错行往上找那个还没关掉的环境。'],
  [/Extra .*/i, '多出来一个闭合记号：通常是上面少写了 { 或 \\begin，也可能这里多写了 } 或 \\end。'],
  [/Paragraph ended before .*(was|to) be|Missing .*(inserted)/i, '命令少参数或参数里的括号没闭合：看报错行那个命令需要几个参数。'],
  [/Reference .*undefined/i, '\\ref/\\eqref 指向的 \\label 不存在：核对标签名是否完全一致，或者这个标签所在环境其实没编译到。'],
  [/Citation .*undefined/i, '正文 \\cite 的键在参考文献列表里没有对应条目：补 \\bibitem，或者删掉这个引用。'],
  [/Missing character/i, '当前字体里没有这个字形（生僻字、全角符号或 emoji 常见）：换个字体，或把该字符改成文字/图片。'],
  [/Label\(s\) may have changed|Rerun to get/i, '交叉引用需要连编两遍才稳定：再点一次编译。'],
  [/File .*not found/i, '缺文件：图或样式文件不在工作区。图先在沙箱生成，文件名严格一致。'],
  [/\bCTEX\b.*font|CJK (family|font).*not/i, '找不到中文字体：TeX Live 需要带 ctex 且系统装了宋体/黑体。别在模板里写死字体名。'],
  [/Overfull \\hbox/i, '内容超出页边距（这是评阅时最扎眼的问题之一）：表格用 tabularx/\\resizebox 限宽，长公式拆行，长图缩到 \\textwidth 以内。'],
  [/Overfull \\vbox/i, '这一页排不下：图或表太大，缩小或者允许它浮动到下一页。'],
  [/Float too large|too large for page/i, '图/表比页面还高：给 \\includegraphics 加 width=0.7\\textwidth 之类的限制。'],
  [/No pages of output|Emergency stop/i, '这一遍没有任何页面产出：先修掉上面第一条错误，后面的错误多半是它连锁引起的。']
]

function hintFor(message: string, raw: string): string {
  const hay = `${message}\n${raw}`
  for (const [re, hint] of HINTS) if (re.test(hay)) return hint
  return ''
}

/** 去掉 TeX 日志里的换行续行与左边距，让消息能读 */
function tidy(text: string): string {
  return text.replace(/\(\w+\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseErrorBlock(lines: string[], from: number, file: string): { issue: LatexIssue; next: number } {
  const head = (lines[from] ?? '').replace(/^!\s*/, '')
  /** 消息正文（折行拼起来）与日志原文（含 l.N 上下文）分开攒 */
  const cont: string[] = []
  const rawParts: string[] = [lines[from] ?? '']
  let line = 0
  let i = from + 1
  for (; i < lines.length && cont.length + rawParts.length < 14; i++) {
    const cur = lines[i] ?? ''
    const m = cur.match(LINE_NO)
    if (m) {
      line = Number(m[1])
      rawParts.push(cur)
      const echo = (lines[i + 1] ?? '').trim()
      if (echo) rawParts.push(echo)
      i++
      break
    }
    if (ERROR_HEAD.test(cur) || BLOCK_START.test(cur)) break
    rawParts.push(cur)
    // 消息可能折行：上一条没句号、这条不是解释性套话，就当作同一句
    if (
      cur.trim() &&
      !/[.!?]$/.test(head + cont.join(' ')) &&
      !/^See the /i.test(cur) &&
      !/^Type /i.test(cur) &&
      !/^\s*\.\.\.\s*$/.test(cur)
    ) {
      cont.push(cur)
    }
  }
  const message = tidy([head, ...cont].join(' '))
  const raw = rawParts.join('\n')
  return {
    issue: {
      severity: 'error',
      line,
      file,
      message: message || head.trim(),
      hint: hintFor(message, raw),
      raw: raw.slice(0, 800)
    },
    next: i
  }
}

function parseWarningLine(cur: string, file: string): LatexIssue | null {
  if (cur.startsWith('Overfull') || cur.startsWith('Underfull')) {
    if (IGNORED.test(cur)) return null
    const range = cur.match(/at lines (\d+)(?:--(\d+))?/)
    return {
      severity: 'warning',
      line: range ? Number(range[1]) : 0,
      lineEnd: range?.[2] ? Number(range[2]) : undefined,
      file,
      message: tidy(cur),
      hint: hintFor(cur, cur),
      raw: cur
    }
  }
  const ref = cur.match(/^(LaTeX|LaTeX Font|Package \w+) Warning:\s*(.*)/)
  if (ref) {
    const msg = ref[2] ?? ''
    const onInput = msg.match(/on input line (\d+)/)
    return {
      severity: 'warning',
      line: onInput ? Number(onInput[1]) : 0,
      file,
      message: tidy(msg),
      hint: hintFor(msg, msg),
      raw: cur
    }
  }
  if (cur.startsWith('Missing character:')) {
    const line = cur.match(/detected at line (\d+)/)
    return {
      severity: 'warning',
      line: line ? Number(line[1]) : 0,
      file,
      message: tidy(cur),
      hint: hintFor(cur, cur),
      raw: cur
    }
  }
  // fontspec/ctex 第一次建字体族时会 dump 一大段信息，全都不是学生要处理的问题
  return null
}

/** 把 `l.N` 与它下面的源码回显收进 raw，学生点开就能对着看是哪一行 */
function contextAfter(lines: string[], from: number): string {
  const out: string[] = []
  const stop = Math.min(lines.length, from + CONTEXT_WINDOW)
  for (let k = from; k < stop; k++) {
    const l = lines[k] ?? ''
    if (ERROR_HEAD.test(l) || FILE_LINE.test(l)) break
    if (LINE_NO.test(l)) {
      out.push(l.trim())
      const echo = (lines[k + 1] ?? '').trim()
      if (echo) out.push(echo)
      break
    }
    if (l.trim()) out.push(l.trim())
  }
  return out.join('\n')
}

function fromFileLine(cur: string, fallbackFile: string): LatexIssue | null {
  const m = cur.match(FILE_LINE)
  if (!m) return null
  const name = (m[1] ?? '').split(/[\\/]/).pop() || fallbackFile
  const line = Number(m[2] ?? 0)
  const rest = (m[3] ?? '').trim()
  if (!rest || IGNORED.test(rest)) return null
  const warn = /^(LaTeX|LaTeX Font|Package \w+) Warning:|^(Overfull|Underfull)\b|Warning:/i.test(rest)
  const onInput = rest.match(/on input line (\d+)/)
  const range = rest.match(/at lines (\d+)--(\d+)/)
  return {
    severity: warn ? 'warning' : 'error',
    line: line || (onInput ? Number(onInput[1]) : 0),
    lineEnd: range ? Number(range[2]) : undefined,
    file: name,
    message: tidy(rest),
    hint: hintFor(rest, rest),
    raw: cur
  }
}

export function parseLatexLog(log: string, file = 'paper.tex'): LogParse {
  const lines = log.replace(/\r\n/g, '\n').split('\n')
  const errors: LatexIssue[] = []
  const warnings: LatexIssue[] = []
  let pages = 0
  let fatal = false

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i] ?? ''
    const fl = fromFileLine(cur, file)
    if (fl) {
      if (fl.severity === 'error') {
        fl.raw = `${cur}\n${contextAfter(lines, i + 1)}`.trim()
        errors.push(fl)
      } else {
        warnings.push(fl)
      }
      continue
    }
    if (ERROR_HEAD.test(cur)) {
      const { issue, next } = parseErrorBlock(lines, i, file)
      errors.push(issue)
      i = next - 1
      continue
    }
    if (PAGES.test(cur)) pages = Number(cur.match(PAGES)?.[1] ?? 0)
    if (NO_OUTPUT.test(cur) || EMERGENCY.test(cur)) fatal = true
    const w = parseWarningLine(cur, file)
    if (w) warnings.push(w)
  }

  // 「There were undefined references」这类总结行会重复出现，只留定位得到的
  const seen = new Set<string>()
  const uniqWarnings = warnings.filter((w) => {
    const key = `${w.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { errors, warnings: uniqWarnings, pages, fatal }
}
