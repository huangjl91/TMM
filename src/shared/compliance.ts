import { parseCoachReply, parseScaffold, type MessageKind } from './agent'
import type { CompileResult } from './latex'

/**
 * 《AI 工具使用详情.pdf》的文档生成层：纯函数，不碰 electron / fs。
 * 主进程负责把本机留痕采集成 UsageReport，这里只负责把它排成 XeLaTeX 源。
 * 规定要点、动作中文名、核实清单全部来自 resources/compliance/ai-policy.json，
 * 政策每年改，改那份配置就行，不动这里的代码。
 */

export const USAGE_TEX_FILE = 'ai-usage.tex'
export const USAGE_LOG_FILE = 'ai-usage.log'
export const USAGE_PDF_FILE = 'ai-usage.pdf'
/** 学生另存时建议的文件名：规定要求提交的就是这个名字 */
export const USAGE_EXPORT_NAME = 'AI工具使用详情.pdf'

export interface PolicyConfig {
  scheme: string
  policyName: string
  policyVersion: string
  sourceUrl: string
  updatedOn: string
  requiredItems: string[]
  rules: string[]
  actionLabels: Record<string, string>
  unknownActionLabel: string
  purposes: string[]
  verifyChecklist: string[]
  declaration: string
}

export interface ReportTool {
  appName: string
  appVersion: string
  electron: string
  node: string
  platform: string
  provider: string
  /** 只给主机名：端点地址能说明走的哪家服务，密钥绝不能进这份文件 */
  baseUrlHost: string
  models: string[]
}

export interface ReportStage {
  id: number
  title: string
  status: string
  hintLevel: number
  attempts: number
  score: number | null
  blocking: boolean
}

export interface ReportEvent {
  at: number
  stageId: number | null
  action: string
  level: number | null
  detail: string
  model: string
}

export interface ReportTurn {
  at: number
  role: 'user' | 'assistant'
  kind: MessageKind
  content: string
}

export interface UsageReport {
  sessionId: number
  title: string
  startedAt: number | null
  generatedAt: number
  policy: PolicyConfig
  tool: ReportTool
  stages: ReportStage[]
  events: ReportEvent[]
  turns: ReportTurn[]
  extra: {
    codeRuns: number
    paperSaves: number
    pinnedMethods: string[]
  }
  /** 第 11 阶段任务卡里学生自己写的「记录复核」 */
  review: string
}

/**
 * LaTeX 转义。顺序上必须先把 `\`、`~`、`^` 换成占位符再逃 `&%$#_{}`：
 * 直接产出 `\textbackslash{}` 的话，随后那条给 `{}` 加反斜杠的规则会把宏自己的花括号也逃掉，
 * 正文里就会印出字面的 \textbackslash\{\}。占位符用控制字符，前面已经把控制字符清空了。
 */
const SENTINEL = { bs: '\u0001', tilde: '\u0002', caret: '\u0003' }

