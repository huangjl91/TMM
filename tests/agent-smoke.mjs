/**
 * M2 离线冒烟：Coach 输出契约、反代写启发式、阶段状态机。
 * 全部不联网、不需要 API Key——真实调用留给 UI 端到端探针。
 * 运行：npm run smoke:agent
 */
import assert from 'node:assert/strict'
import * as H from '../.tmp/agent-harness.mjs'

const results = []

function check(name, fn, detail = '') {
  let ok = false
  let msg = ''
  try {
    fn()
    ok = true
  } catch (e) {
    msg = (e && e.message) || String(e)
  }
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}${msg ? `\n      ${msg.split('\n')[0]}` : ''}`)
}

const FULL = JSON.stringify({
  next_question: '你这三问的评价对象分别是谁？',
  checks: [
    { item: '每问的输入输出明确', passed: true, note: '' },
    { item: '评价对象与指标口径写清', passed: false, note: '第二问没写指标' }
  ],
  hint: { level: 1, text: '先只盯着附件的字段说明。' },
  rubric_score: { total: 55, comments: ['结论缺数值支撑'] },
  blockers: '逐问拆解还缺一问'
})

const pass = (n) => ({
  next_question: '这一条你是怎么核实的？',
  checks: Array.from({ length: n }, (_, i) => ({ item: `评分点${i + 1}`, passed: true })),
  hint: null,
  rubric_score: { total: 85, comments: [] },
  blockers: ''
})
const fail = (score) => ({
  next_question: '这一条你打算怎么补？',
  checks: [
    { item: '评分点1', passed: true },
    { item: '评分点2', passed: false, note: '没写依据' }
  ],
  hint: null,
  rubric_score: { total: score, comments: ['缺依据'] },
  blockers: '评分点2'
})
const st = (sid, id) => H.stageViews(sid).find((v) => v.id === id)

console.log('— Coach 输出契约与解析容错 —')

check('契约里没有可放正文的字段（结构上无法代写）', () => {
  assert.equal(
    Object.keys(H.parseCoachReply(FULL)).sort().join(','),
    'blockers,checks,hint,next_question,rubric_score'
  )
})

check('完整 JSON 正常解析', () => {
  const r = H.parseCoachReply(FULL)
  assert.equal(r.checks.length, 2)
  assert.equal(r.hint.level, 1)
  assert.equal(r.rubric_score.total, 55)
})

check('带 ```json 包裹与尾随寒暄仍能解析', () => {
  const r = H.parseCoachReply('```json\n' + FULL + '\n```\n希望对你有帮助。')
  assert.ok(r && r.next_question.includes('评价对象'))
})

check('缺字段时给安全默认而不是崩', () => {
  const r = H.parseCoachReply('{"next_question":"为什么？"}')
  assert.deepEqual(r.checks, [])
  assert.equal(r.hint, null)
  assert.equal(r.rubric_score.total, 0)
  assert.equal(r.blockers, '')
})

check('hint.level 越界被钳到 0..3', () => {
  assert.equal(H.parseCoachReply('{"next_question":"为什么？","hint":{"level":9,"text":"x"}}').hint.level, 3)
  assert.equal(H.parseCoachReply('{"next_question":"为什么？","hint":{"level":-4,"text":"x"}}').hint.level, 0)
})

check('形状对但不是教练契约的 JSON 判为解析失败', () => {
  assert.equal(H.parseCoachReply('{"kind":"code","fieldKey":null,"content":"print(1)"}'), null)
  assert.equal(H.parseCoachReply('{}'), null)
})

check('不是 JSON 时返回 null（调用方降级为普通对话）', () => {
  assert.equal(H.parseCoachReply('我很乐意帮你写这篇论文。'), null)
  assert.equal(H.parseCoachReply(''), null)
})

check('流式半成品能取出已生成的提问', () => {
  const partial = '{"next_question": "第二问的评价对象你'
  const got = H.extractStringField(partial, 'next_question')
  assert.equal(got.closed, false)
  assert.equal(got.value, '第二问的评价对象你')
})

check('Executor 示例：fieldKey 写字面 null 视为未指定', () => {
  const s = H.parseScaffold('{"kind":"code","fieldKey":"null","content":"import numpy as np"}')
  assert.equal(s.kind, 'code')
  assert.equal(s.fieldKey, undefined)
})

check('Executor 示例：没有 content 就不落地', () => {
  assert.equal(H.parseScaffold('{"kind":"text","content":"   "}'), null)
})

console.log('\n— 反代写启发式（红队话术 10 条）—')

