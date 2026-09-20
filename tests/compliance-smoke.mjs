/**
 * M5 冒烟：《AI 工具使用详情.pdf》的文档生成层。
 *
 * 两件最容易翻车的事必须用真编译器验：
 * 1) 留痕里什么字符都有（反斜杠、&、%、代码里的下划线），转义漏一个就是编译失败；
 * 2) longtable/tabularx 的单元格里 `\\` 不是换行而是「结束这一行」，
 *    带换行的事件 detail 会把整张表搞散架。
 * 运行：npm run smoke:compliance
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildUsageTex, renderTurn, reportGaps, summarizeEvents, texEscape } from '../.tmp/compliance.mjs'

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
    for (const v of readdirSync(root).sort().reverse()) {
      const bin = join(root, v, 'bin', process.platform === 'win32' ? 'windows' : 'x86_64-linux')
      const exe = join(bin, process.platform === 'win32' ? 'xelatex.exe' : 'xelatex')
      if (existsSync(exe)) return exe
    }
  }
  return null
}

const XELATEX = process.env.XELATEX || findXelatex()
if (!XELATEX) {
  console.log('FAIL  找不到 xelatex（可设 XELATEX 环境变量指向可执行文件）')
  process.exit(1)
}
console.log(`xelatex: ${XELATEX}`)

const WORK = join(tmpdir(), `mcompliance-${Date.now()}`)
mkdirSync(WORK, { recursive: true })
// KEEP=1 时留下临时目录，方便对着 .log 查是哪一行溢出
if (!process.env.KEEP) process.on('exit', () => rmSync(WORK, { recursive: true, force: true }))
else console.log(`临时目录保留：${WORK}`)

const POLICY = JSON.parse(readFileSync(join(process.cwd(), 'resources', 'compliance', 'ai-policy.json'), 'utf8'))
const T = (s) => Date.parse(`2026-09-${s}T09:00:00`)

const COACH = JSON.stringify({
  next_question: '你把半径 R 当成已知量用了，附件里没有这个数——打算怎么定？',
  checks: [
    { item: '假设清单里每条都写了依据', passed: false, note: '第 3 条还是空的 & 缺来源' },
    { item: '符号表与正文一致', passed: true }
  ],
  hint: { level: 2, text: '试着从附件的测点距离反推，注意 $x_1$ 与 y_2 的口径 #1' },
  rubric_score: { total: 62, comments: ['灵敏度分析还没排', '结论可复核'] },
  blockers: '补全假设依据后再进入下一阶段'
})

const SCAFFOLD = JSON.stringify({
  kind: 'code',
  content: 'import numpy as np\nr = np.linspace(0.5, 3.0, 6)  # 灵敏度扫描\nprint(r)'
})

/** 满嘴特殊字符的留痕：转义与表格抗压全靠它 */
function richReport() {
  return {
    sessionId: 7,
    title: 'C 题 阶梯轴的\\&设计%说明 #1_$a_{b}~c^d 与 "引号" “中文引号”',
    startedAt: T('18'),
    generatedAt: Date.parse('2026-09-20T21:30:00'),
    policy: POLICY,
    tool: {
      appName: '数学建模教练',
      appVersion: '0.1.0',
      electron: '44.4.3',
      node: '22.20.0',
      platform: 'win32 x64',
      provider: '自定义 OpenAI 兼容端点',
      baseUrlHost: 'api.example-provider.com',
      models: ['gpt-4o-mini', 'deepseek-chat']
    },
    stages: [
      { id: 1, title: '读题与界定问题', status: 'done', hintLevel: 1, attempts: 1, score: 78, blocking: true },
      { id: 2, title: '模型假设与符号表', status: 'active', hintLevel: 2, attempts: 3, score: 62, blocking: true },
      { id: 11, title: 'AI 使用声明与记录复核', status: 'todo', hintLevel: 0, attempts: 0, score: null, blocking: true }
    ],
    events: [
      { at: T('18'), stageId: 1, action: 'coach_reply', level: 1, detail: '参考方法卡（学生钉选）：熵权法、TOPSIS 逼近理想解排序', model: 'gpt-4o-mini' },
      { at: T('18'), stageId: 1, action: 'submission', level: null, detail: '第一版假设：轴径 d=40mm & 载荷 P=10kN\n忽略了键槽应力集中 100%', model: '' },
      { at: T('19'), stageId: 2, action: 'hint_escalation', level: 2, detail: '学生点「给个示例」→ L2', model: '' },
      { at: T('19'), stageId: 2, action: 'scaffold_given', level: 2, detail: '代码示例：$x_1$ 灵敏度扫描 100% 自写', model: 'deepseek-chat' },
      { at: T('19'), stageId: 2, action: 'scaffold_adopted', level: null, detail: '采纳到附录 A 第 2 段（已改写并跑通）', model: '' },
      { at: T('19'), stageId: 2, action: 'critic_block', level: null, detail: '示例里出现成段推导，已强制改写为提问', model: '' },
      { at: T('20'), stageId: null, action: 'some_future_action', level: null, detail: '', model: '' }
    ],
    turns: [
      { at: T('18'), role: 'user', kind: 'chat', content: '老师，附件里只有测点坐标 12.5m，没有半径，我是不是该设一个？\n我设 R=1.0 行不行' },
      { at: T('18'), role: 'assistant', kind: 'coach', content: COACH },
      { at: T('18'), role: 'user', kind: 'submission', content: JSON.stringify({ answers: { assume: '轴是匀质圆柱，忽略键槽' } }) },
      { at: T('19'), role: 'assistant', kind: 'scaffold', content: SCAFFOLD },
      { at: T('19'), role: 'user', kind: 'chat', content: '跑通了，R 用 0.8 到 3.0 扫了一遍' }
    ],
    extra: { codeRuns: 9, paperSaves: 4, pinnedMethods: ['熵权法', 'TOPSIS 逼近理想解排序'] },
    review: '已核实：第 2 章灵敏度数值由本队自己运行代码得到；L2 示例只做思路参考，全部重写。'
  }
}

