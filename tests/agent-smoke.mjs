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

check('逐问轴：阶段 1 拆出三问后，按问字段才真的拆开', () => {
  H.fake._reset()
  const sid = 31
  H.submitStage(sid, 1, {
    problems: '问题1：求单相机安装高度\n问题2：设计双相机布局方案\n问题3：加入导轨后的布局优化'
  })
  const qs = H.questionsOf(sid)
  assert.deepEqual(qs.map((q) => q.idx), [1, 2, 3])
  const card = H.stageCard(sid, 5)
  const obj = card.fields.find((f) => f.key === 'objective')
  assert.deepEqual(obj.questions.map((q) => q.idx), [1, 2, 3])
  assert.equal(obj.content, '')
  // 没标的字段照旧整格填
  const symbols = H.stageCard(sid, 3).fields.find((f) => f.key === 'symbols')
  assert.equal(symbols.questions, undefined)
})

check('逐问内容按 q<N>:key 存，未拆问的字段不收前缀 key', () => {
  const sid = 31
  H.submitStage(sid, 5, {
    'q1:objective': '最小化总成本，含运输与加班',
    'q3:objective': '导轨长度上限下的布局最优',
    symbols: '不该收',
    'q1:symbols': '更不该收'
  })
  const obj = H.stageCard(sid, 5).fields.find((f) => f.key === 'objective')
  assert.equal(obj.questions.find((q) => q.idx === 1).content, '最小化总成本，含运输与加班')
  assert.equal(obj.questions.find((q) => q.idx === 2).content, '')
  assert.equal(obj.questions.find((q) => q.idx === 3).content, '导轨长度上限下的布局最优')
})

check('拆分前写的整格内容归到问题 1，不凭空消失', () => {
  const sid = 32
  H.submitStage(sid, 5, { objective: '旧版本：先写成一整段' })
  H.submitStage(sid, 1, { problems: '问题1：第一问的复述内容\n问题2：第二问的复述内容' })
  const obj = H.stageCard(sid, 5).fields.find((f) => f.key === 'objective')
  assert.equal(obj.questions[0].content, '旧版本：先写成一整段')
  assert.equal(obj.questions[1].content, '')
})

check('coachBriefing 报逐问进度，方法候选只围着聚焦问转', () => {
  const sid = 33
  H.submitStage(sid, 1, {
    problems: '问题1：求单相机安装高度\n问题2：设计双相机布局方案\n问题3：加入导轨后的布局优化'
  })
  H.submitStage(sid, 5, {
    'q1:objective': '多个指标合成得分，先用熵权法定权重，再看理想解距离',
    'q2:objective': '两个方案比较用层次分析法，判断矩阵要做一致性检验'
  })
  H.fake.setSessionQuestion(sid, 2)
  const b = H.coachBriefing(sid, 5)
  assert.match(b, /逐问进度：问题 1 1\/3，问题 2 1\/3，问题 3 0\/3/)
  assert.match(b, /当前聚焦 问题 2/)
  assert.match(b, /设计双相机布局方案/)
  const at2 = H.methodHints(sid, 5).cards.map((c) => c.id)
  assert.ok(at2.includes('ahp'), `聚焦第 2 问没挑出层次分析法：${at2.join(',')}`)
  assert.ok(!at2.includes('entropy-weight'), `聚焦第 2 问却把第 1 问的熵权法端进来了：${at2.join(',')}`)
  H.fake.setSessionQuestion(sid, 1)
  const at1 = H.methodHints(sid, 5).cards.map((c) => c.id)
  assert.ok(at1.includes('entropy-weight'), `聚焦第 1 问没挑出熵权法：${at1.join(',')}`)
  assert.ok(!at1.includes('ahp'), `聚焦第 1 问却把第 2 问的层次分析法端进来了：${at1.join(',')}`)
})

