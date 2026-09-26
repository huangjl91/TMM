/**
 * M6-2 冒烟：逐问轴的纯逻辑（从阶段 1 的「逐问拆解」文本里认问题 + 字段前缀）。
 * 不联网、不启 Electron。运行：npm run smoke:questions
 */
import assert from 'node:assert/strict'
import { NO_QUESTION, parseQuestionLine, parseQuestions, qKey, splitQKey } from '../.tmp/questions.mjs'

let pass = 0
let fail = 0
const check = (name, fn) => {
  try {
    fn()
    pass++
    console.log(`PASS  ${name}`)
  } catch (e) {
    fail++
    console.log(`FAIL  ${name}\n      ${String(e.message ?? e).split('\n')[0]}`)
  }
}

const idx = (qs) => qs.map((q) => q.idx).join(',')

console.log('— 从学生手写的拆解里认问题 —')

check('「问题 1：」式写法', () => {
  const qs = parseQuestions('问题1：已知相机内参和像元尺寸，求安装高度\n问题 2：给出两相机方案，求基线与倾角\n问题3：加一条导轨后怎么变')
  assert.equal(idx(qs), '1,2,3')
  assert.equal(qs[0].label, '问题 1')
  assert.ok(qs[0].brief.startsWith('已知相机内参'))
})

check('「第一问」「(1)」「1.」都认', () => {
  assert.equal(idx(parseQuestions('第一问 求安装高度H\n第二问 设计双相机方案\n第三问 导轨情形下的优化')), '1,2,3')
  assert.equal(idx(parseQuestions('(1) 求安装高度H\n(2) 设计双相机方案\n(3) 导轨情形优化')), '1,2,3')
  assert.equal(idx(parseQuestions('1. 求安装高度H\n2. 设计双相机方案\n3. 导轨情形优化')), '1,2,3')
  assert.equal(idx(parseQuestions('Q1 求安装高度H\nQ2 设计双相机方案\nQ3 导轨情形优化')), '1,2,3')
})

check('顺序写反也按编号排好', () => {
  const qs = parseQuestions('问题3：导轨情形优化\n问题1：求安装高度H')
  assert.equal(idx(qs), '1,3')
})

check('只有一问或没编号就不拆：逐问轴不出现', () => {
  assert.deepEqual(parseQuestions('问题1：只有一个问，其它都是续行\n补充条件如下'), [])
  assert.deepEqual(parseQuestions('本题要求建立优化模型并给出配置方案'), [])
  assert.deepEqual(parseQuestions(''), [])
})

check('从无换行的连贯 PDF 文本流中成功切出各小问', () => {
  const streamText = '2026年高教社杯C题微网调控。问题 1 若每天电价相同要求不可低于负载制定购电策略。问题 2 若每天电价相同而负载随时间变化需紧急购电。问题 3 在每天4个时刻获取光伏发电预报制定购电策略。'
  const qs = parseQuestions(streamText)
  assert.equal(idx(qs), '1,2,3')
  assert.equal(qs[0].label, '问题 1')
  assert.ok(qs[0].brief.includes('每天电价相同'))
})

check('重复编号只留第一条，不造出假问题', () => {
  assert.deepEqual(parseQuestions('1. 求安装高度H\n1. 又写了一遍'), [])
})

check('年份与数值行不会被当成问题编号', () => {
  assert.deepEqual(
    parseQuestions('2020 年的观测数据共 500 条\n2021 年的观测数据共 600 条'),
    []
  )
  assert.equal(parseQuestionLine('3.5 米的量程不够').idx, null)
})

check('brief 只截一句，别把整段塞进按钮 title', () => {
  const qs = parseQuestions(`问题1：${'很长的一段复述'.repeat(30)}`)
  assert.deepEqual(qs, [])
  const two = parseQuestions(`问题1：${'很长的一段复述'.repeat(30)}\n问题2：第二问的复述内容`)
  assert.equal(two[0].brief.length, 120)
})

console.log('— stage_outputs 的 q<N>: 前缀 —')

check('qKey/splitQKey 往返一致', () => {
  assert.equal(qKey(2, 'objective'), 'q2:objective')
  assert.deepEqual(splitQKey('q2:objective'), { idx: 2, fieldKey: 'objective' })
  assert.equal(splitQKey('objective'), null)
  assert.equal(splitQKey('q0:objective'), null)
  assert.equal(splitQKey('q13:objective'), null)
  assert.equal(splitQKey('qq:objective'), null)
})

check('NO_QUESTION 就是不区分整题', () => {
  assert.equal(NO_QUESTION, 0)
})

console.log(`\n${String(pass)} passed, ${String(fail)} failed`)
if (fail > 0) process.exitCode = 1
