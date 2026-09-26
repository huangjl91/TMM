/**
 * 右侧「AI 对话框」的冒烟：这条链路不碰 electron 的部分全在这里验。
 *
 * 三件最容易悄悄坏掉的事：
 * 1) 新消息类型 kind='free' 在合规层认不出来，导出的《AI 工具使用详情》里
 *    自由问答会被标成兜底的「助手」，或者干脆被算成「没有交互记录」；
 * 2) 反代写闸门被改坏——成稿不再被判可疑（学生直接把 AI 写的段落粘进论文），
 *    或者正常讲解被误杀（这一栏就没法用了）；
 * 3) free 与 coach 的消息混流：自由问答串进教练上下文，或反过来。
 *
 * 运行：npm run smoke:freechat
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildUsageTex, renderTurn, reportGaps, summarizeEvents } from '../.tmp/compliance.mjs'
import { detectGhostwriting } from '../.tmp/anti-ghostwrite.mjs'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const POLICY = JSON.parse(readFileSync(join(process.cwd(), 'resources', 'compliance', 'ai-policy.json'), 'utf8'))

// ---- 1. 政策配置里有 free_chat 的中文动作名 ----
check(
  'ai-policy.json 为 free_chat 提供了中文动作名',
  typeof POLICY.actionLabels.free_chat === 'string' && POLICY.actionLabels.free_chat.length > 0,
  POLICY.actionLabels.free_chat
)

// ---- 2. summarizeEvents 能把 free_chat 翻成人话 ----
const events = [
  { at: 1000, stageId: 1, action: 'free_chat', level: null, detail: '自由问答：什么是熵权法', model: 'mock-model' },
  { at: 2000, stageId: 1, action: 'free_chat', level: null, detail: '自由问答：这个报错什么意思', model: 'mock-model' }
]
const counts = summarizeEvents(events, POLICY)
const freeRow = counts.find((r) => r.action === 'free_chat')
check('summarizeEvents 认出 free_chat 并聚合了 2 次', freeRow?.count === 2, JSON.stringify(freeRow))
check(
  'free_chat 的 label 不是兜底的「其他留痕事件」',
  freeRow && freeRow.label !== POLICY.unknownActionLabel,
  freeRow?.label
)

// ---- 3. turns 里自由问答的角色标注 ----
check('renderTurn 对 kind=free 原样输出正文', renderTurn('free', '熵权法怎么定权重') === '熵权法怎么定权重')

const report = {
  sessionId: 1,
  title: '只用右侧对话框问了几次的会话',
  startedAt: 1000,
  generatedAt: 3000,
  policy: POLICY,
  tool: {
    appName: 'math-modeling-tutor',
    appVersion: '0.1.0',
    electron: 'x',
    node: 'x',
    platform: 'win32 x64',
    provider: 'Mock',
    baseUrlHost: 'example.com',
    models: ['mock-model']
  },
  stages: [{ id: 1, title: '读题拆解', status: 'active', hintLevel: 0, attempts: 0, score: null, blocking: true }],
  events,
  turns: [
    { at: 1000, role: 'user', kind: 'free', content: '熵权法怎么定权重' },
    { at: 1500, role: 'assistant', kind: 'free', content: '先看指标的变异程度……' }
  ],
  extra: { codeRuns: 0, paperSaves: 0, pinnedMethods: [] },
  review: ''
}

const tex = buildUsageTex(report)
check('导出的 tex 里学生那条标成「学生」', tex.includes('学生') && tex.includes('熵权法怎么定权重'))
check('导出的 tex 里回答那条标成「自由问答」', tex.includes('自由问答'))

// ---- 4. 体检：只有自由问答不算「没有记录」，真空白才报 ----
const gapsWithFree = reportGaps(report)
check(
  '只有自由问答时不再误报「没有任何交互记录」',
  !gapsWithFree.some((g) => g.includes('说明不了交互过程')),
  gapsWithFree.join(' | ')
)
const emptyGaps = reportGaps({ ...report, events: [], turns: [] })
check(
  '真的一条记录都没有时仍然会报缺交互记录',
  emptyGaps.some((g) => g.includes('说明不了交互过程')),
  emptyGaps.join(' | ')
)

// ---- 5. 反代写检测器：成稿要拦，正常讲解与引导不能误杀 ----
const paperDraft = [
  '综上所述，本文采用熵权法确定各指标权重。我们建立了综合评价模型，',
  '由式(3)可以得出各城市的综合得分。由此可见，本文提出的方法具有较好的适用性。',
  '因此我们建议在实际应用中优先考虑该方案，结果表明该模型能够有效区分各方案优劣。'
].join('\n')
const paperVerdict = detectGhostwriting(paperDraft)
check(
  '论文腔成稿被判为可疑（会被闸门拦下）',
  paperVerdict.suspect === true,
  `score=${paperVerdict.score} ${paperVerdict.reasons.join('；')}`
)

const explanation =
  '熵权法的核心是：指标越分散，它携带的信息越多，权重就越高。你先把每个指标归一化，再算变异系数，就能看出哪个指标在区分样本。'
const explainVerdict = detectGhostwriting(explanation)
check('正常的概念讲解不会被误判', explainVerdict.suspect === false, `score=${explainVerdict.score}`)

const followUp = '这段推导你先自己写一步试试：为什么分母要取标准差而不是方差？'
const followVerdict = detectGhostwriting(followUp)
check('以问号结尾的引导不会被误判', followVerdict.suspect === false, `score=${followVerdict.score}`)

const latexDump = '\\documentclass{article}\n\\begin{document}\n\\section{模型建立}\n\\end{document}'
check('整段 LaTeX 论文结构被判为可疑', detectGhostwriting(latexDump).suspect === true)

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed === 0 ? 0 : 1)