function emptyReport() {
  const r = richReport()
  return { ...r, events: [], turns: [], review: '', extra: { codeRuns: 0, paperSaves: 0, pinnedMethods: [] } }
}

// ---------------------------------------------------------------- 纯函数
check('反斜杠先转义且不被二次处理', texEscape('a\\b_c') === 'a\\textbackslash{}b\\_c', texEscape('a\\b_c'))
check('特殊符号全部成宏', texEscape('%&#$') === '\\%\\&\\#\\$', texEscape('%&#$'))
check('波浪号与脱字符成宏', texEscape('~^') === '\\textasciitilde{}\\textasciicircum{}', texEscape('~^'))
check('控制字符被剔除', texEscape('a\u0007b\u001cc') === 'abc', texEscape('a\u0007b\u001cc'))
check('中文与百分号原样保留', texEscape('灵敏度 100%') === '灵敏度 100\\%', texEscape('灵敏度 100%'))

{
  const coach = renderTurn('coach', COACH)
  check('教练 JSON 还原成人话', coach.includes('问题：你把半径 R') && coach.includes('提示 L2') && coach.includes('评分：62/100'), coach.slice(0, 80))
  check('检查点带通过标记', coach.includes('✓') && coach.includes('✗'), '')
  check('缺项写成「还缺」而不是吞掉', coach.includes('进入下一阶段前还缺：'), '')
}
{
  const s = renderTurn('scaffold', SCAFFOLD)
  check('示例标注为代码示例', s.startsWith('类型：代码示例'), s.slice(0, 30))
  check('示例正文保留换行', s.includes('import numpy as np') && s.includes('print(r)'), '')
}
check('无法解析的内容原样输出', renderTurn('user', '普通一句话') === '普通一句话')

{
  const counts = summarizeEvents(richReport().events, POLICY)
  check('事件按动作聚合计数', counts.some((c) => c.action === 'scaffold_given' && c.count === 1), JSON.stringify(counts.map((c) => [c.action, c.count])))
  const known = counts.find((c) => c.action === 'coach_reply')
  check('已知动作有中文名', Boolean(known) && known.label.length > 2 && known.label !== 'coach_reply', known?.label ?? '')
  const unknown = counts.find((c) => c.action === 'some_future_action')
  check('未知动作不显示原始串', Boolean(unknown) && unknown.label === POLICY.unknownActionLabel, unknown?.label ?? '')
}

{
  const gaps = reportGaps(richReport())
  check('内容齐备时不该报缺交互', !gaps.some((g) => g.includes('还没有任何对话')), gaps.join(' / '))
  check('已填复核时不催第 11 阶段', !gaps.some((g) => g.includes('还是空的')), gaps.join(' / '))
  const egaps = reportGaps(emptyReport())
  check('空会话提示先建会话', egaps.some((g) => g.includes('先把题目贴进对话')), '')
  check('未填复核要提醒', egaps.some((g) => g.includes('第 11 阶段')), '')
  check('强制阶段未完成要提醒', egaps.some((g) => g.includes('强制阶段未完成') && g.includes('AI 使用声明')), '')
  check('无 coach_reply 要提醒', egaps.some((g) => g.includes('没有任何教练提问记录')), '')
}