const VIOLATIONS = [
  [
    '摘要成稿',
    '摘要：本文针对附件给出的多目标调度问题，首先对数据做了清洗与标准化处理，然后综合考虑订单到达强度、设备可用率与人员班次约束，建立了带时间窗的混合整数规划模型，采用遗传算法与贪心初值相结合的方式求解，得到总完工时间 417.6 小时的最优调度方案。在此基础上，对关键参数进行了扰动试验，结果表明模型在需求波动下仍然保持稳定，验证了方案的有效性。'
  ],
  ['LaTeX 正文结构', '\\section{模型建立}\n我们建立了如下的目标函数：\\min \\sum_i c_i x_i。综上所述，该模型满足题目全部约束。'],
  [
    '整段可粘贴代码',
    '直接给你一段可用的代码：\n```python\nimport numpy as np\nfrom scipy.optimize import linprog\nc = np.array([2, 3, 4])\nA_ub = np.array([[1, 1, 0], [0, 1, 1]])\nb_ub = np.array([10, 8])\nres = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=(0, None))\nprint(res.fun)\n```\n结果表明最优值就是 20。'
  ],
  [
    '连续陈述的操作手册',
    '第一步先按附件说明把每个字段的量纲统一，缺失值单独标记出来。\n第二步做标准化处理，把不同量级的指标压到同一个可比区间里。\n第三步按月份分组统计，观察序列里有没有明显的季节项和跳变。\n第四步把处理前后的分布一起画成折线图，便于核对有没有处理错。\n第五步把这三条发现写进探索结论，后面的建模就按这三条事实选方法。'
  ],
  [
    '替学生下结论',
    '综上所述，你的第二问应该用非线性规划来做，目标函数取总成本最小，约束是产量上限和运输平衡。由此可见这个模型是合理的，结果表明参数扰动时最优解不变，所以模型是稳健的。'
  ]
]

const CLEAN = [
  ['纯提问', '附件二的缺失率你是按列算的还是按行算的？为什么这里按列更合理？'],
  ['方向性提示 + 追问', '扰动幅度别顺手取 10%。你选的幅度依据的是数据的哪一条特征？'],
  ['指出检查点没过的地方', '检查点里"评价对象与指标口径"这一条没过：你没写清评价谁。这一条你打算怎么补？'],
  ['rubric 反馈', '评分 55。主要问题是结论没有数值支撑。哪一个数字能撑住你的结论？'],
  ['预告脚手架但不给内容', '下一步会给你一份带空缺的脚手架，关键行仍由你填。你现在具体卡在哪一步？'],
  ['空文本', '   ']
]

for (const [name, text] of VIOLATIONS) {
  check(`越界样本判可疑：${name}`, () => {
    const v = H.detectGhostwriting(text)
    assert.equal(v.suspect, true, `score=${v.score} reasons=${v.reasons.join('/')}`)
    assert.ok(v.reasons.length > 0)
  })
}
for (const [name, text] of CLEAN) {
  check(`合规话术不误伤：${name}`, () => {
    const v = H.detectGhostwriting(text)
    assert.equal(v.suspect, false, `score=${v.score} reasons=${v.reasons.join('/')}`)
  })
}

check('系统提示词本身写明禁止代写', () => {
  assert.match(H.COACH_SYSTEM, /禁止/)
  assert.match(H.COACH_SYSTEM, /综上所述/)
  assert.equal(H.HINT_LEVELS.length, 4)
})

console.log('\n— 阶段状态机 —')

H.fake._reset()

check('新会话从第 1 阶段开始并标为 active', () => {
  assert.equal(H.currentStageId(1), 1)
  assert.equal(st(1, 1).status, 'active')
})

check('检查点全过 + 评分达标 → done，当前阶段自动推进', () => {
  H.applyCoachReply(1, 1, pass(2), 'test-model')
  assert.equal(st(1, 1).status, 'done')
  assert.equal(st(1, 1).score, 85)
  assert.equal(st(1, 2).status, 'active', '完成后任务卡要落到下一个阶段')
  assert.equal(H.currentStageId(1), 2)
})

check('全过但评分不达标不算通过', () => {
  H.fake._reset()
  H.applyCoachReply(2, 1, fail(50), 'test-model')
  assert.equal(st(2, 1).status, 'submitted')
  assert.equal(H.currentStageId(2), 1)
})

check('检查点为空不算通过（模型没给依据就不能放行）', () => {
  H.fake._reset()
  H.applyCoachReply(3, 1, { ...pass(0), checks: [], rubric_score: { total: 100, comments: [] } }, 'test-model')
  assert.equal(st(3, 1).status, 'submitted')
})

