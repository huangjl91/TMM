/**
 * 方法知识库离线冒烟：语料完整性 + 检索命中 + 反代写约束。
 * 不联网、不启 Electron。运行：npm run smoke:methods
 */
import { METHOD_CARDS, METHOD_CATEGORIES, digestForPrompt, methodById, methodsForStage, scoreMethod, searchMethods, topMethodsForText, tokenize } from '../.tmp/methods.mjs'
import { STAGES } from '../.tmp/stages.mjs'

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const stageIds = new Set(STAGES.map((s) => s.id))
const cats = new Set(METHOD_CATEGORIES)

/** 卡上不许出现「成稿句式」：这些是教练明令禁止替学生下结论的措辞 */
const GHOST_PHRASES = ['综上所述', '我们建立了', '本文采用', '本文认为', '由表可知']

// ---------- 语料完整性 ----------
const ids = new Set()
const broken = []
for (const m of METHOD_CARDS) {
  const bad = []
  if (ids.has(m.id)) bad.push('id 重复')
  ids.add(m.id)
  if (!/^[a-z0-9-]+$/.test(m.id)) bad.push('id 不是 kebab')
  if (!cats.has(m.category)) bad.push(`类别非法 ${m.category}`)
  if (m.aka.length < 1) bad.push('没别名')
  if (m.tags.length < 4) bad.push('标签太少')
  if (m.signals.length < 2) bad.push('线索太少')
  if (m.asks.length < 3) bad.push('追问太少')
  if (m.pitfalls.length < 3) bad.push('坑太少')
  if (m.refs.length < 1) bad.push('没参考线索')
  if (!m.stages.length) bad.push('没标阶段')
  for (const s of m.stages) if (!stageIds.has(s)) bad.push(`阶段 id 不存在 ${String(s)}`)
  for (const a of m.asks) if (!/[？?]$/.test(a.trim())) bad.push('追问不是问句')
  for (const f of [m.when, m.needs, m.output, m.sensitivity, ...m.pitfalls, ...m.asks, ...m.signals]) {
    if (f.length > 120) bad.push(`字段过长（像正文段落）：${f.slice(0, 12)}…`)
    if (GHOST_PHRASES.some((p) => f.includes(p))) bad.push(`出现成稿句式：${f.slice(0, 16)}`)
  }
  if (bad.length) broken.push(`${m.id}: ${bad.join('、')}`)
}
check(`${String(METHOD_CARDS.length)} 张方法卡结构完整且不含成稿句式`, broken.length === 0, broken.slice(0, 3).join(' | '))
check('覆盖国赛主要方法族', new Set(METHOD_CARDS.map((m) => m.category)).size >= 8, [...new Set(METHOD_CARDS.map((m) => m.category))].join('、'))
check('选型阶段（4）候选方法够比较', methodsForStage(4).length >= 8, `${String(methodsForStage(4).length)} 张`)
check('灵敏度阶段（7）有可检验的方法卡', methodsForStage(7).length >= 5, `${String(methodsForStage(7).length)} 张`)

// ---------- 分词 ----------
check('中文按二元组取词', tokenize('熵权法').join(',') === '熵权,权法', tokenize('熵权法').join('|'))
check('英文数字按整词取词', tokenize('ARIMA p=2').includes('arima') && tokenize('ARIMA p=2').includes('p2') === false)
check('空串不炸', tokenize('   ').length === 0)

// ---------- 检索命中 ----------
const top1 = (q, stageId) => searchMethods(q, { stageId, limit: 5 })[0]?.id ?? '(无)'
check('点名方法排第一', top1('我们想用熵权法定权重') === 'entropy-weight', top1('我们想用熵权法定权重'))
check('英文缩写也能捞到', top1('ARIMA 定阶') === 'arima', top1('ARIMA 定阶'))
check('别名命中', top1('优劣解距离法') === 'topsis', top1('优劣解距离法'))
check('类别词「评价」命中评价族', searchMethods('评价', { limit: 8 }).some((m) => m.category === '评价'))
check('类别词「预测」命中预测族', searchMethods('预测', { limit: 8 }).some((m) => m.category === '预测'))
check('搜索框不吃整句话：只给硬命中', searchMethods('我们组今天开了个会').length === 0)

// ---------- 长文本检索（喂任务卡用） ----------
const byText = (t, stageId) => topMethodsForText(t, stageId, 4).map((m) => m.id)
check('口语化描述命中插值', byText('附件一里有几个小时没记录，我先补上再算', 2).includes('interpolation'), byText('附件里有几个小时没记录，我先补上再算', 2).join(','))
check('优化题命中整数规划', byText('机组要么开要么停，开机有固定启动成本，怎么安排最省钱', 5).includes('milp'), byText('机组要么开要么停，开机有固定启动成本，怎么安排最省钱', 5).join(','))
const cTitle = byText('第二问要求给出评价方案并说明指标口径，第一问要给出当天的计划购电量与费用最小的安排', 4)
check('真题描述同时指向评价与优化', cTitle.some((i) => methodById(i).category === '评价') && cTitle.some((i) => methodById(i).category === '优化'), cTitle.map((i) => methodById(i).name).join('、'))
check('长文本无关时退回本阶段常用方法', topMethodsForText('随便说点什么', 7).every((m) => m.stages.includes(7)))
check(
  '一次注入不会全是同一族（选型要有可比候选）',
  new Set(byText('第二问要给出评价方案与指标口径，第一问要给出费用最小的购电计划安排', 4)).size >= 2,
  byText('第二问要给出评价方案与指标口径，第一问要给出费用最小的购电计划安排', 4).join(',')
)
check('空文本不炸', topMethodsForText('', 4).length > 0 && topMethodsForText('   ').length === 0)
check('空查询退化成阶段清单', searchMethods('', { stageId: 7 }).length > 0 && searchMethods('   ')[0] !== undefined)
check('阶段加权让相关方法升上来', scoreMethod('权重', methodById('entropy-weight')) > 0 && searchMethods('权重', { stageId: 5, limit: 3 }).length > 0)

// ---------- 提示词摘要 ----------
const digest = digestForPrompt(searchMethods('评价 权重', { limit: 8 }))
check('摘要带上了「不许念给学生」的约束', digest.includes('只许用来生成追问'))
check('摘要只给坑与追问，不给整段正文', digest.split('\n').length <= 1 + 3 * 3, `${String(digest.split('\n').length)} 行`)
check('摘要不超预算（每张卡约 200 字以内）', digest.length < 1400, `${String(digest.length)} 字`)
check('空卡列表返回空摘要', digestForPrompt([]) === '')
check('默认最多摘 3 张卡', digestForPrompt(METHOD_CARDS.slice(0, 9)).split('\n- ').length - 1 <= 3)

console.log(`\n${String(pass)}/${String(pass + fail)} 通过`)
if (fail) process.exitCode = 1