export function texEscape(s: string): string {
  let out = String(s ?? '')
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  out = out
    .replace(/\\/g, SENTINEL.bs)
    .replace(/~/g, SENTINEL.tilde)
    .replace(/\^/g, SENTINEL.caret)
    .replace(/([&%$#_{}])/g, '\\$1')
  return out
    .replace(/\u0001/g, '\\textbackslash{}')
    .replace(/\u0002/g, '\\textasciitilde{}')
    .replace(/\u0003/g, '\\textasciicircum{}')
}

/**
 * 正文段落：空行分段，段内换行用 \\ 保住学生原本的排版（代码示例尤其吃这个）。
 * 反斜杠先被 texEscape 变成 \textbackslash，所以这里的换行不会被二次转义。
 */
function texParas(s: string): string {
  return texEscape(s)
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '\\\\\n').trim())
    .filter((p) => p.length > 0)
    .join('\n\n')
}

/**
 * 表格单元格专用：在 longtable / tabularx 里 `\\` 是「结束这一行」而不是换行，
 * 所以留痕里带换行的原文（多行 detail、粘贴出来的标题）必须先压成一行，否则表格会散架。
 */
function texCell(s: string): string {
  return texEscape(s).replace(/\s+/g, ' ').trim()
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtDate(ms: number | null): string {
  if (!ms) return '（未知）'
  return fmtTime(ms).slice(0, 10)
}

const ROLE_LABEL: Record<string, string> = {
  coach: '教练提问',
  scaffold: '示例（需自行改写核实）',
  submission: '任务卡提交',
  system: '系统'
}

/** 学生消息与助手闲聊在库里 kind 都是 chat，必须先按角色分，否则会把学生标成「助手」 */
function turnLabel(t: ReportTurn): string {
  if (t.role === 'user') return t.kind === 'submission' ? '任务卡提交' : '学生'
  return ROLE_LABEL[t.kind] ?? '助手'
}

/** 教练与示例在库里存的是 JSON，落到这份文件里要还原成人能读的样子 */
export function renderTurn(kind: MessageKind, content: string): string {
  const raw = String(content ?? '')
  if (kind === 'coach') {
    const reply = parseCoachReply(raw)
    if (reply) {
      const checks = reply.checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.item}${c.note ? `（${c.note}）` : ''}`)
      return [
        `问题：${reply.next_question}`,
        checks.length ? `检查点：${checks.join('；')}` : '',
        reply.hint ? `提示 L${reply.hint.level}：${reply.hint.text}` : '',
        reply.rubric_score.comments.length ? `评分意见：${reply.rubric_score.comments.join('；')}` : '',
        `评分：${String(reply.rubric_score.total)}/100`,
        reply.blockers ? `进入下一阶段前还缺：${reply.blockers}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    }
  }
  if (kind === 'scaffold') {
    const s = parseScaffold(raw)
    if (s) return `类型：${s.kind === 'code' ? '代码' : '文字'}示例\n\n${s.content}`
  }
  return raw
}

export interface ActionCount {
  action: string
  label: string
  count: number
  lastAt: number
}

/** 导出这一步的返回：编译结果 + 另存到哪了（取消就是 null） */
export interface UsageExportResult extends CompileResult {
  savedTo: string | null
}

export function summarizeEvents(events: ReportEvent[], policy: PolicyConfig): ActionCount[] {
  const by = new Map<string, ActionCount>()
  for (const e of events) {
    const cur = by.get(e.action)
    if (cur) {
      cur.count++
      cur.lastAt = Math.max(cur.lastAt, e.at)
    } else
      by.set(e.action, {
        action: e.action,
        label: policy.actionLabels[e.action] ?? policy.unknownActionLabel,
        count: 1,
        lastAt: e.at
      })
  }
  return [...by.values()].sort((a, b) => a.action.localeCompare(b.action))
}

/** 导出前给学生的体检：哪里对不上规定，面板上直接说清楚 */
export function reportGaps(r: UsageReport): string[] {
  const gaps: string[] = []
  if (!r.turns.length) gaps.push('还没有任何对话记录：这份文件会是空的，先把题目贴进对话建立会话。')
  if (!r.review.trim()) gaps.push('第 11 阶段任务卡的「记录复核」还是空的：规定要求说明哪些结论你已核实，先填这一段。')
  const given = r.events.filter((e) => e.action === 'scaffold_given').length
  const adopted = r.events.filter((e) => e.action === 'scaffold_adopted').length
  if (given > adopted) gaps.push(`示例给过 ${String(given)} 次，只有 ${String(adopted)} 次记为「已采纳」：采纳位置要能对上论文/附录，漏的补上。`)
  const undone = r.stages.filter((s) => s.blocking && s.status !== 'done')
  if (undone.length) gaps.push(`还有强制阶段未完成：${undone.map((s) => s.title).join('、')}。`)
  if (!r.events.some((e) => e.action === 'coach_reply')) gaps.push('没有任何教练提问记录：这份文件说明不了交互过程。')
  return gaps
}

/** 面板上看的体检结果：整份留痕太重，只回统计与缺口，正文留在导出时再生成 */
export interface UsageSummary {
  sessionId: number
  title: string
  startedAt: number | null
  generatedAt: number
  tool: ReportTool
  stages: ReportStage[]
  actions: ActionCount[]
  turns: number
  events: number
  codeRuns: number
  paperSaves: number
  pinnedMethods: string[]
  review: string
  gaps: string[]
}

export function summarizeReport(r: UsageReport): UsageSummary {
  return {
    sessionId: r.sessionId,
    title: r.title,
    startedAt: r.startedAt,
    generatedAt: r.generatedAt,
    tool: r.tool,
    stages: r.stages,
    actions: summarizeEvents(r.events, r.policy),
    turns: r.turns.length,
    events: r.events.length,
    codeRuns: r.extra.codeRuns,
    paperSaves: r.extra.paperSaves,
    pinnedMethods: r.extra.pinnedMethods,
    review: r.review,
    gaps: reportGaps(r)
  }
}

function toolTable(t: ReportTool): string {
  const rows: [string, string][] = [
    ['工具名称', t.appName],
    ['工具版本', t.appVersion],
    ['运行环境', `${t.platform} · Electron ${t.electron} · Node ${t.node}`],
    ['服务提供方', t.provider],
    ['接口地址', t.baseUrlHost || '（未记录）'],
    ['调用模型', t.models.length ? t.models.join('、') : '（未记录）'],
    ['API 密钥', '未记录（密钥只存在本机系统钥匙串，不会写入本文件）']
  ]
  return rows.map(([k, v]) => ` \\textbf{${texEscape(k)}} & ${texCell(v)} \\\\`).join('\n')
}

function stageTable(stages: ReportStage[]): string {
  return stages
    .map((s) =>
      [
        String(s.id),
        texCell(s.title),
        texEscape(STATUS_CN[s.status] ?? s.status) + (s.blocking ? '（强制）' : ''),
        `L${String(s.hintLevel)}`,
        String(s.attempts),
        s.score === null ? '—' : String(s.score)
      ].join(' & ') + ' \\\\'
    )
    .join('\n')
}

const STATUS_CN: Record<string, string> = {
  todo: '未开始',
  active: '进行中',
  submitted: '已提交',
  done: '已完成'
}

/**
 * 动作名与模型名是没有空格的拉丁整串（scaffold_adopted、gpt-4o-mini），
 * 窄列里 TeX 找不到断行点就会溢出整张表，所以转义后在 `_`、`-` 处补断行许可。
 */
function texToken(s: string): string {
  return texEscape(s).replace(/(-|\\_)/g, '$1\\allowbreak{}')
}

function eventTable(events: ReportEvent[], policy: PolicyConfig, titleOf: (id: number | null) => string): string {
  return events
    .map((e) =>
      [
        texEscape(fmtTime(e.at)),
        texCell(titleOf(e.stageId)),
        texToken(e.action),
        texCell(e.detail || policy.actionLabels[e.action] || ''),
        texToken(e.model || '—')
      ].join(' & ') + ' \\\\'
    )
    .join('\n')
}

/**
 * 列宽是按 A4 + 2.2cm 页边距算的：五列 longtable 的列间距占掉约 2.1cm，
 * 所以 p{} 之和必须 ≤ 14.4cm，超出就是整表右边缘溢出（日志里的 Overfull hbox）。
 */
function eventsBlock(events: ReportEvent[], policy: PolicyConfig, titleOf: (id: number | null) => string): string {
  if (!events.length) return '本次会话还没有任何 AI 参与事件留痕。若确实使用过工具，请回到对话里继续，让留痕补齐后再导出。'
  return `\\begin{longtable}{p{2.6cm}p{2.3cm}p{2.1cm}p{5.6cm}p{1.8cm}}
\\toprule
时间 & 阶段 & 动作 & 说明 & 模型 \\\\
\\midrule
\\endfirsthead
\\toprule
时间 & 阶段 & 动作 & 说明 & 模型 \\\\
\\midrule
\\endhead
\\bottomrule
\\endlastfoot
${eventTable(events, policy, titleOf)}
\\end{longtable}`
}

function turnBlock(t: ReportTurn): string {
  return [
    `\\textbf{${texEscape(turnLabel(t))}}\\quad {\\small \\textit{${texEscape(fmtTime(t.at))}}}`,
    texParas(renderTurn(t.kind, t.content)),
    '\\medskip'
  ].join('\n\n')
}

export function buildUsageTex(r: UsageReport): string {
  const p = r.policy
  const counts = summarizeEvents(r.events, p)
  const titleOf = (id: number | null): string => {
    if (id === null) return '—'
    const s = r.stages.find((x) => x.id === id)
    return s ? `${String(s.id)} ${s.title}` : String(id)
  }

  return `% 《AI 工具使用详情》——由本应用按本机留痕自动生成，请勿手工改动后提交
\\documentclass[11pt,a4paper,UTF8]{ctexart}
\\usepackage{geometry}
\\geometry{a4paper,top=2.2cm,bottom=2.2cm,left=2.2cm,right=2.2cm}
\\usepackage{longtable}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{array}
\\usepackage{enumitem}
\\usepackage{amssymb}
\\usepackage{textcomp}
\\usepackage{xcolor}
\\usepackage[hidelinks]{hyperref}
\\setlength{\\parskip}{0.45em}
\\setlength{\\parindent}{0pt}
\\sloppy
\\pagestyle{plain}

\\begin{document}

\\begin{center}
{\\zihao{3}\\bfseries AI 工具使用详情}\\\\[2pt]
{\\small ${texEscape(p.scheme)}·${texEscape(p.policyName)}（${texEscape(p.policyVersion)}）要求提交}
\\end{center}

\\section*{〇、本说明的生成方式}
${texParas(p.declaration)}

\\begin{tabularx}{\\textwidth}{p{2.6cm}X}
\\toprule
生成时间 & ${texEscape(fmtTime(r.generatedAt))} \\\\
会话标题 & ${texCell(r.title)} \\\\
会话起始 & ${texEscape(fmtDate(r.startedAt))} \\\\
记录条数 & 事件 ${String(r.events.length)} 条 · 交互 ${String(r.turns.length)} 条 \\\\
\\bottomrule
\\end{tabularx}

\\section*{一、规定要求的四项内容在本文件中的位置}
\\begin{itemize}[leftmargin=1.6em,itemsep=1pt]
${p.requiredItems.map((x) => `  \\item ${texParas(x)}`).join('\n')}
\\end{itemize}
{\\small 规定原文与最新版本见官方页面：\\url{${texEscape(p.sourceUrl)}}。本文件中的规定要点为应用内摘录（整理于 ${texEscape(
    p.updatedOn
  )}），以官方原文为准。}

\\section*{二、工具与版本}
\\begin{tabularx}{\\textwidth}{p{2.6cm}X}
\\toprule
${toolTable(r.tool)}
\\bottomrule
\\end{tabularx}

\\section*{三、使用用途}
本次参赛中，本队把该工具用于以下环节（括号内为自动留痕的实际次数）：
\\begin{enumerate}[leftmargin=1.8em,itemsep=1pt]
${counts.length ? counts.map((c) => `  \\item ${texParas(c.label)} —— ${String(c.count)} 次，最近一次 ${texEscape(fmtTime(c.lastAt))}`).join('\n') : '  \\item （本次会话暂无 AI 参与事件留痕）'}
\\end{enumerate}
\\begin{itemize}[leftmargin=1.6em,itemsep=1pt]
  \\item Python 沙箱代码执行：${String(r.extra.codeRuns)} 次（图表与数据结果由本队自己运行得到）
  \\item 论文稿存版：${String(r.extra.paperSaves)} 次
  \\item 方法库钉选候选：${r.extra.pinnedMethods.length ? texParas(r.extra.pinnedMethods.join('、')) : '（无）'}
\\end{itemize}
{\\small 事先设定的用途范围（${texEscape(p.policyVersion)}）：${texParas(p.purposes.join('；'))}。}

\\section*{四、阶段推进与提示强度}
提示强度 L0 为只提问，L1 方向性提示，L2 给需改写的示例，L3 给更完整的示例。升级都由学生主动点击触发。
\\begin{longtable}{p{0.9cm}p{4.6cm}p{3.0cm}p{1.2cm}p{1.4cm}p{1.2cm}}
\\toprule
阶段 & 名称 & 状态 & 最高提示 & 未通过次数 & 评分 \\\\
\\midrule
\\endfirsthead
\\toprule
阶段 & 名称 & 状态 & 最高提示 & 未通过次数 & 评分 \\\\
\\midrule
\\endhead
\\bottomrule
\\endlastfoot
${r.stages.length ? stageTable(r.stages) : '— & （无阶段记录） & — & — & — & — \\\\'}
\\end{longtable}

\\section*{五、AI 参与事件清单}
${eventsBlock(r.events, p, titleOf)}

\\section*{六、完整交互过程}
以下按时间顺序列出全部师生往来内容，未做删减；教练一栏本身只有提问、检查点与提示，不含论文正文。
\\bigskip
${r.turns.length ? r.turns.map(turnBlock).join('\n') : '（本次会话没有交互记录）'}

\\section*{七、核实声明}
\\begin{enumerate}[label=\\textbf{\\arabic*.},leftmargin=2.2em,itemsep=2pt]
${p.rules.map((x) => `  \\item ${texParas(x)}`).join('\n')}
\\end{enumerate}

学生对以上事项的逐条确认（提交前请手工勾选并签名）：
\\begin{itemize}[leftmargin=1.6em,itemsep=3pt,label=$\\square$]
${p.verifyChecklist.map((x) => `  \\item ${texParas(x)}`).join('\n')}
\\end{itemize}

\\subsection*{学生自己写的记录复核}
${r.review.trim() ? texParas(r.review) : '{\\color{red}（尚未填写：这一段是规定要求的「人工核实」说明，请回到第 11 阶段任务卡补上。）}'}

\\bigskip
\\begin{tabularx}{\\textwidth}{XXXX}
\\toprule
参赛队员签名 &  & 日期 &  \\\\
\\addlinespace[1.2em]
指导教师签名 &  & 日期 &  \\\\
\\bottomrule
\\end{tabularx}

\\end{document}
`
}
