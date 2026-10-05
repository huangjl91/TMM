// 对独立的 .tmp/learning-preview 窗口进行端到端检查，不操作日常学习数据。
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
const port = process.env.MMT_LEARNING_PORT ?? '9337'
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
const target = list.find((t) => t.type === 'page' && t.url.startsWith('file://'))
assert.ok(target, '请先启动独立演示窗口，调试端口 9337')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let id = 0
const pending = new Map()
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`超时：${method}`)) }, 10000)
    pending.set(n, (message) => { clearTimeout(timer); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result) })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + JSON.stringify(result.exceptionDetails.exception))
  return result.result.value
}
async function until(expression) {
  for (let i = 0; i < 60; i++) {
    if (await evaluate(expression)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`界面未就绪：${expression}`)
}
const button = (text) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`
async function click(text) {
  await until(`Boolean(${button(text)} && !${button(text)}.disabled)`)
  await evaluate(`${button(text)}.click()`)
}
async function fill(index, text) {
  await evaluate(`(() => {
    const el = document.querySelectorAll('.learning-task textarea')[${index}];
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
}
try {
  const info = await evaluate('window.api.runtimeInfo()')
  assert.match(info.sandboxRoot, /[\\/]\.tmp[\\/]learning-preview(?:-v2)?[\\/]/, '必须使用隔离的演示工作区')
  assert.equal((await evaluate('window.api.getSettings()')).hasApiKey, false, '离线界面测试不能调用真实模型')
  await send('Page.reload')
  await until(`document.querySelectorAll('.learning-task textarea').length === 3`)
  await evaluate(`document.querySelector('div.group.relative').click()`)
  await fill(0, '自动保存测试：预测明天客流')
  await until(`document.querySelector('.learning-save-status')?.textContent === '已自动保存'`)
  await send('Page.reload')
  await until(`document.querySelector('.learning-task textarea')?.value === '自动保存测试：预测明天客流'`)
  await fill(0, '刷新前的最后一句也需要恢复')
  await send('Page.reload')
  await until(`document.querySelector('.learning-task textarea')?.value === '刷新前的最后一句也需要恢复'`)
  await fill(0, '')
  await click('提交回答，查看反馈')
  await until(`document.querySelector('.learning-feedback')?.textContent.includes('还需要补充')`)
  assert.equal(await evaluate(`Boolean(${button('我已阅读反馈，继续下一步 →')})`), false)
  await fill(0, '预测明天客流')
  await fill(1, '练习题给定的过去30天每日客流')
  await fill(2, '明天客流预测值，单位为人；实际数值待计算')
  await evaluate(`[...document.querySelectorAll('.learning-actions button')].find(b => b.textContent.includes('给我一点提示')).click()`)
  await until(`document.querySelector('.learning-task')?.textContent.includes('提示 1：') && !document.querySelector('.learning-actions button').disabled`)
  await click('提交回答，查看反馈')
  await until(`Boolean(${button('我已阅读反馈，继续下一步 →')})`)
  await click('我已阅读反馈，继续下一步 →')
  await until(`document.querySelector('.learning-task')?.textContent.includes('比较的简单方法')`)
  await evaluate(`document.querySelector('div.group.relative').click()`)
  await fill(0, '因为简单方便')
  await fill(1, '与沿用上一天人数的简单方法比较，检查复杂模型是否确有收益')
  await fill(2, '留出末段数据测试，比较 MAE 并检查残差，避免使用未来信息')
  await click('保存草稿')
  await until(`document.body.textContent.includes('草稿和提示进度已保存')`)
  await send('Page.reload')
  await until(`document.querySelectorAll('.learning-task textarea')[1]?.value.includes('沿用上一天')`)
  await click('针对我的回答追问')
  await until(`document.querySelector('[aria-label="教学追问"]')?.textContent.includes('本地教学追问')`)
  assert.equal(await evaluate(`document.querySelector('[aria-label="教学追问"]').textContent.includes('数据特征或约束')`), true)
  await fill(0, '客流按日期排列，需要考虑时间顺序；是否存在趋势还要检查')
  await until(`document.querySelector('[aria-label="教学追问"]')?.textContent.includes('回答已修改')`)
  await click('提交回答，查看反馈')
  await until(`Boolean(${button('我已阅读反馈，继续下一步 →')})`)
  await click('针对我的回答追问')
  await until(`document.querySelector('[aria-label="教学追问"]')?.textContent.includes('独立的结果')`)
  await evaluate(`document.querySelector('.learning-teaching').scrollIntoView({ block: 'center' })`)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('.tmp/learning-preview.png', Buffer.from(shot.data, 'base64'))
  console.log('PASS 自动保存、立即刷新恢复、提交顺序、提示保存、本地针对性追问、旧反馈标记及主动继续')
} finally { ws.close() }