check('导入的题面与附件会出现在教练上下文里', () => {
  const sid = 31
  H.fake._setFiles(sid, [
    {
      id: 1,
      kind: 'problem',
      name: 'C题.pdf',
      relPath: '题目/C题.pdf',
      size: 2048,
      digestKind: 'pdf',
      digest: '在目标定位问题中，相机像元尺寸为 3.55um，求安装高度。',
      needsVerify: true,
      createdAt: 0
    },
    {
      id: 2,
      kind: 'data',
      name: '附件1.csv',
      relPath: '附件/附件1.csv',
      size: 512,
      digestKind: 'csv',
      digest: '列数 3，数据行数约 200',
      needsVerify: false,
      createdAt: 0
    }
  ])
  const b = H.coachBriefing(sid, 5)
  assert.match(b, /赛题原文（导入自 C题.pdf，PDF 提取结果可能错乱，须学生核对）/)
  assert.match(b, /3\.55um/)
  assert.match(b, /附件\/文件名/)
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

console.log('\n— M6-3 诊断选择题（quiz）：解析边界、不判对错、选项闸门 —')

const QUIZ_ASK_LONG = 'A'.repeat(200)
const QUIZ_MEANS_LONG = '要'.repeat(300)

check('quiz 封顶：最多 2 题、每题 5 个选项，ask 与 means 截断，重复 key 重编号', () => {
  const r = H.parseCoachReply(
    JSON.stringify({
      next_question: '你打算往哪条路走？',
      quiz: [
        {
          ask: QUIZ_ASK_LONG,
          multi: true,
          options: Array.from({ length: 8 }, (_, i) => ({ key: 'A', text: `候选路${i + 1}`, means: QUIZ_MEANS_LONG }))
        },
        {
          ask: '第二题该保留',
          options: [
            { key: 'A', text: '熵权法定权重', means: '权重由数据算' },
            { key: 'A', text: 'TOPSIS 比理想解', means: '要看贴近度' }
          ]
        },
        { ask: '第三题应被丢掉', options: [{ key: 'A', text: '甲', means: '乙' }] }
      ]
    })
  )
  assert.equal(r.quiz.length, 2)
  assert.equal(r.quiz[0].ask.length, 160)
  assert.equal(r.quiz[0].options.length, 5)
  assert.equal(r.quiz[0].options[0].means.length, 160)
  assert.equal(r.quiz[0].multi, true)
  assert.equal(r.quiz[1].options.map((o) => o.key).join(''), 'AB')
})

check('quiz 整题容错：缺 ask、选项少于两个都不进卡片', () => {
  const r = H.parseCoachReply(
    JSON.stringify({
      next_question: '为什么？',
      quiz: [
        { ask: '', options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }] },
        { ask: '只有一个选项', options: [{ key: 'A', text: '甲' }] },
        { ask: 'options 不是数组', options: '熵权法' },
        { ask: '唯一活着的一题', options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }] }
      ]
    })
  )
  assert.equal(r.quiz.length, 1)
  assert.equal(r.quiz[0].ask, '唯一活着的一题')
})

check('选择题没有地方放对错：多余字段进不来，措辞里也没有判分词', () => {
  const r = H.parseCoachReply(
    JSON.stringify({
      next_question: '走哪条？',
      quiz: [
        {
          ask: '走哪条？',
          options: [
            { key: 'A', text: '熵权法', means: '权重来自数据', correct: true, score: 100, answer: '甲' },
            { key: 'B', text: '层次分析法', means: '权重由你定', isRight: false, best: true }
          ]
        }
      ]
    })
  )
  const keys = new Set()
  for (const q of r.quiz) {
    Object.keys(q).forEach((k) => keys.add(k))
    q.options.forEach((o) => Object.keys(o).forEach((k) => keys.add(k)))
  }
  assert.equal([...keys].sort().join(','), 'ask,key,means,multi,options,text')
  assert.equal(JSON.stringify(r.quiz).includes('正确'), false)
})

check('quiz 缺失或不是数组时不污染教练卡片', () => {
  assert.equal(H.parseCoachReply('{"next_question":"为什么？"}').quiz, undefined)
  assert.equal(H.parseCoachReply('{"next_question":"为什么？","quiz":"先想想评价对象"}').quiz, undefined)
})

