import assert from 'node:assert/strict'
import { build } from 'esbuild'
await build({ entryPoints: ['tests/teaching-harness.ts'], bundle: true, format: 'esm', platform: 'node', outfile: '.tmp/teaching-harness.mjs', logLevel: 'warning' })
const { reviewTeachingAnswer, parseTeachingFeedback, DraftQueue } = await import('../.tmp/teaching-harness.mjs')
const note = JSON.stringify({ version: 1, answers: ['因为简单方便', '上一日数值', '留出末段测试'], hintLevel: 0, submitted: false })
const local = await reviewTeachingAnswer('model_select', note, '预测客流')
assert.equal(local.source, 'local')
assert.match(local.question, /数据特征或约束/)
const answer = { quote: '因为简单方便', observation: '你考虑了实现成本。', gap: '还需核对数据关系。', question: '哪项数据支持这种选择？', nextAction: '找出具体字段。', limitation: '没有计算结果，需进一步实验。' }
let prompt
const online = await reviewTeachingAnswer('model_select', note, '预测客流', async (messages) => { prompt = messages; return JSON.stringify(answer) })
assert.equal(online.source, 'ai')
assert.ok(prompt[1].content.includes('因为简单方便'))
assert.equal(parseTeachingFeedback({ ...answer, quote: '未说过的话' }, note), null)
assert.equal(parseTeachingFeedback({ ...answer, gap: [] }, note), null)
assert.equal(parseTeachingFeedback({ ...answer, question: 'x'.repeat(601) }, note), null)
for (const request of [async () => 'not json', async () => JSON.stringify({ ...answer, quote: '虚构引文' }), async () => { throw new Error('network') }]) {
  const feedback = await reviewTeachingAnswer('model_select', note, '预测客流', request)
  assert.equal(feedback.source, 'local')
  assert.ok(feedback.question)
}
console.log('PASS 引用学生原话、AI 结构校验、离线追问、无效引文与网络错误回退')

const writes = []
let release
const queue = new DraftQueue(async (value) => {
  writes.push(value)
  if (value === 'old-in-flight') await new Promise((resolve) => { release = resolve })
  if (value === 'failure') throw new Error('disk')
  return value
}, 20)
queue.schedule('q1', 'cancelled', () => {})
queue.schedule('q1', 'latest', () => {})
await queue.flush('q1')
assert.deepEqual(writes, ['latest'])
const old = queue.submit('q1', 'old-in-flight')
await new Promise((resolve) => setTimeout(resolve, 0))
queue.schedule('q1', 'obsolete-draft', () => {})
const submitted = queue.submit('q1', 'submitted')
release()
await Promise.all([old, submitted])
assert.deepEqual(writes, ['latest', 'old-in-flight', 'submitted'])
let failure
queue.schedule('q1', 'failure', (error) => { failure = error })
await queue.flush('q1')
assert.ok(failure)
queue.schedule('q2', 'other-question', () => {})
queue.schedule('q1', 'retry', () => {})
await queue.flushAll()
assert.deepEqual(writes.slice(-2), ['other-question', 'retry'])
queue.schedule('q1', 'debounced', () => {})
await new Promise((resolve) => setTimeout(resolve, 40))
assert.equal(writes.at(-1), 'debounced')
console.log('PASS 防抖、串行写入、提交取消旧草稿、不同小问保存、失败后重试')