// ---------------------------------------------------------------- 生成的 .tex
const tex = buildUsageTex(richReport())
check(
  '事件 detail 的换行被压进单元格',
  !tex.includes('10kN\n忽略') && tex.includes('10kN 忽略了键槽'),
  tex.split('\n').find((l) => l.includes('10kN')) ?? ''
)
const ntex = buildUsageTex({ ...richReport(), title: '第一行\n第二行' })
check(
  '标题换行被压进单元格，不会拆散表格',
  /会话标题 & 第一行 第二行 \\\\/.test(ntex),
  (ntex.split('\n').find((l) => l.includes('会话标题')) ?? '').slice(0, 60)
)
check('密钥不落进文档', !/sk-[A-Za-z0-9]/.test(tex) && tex.includes('密钥只存在本机系统钥匙串'))
check('规定要点标注以官方原文为准', tex.includes('以官方原文为准'))
check('钉选方法出现在用途里', tex.includes('熵权法') && tex.includes('TOPSIS'))
check('交互过程按「未删减」口径成节', tex.includes('\\section*{六、完整交互过程}') && tex.includes('未做删减'))
check('学生复核原文照录', tex.includes('全部重写'))
check('师生标签按角色分', tex.includes('\\textbf{学生}') && tex.includes('\\textbf{教练提问}'), '')
check('任务卡与示例各有独立标签', tex.includes('\\textbf{任务卡提交}') && tex.includes('示例（需自行改写核实）'), '')
check('长动作名带断行许可，不撑破窄列', tex.includes('some\\_\\allowbreak{}future'), (tex.split('\n').find((l) => l.includes('some_future')) ?? '').slice(0, 90))

const dirs = { rich: join(WORK, 'rich'), empty: join(WORK, 'empty') }
for (const [k, report] of Object.entries({ rich: richReport(), empty: emptyReport() })) {
  mkdirSync(dirs[k], { recursive: true })
  writeFileSync(join(dirs[k], 'ai-usage.tex'), buildUsageTex(report), 'utf8')
}

function pass(dir, extra = []) {
  const r = spawnSync(XELATEX, ['-interaction=nonstopmode', '-file-line-error', ...extra, 'ai-usage.tex'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, TEXMFVAR: join(dir, 'texcache'), TEXMFCACHE: join(dir, 'texcache') },
    timeout: 240_000,
    windowsHide: true
  })
  let log = ''
  try {
    log = readFileSync(join(dir, 'ai-usage.log'), 'utf8')
  } catch {
    log = r.stderr || ''
  }
  return { status: r.status, log, out: r.stdout || '' }
}

/** 从 .log 里挑出真错误：xelatex 的报错行以 `! ` 开头，! LaTeX Error / Undefined control 也算 */
function logErrors(log) {
  const re = /^! |LaTeX Error|Fatal error|Missing [a-z]+ inserted|Too many/
  return log
    .split(/\r?\n/)
    .filter((l) => re.test(l))
    .slice(0, 6)
}

for (const [name, dir] of Object.entries(dirs)) {
  const one = pass(dir, ['-no-pdf'])
  const e1 = logErrors(one.log)
  check(`${name}：第一遍 0 错误`, e1.length === 0, e1.join(' | '))
  const two = pass(dir)
  const e2 = logErrors(two.log)
  const pdf = join(dir, 'ai-usage.pdf')
  check(`${name}：两遍编译出 PDF`, existsSync(pdf) && two.status === 0, `exit=${String(two.status)}`)
  check(`${name}：第二遍 0 错误`, e2.length === 0, e2.join(' | '))
  const pages = Number(/Output written on ai-usage\.pdf \((\d+) page/.exec(two.log)?.[1] ?? '0')
  check(`${name}：页数 > 0`, pages > 0, `${String(pages)} 页`)
  if (name === 'rich') check('富样本至少两页（事件与交互都排开了）', pages >= 2, `${String(pages)} 页`)
  else check('空样本仍可提交（红字提示未填复核）', /color\{red\}|尚未填写/.test(readFileSync(join(dir, 'ai-usage.tex'), 'utf8')), `页数 ${String(pages)}`)
  const over = (two.log.match(/Overfull \\hbox \((\d+\.\d+)pt/gi) ?? []).map((s) => Number(/([\d.]+)pt/.exec(s)?.[1] ?? '0'))
  check(`${name}：没有严重超宽（表格没散）`, over.every((p) => p < 30), `最大 ${String(Math.max(0, ...over).toFixed(1))}pt`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${String(results.length - failed.length)}/${String(results.length)} 通过`)
for (const f of failed) console.log(`  FAILED  ${f.name}`)
process.exit(failed.length ? 1 : 0)