check('选项闸门：借选项塞正文的那几条丢掉，凑不满两个选项就整题丢', () => {
  const filtered = H.filterQuizOptions([
    {
      ask: '这一问打算怎么定权重？',
      multi: false,
      options: [
        { key: 'A', text: '让数据自己定权重（熵权法）', means: '离散度大的指标更说话' },
        { key: 'B', text: '综上所述本文采用层次分析法', means: '判断矩阵一致性检验通过' },
        { key: 'C', text: '先问导师要一组权重', means: '这条路不解释来源。但你要自己核对说没说通。' }
      ]
    },
    {
      ask: '只剩一个套语选项的一题',
      multi: false,
      options: [{ key: 'A', text: '我们建立了带时间窗的混合整数规划模型', means: '因此我们给出结论' }]
    }
  ])
  assert.equal(filtered.length, 1)
  assert.deepEqual(filtered[0].options.map((o) => o.key), ['A', 'C'])
})

check('选择题闸门：只有阶段 1/2/4 且提示还在 L0 时才允许出题', () => {
  H.fake._reset()
  assert.equal(H.quizAllowed(41, 1), true)
  assert.equal(H.quizAllowed(41, 2), true)
  assert.equal(H.quizAllowed(41, 4), true)
  assert.equal(H.quizAllowed(41, 5), false)
  assert.match(H.coachBriefing(41, 1), /选择题闸门=开/)
  assert.match(H.coachBriefing(41, 5), /选择题闸门=关/)
  H.requestHint(41, 1, 'test-model')
  assert.equal(H.quizAllowed(41, 1), false)
  assert.match(H.coachBriefing(41, 1), /选择题闸门=关/)
})

check('带 quiz 的教练回答照常推进：选择题不算任务卡内容', () => {
  H.fake._reset()
  H.applyCoachReply(
    42,
    1,
    {
      ...pass(2),
      quiz: [
        {
          ask: '这一问先做什么？',
          multi: false,
          options: [
            { key: 'A', text: '先复述三问的输入输出', means: '评分点里有一条叫口径明确' },
            { key: 'B', text: '先挑评价方法', means: '方法决定后面要什么数据' }
          ]
        }
      ]
    },
    'test-model'
  )
  assert.equal(st(42, 1).status, 'done')
})

check('M6-5 绘图三答进简报：没答写明欠几问，答完改成学生原话', () => {
  H.fake._reset()
  assert.match(H.coachBriefing(61, 6), /绘图三问还剩 3 问没答/)
  assert.match(H.coachBriefing(61, 8), /绘图三问还剩 3 问没答/)
  assert.doesNotMatch(H.coachBriefing(61, 3), /绘图三问/)
  H.fake.setPlotIntent(61, 6, {
    question: '问题 1 的结论：残存浓度随时间单调下降',
    axes: '横轴时间 t (min)，纵轴残存浓度 c (mg/L)',
    takeaway: '约 8 分钟后浓度基本不再下降'
  })
  const b = H.coachBriefing(61, 6)
  assert.match(b, /学生的绘图三答/)
  assert.ok(b.includes('横轴时间 t (min)'), b.slice(0, 400))
  assert.doesNotMatch(b, /还剩/)
})

check('M6-5 三答注入 Executor：照学生写的轴名给骨架，没写的显式留空', () => {
  const digest = H.plotDigest({ question: '问题 2 的结论：峰值出现在第 3 天', axes: '', takeaway: '读者该看出拐点' })
  const brief = H.executorUserBrief(2, '求解实现', null, '{}', '', digest)
  assert.ok(brief.includes('问题 2 的结论：峰值出现在第 3 天'))
  assert.ok(brief.includes('（没填）'), '空着的那问要显式留空，不许编')
  assert.match(brief, /留成 TODO/)
  assert.equal(H.executorUserBrief(2, '题目理解', 'problem', 'x').includes('绘图三答'), false)
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  console.log('失败：' + failed.map((r) => r.name).join('、'))
  process.exitCode = 1
}