check(`连续 ${H.ESCALATE_AFTER_ATTEMPTS} 次没过 → 提示升一级并留痕`, () => {
  H.fake._reset()
  for (let i = 0; i < H.ESCALATE_AFTER_ATTEMPTS; i++) H.applyCoachReply(4, 1, fail(40), 'test-model')
  const v = st(4, 1)
  assert.equal(v.attempts, H.ESCALATE_AFTER_ATTEMPTS)
  assert.equal(v.hintLevel, 1)
  assert.ok(H.fake._usage().some((u) => u.action === 'hint_escalation' && u.stageId === 1))
})

check('阶段完成时写 stage_done 日志', () => {
  H.fake._reset()
  H.applyCoachReply(5, 1, pass(3), 'test-model')
  assert.ok(H.fake._usage().some((u) => u.action === 'stage_done'))
})

check('强制项未完成时不许跳到后面阶段', () => {
  H.fake._reset()
  H.currentStageId(8)
  const r = H.openStage(8, 5)
  assert.equal(r.ok, false)
  assert.match(r.error, /第 1 阶段/)
})

check('强制项全部完成后放行，会话阶段键同步', () => {
  H.applyCoachReply(8, 1, pass(2), 'test-model')
  H.applyCoachReply(8, 2, pass(2), 'test-model')
  H.applyCoachReply(8, 3, pass(2), 'test-model')
  assert.equal(H.openStage(8, 5).ok, true)
  assert.equal(H.fake._stageKeyOf(8), 'derive')
})

check('submitStage 落库后任务卡读得回，状态变 submitted', () => {
  H.submitStage(8, 5, { objective: '\\min \\sum_i c_i x_i，成本含运输与加班', constraints: '   ', domain: 'x 为非负整数' })
  const card = H.stageCard(8, 5)
  assert.equal(card.fields.find((f) => f.key === 'objective').content, '\\min \\sum_i c_i x_i，成本含运输与加班')
  assert.equal(card.fields.find((f) => f.key === 'constraints').content, '')
  assert.equal(st(8, 5).status, 'submitted')
})

check('任务卡重交只留最新版本，历史仍单独追加', () => {
  H.submitStage(8, 5, { objective: '第二版目标函数，量纲已核对' })
  assert.equal(H.stageCard(8, 5).fields.find((f) => f.key === 'objective').content, '第二版目标函数，量纲已核对')
})

check('coachBriefing 把 rubric 与学生内容拼进教练上下文', () => {
  const b = H.coachBriefing(8, 5)
  assert.match(b, /第二版目标函数/)
  assert.match(b, /评分点/)
  assert.match(b, /提示强度：L0/)
})

check('没钉选时按学生交出的任务卡文本自动挑方法', () => {
  H.submitStage(8, 5, { objective: '多个指标要合成一个得分，先用熵权法定权重，再看谁最贴近理想解' })
  const h = H.methodHints(8, 5)
  assert.equal(h.pinned, false)
  assert.ok(h.cards.some((c) => c.id === 'entropy-weight'), `没挑中熵权法：${h.cards.map((c) => c.id).join(',')}`)
  assert.match(h.digest, /方法库要点/)
})

check('钉过方法后只用钉选的那几张，自动匹配让位', () => {
  H.fake._pin(8, ['topsis'])
  const h = H.methodHints(8, 5)
  assert.equal(h.pinned, true)
  assert.deepEqual(h.cards.map((c) => c.id), ['topsis'])
  assert.match(H.coachBriefing(8, 5), /TOPSIS/)
})

check('学生主动要提示：逐级升到 L3 封顶', () => {
  H.fake._reset()
  H.currentStageId(6)
  const levels = [1, 2, 3, 4].map(() => H.requestHint(6, 1, 'test-model').level)
  assert.deepEqual(levels, [1, 2, 3, 3])
})

check('已完成阶段不因要提示被改回未完成', () => {
  H.fake._reset()
  H.applyCoachReply(7, 1, pass(2), 'test-model')
  H.requestHint(7, 1, 'test-model')
  assert.equal(st(7, 1).status, 'done')
})

check('未知阶段编号被拒绝而不是崩', () => {
  assert.equal(H.openStage(7, 999).ok, false)
  assert.throws(() => H.submitStage(7, 999, { a: 'b' }), /没有这个阶段/)
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  console.log('失败：' + failed.map((r) => r.name).join('、'))
  process.exitCode = 1
}
