// 对独立的 .tmp/prediction-lab-preview 演示窗口检查，不操作日常学习数据。
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
const port = process.env.MMT_LAB_PORT ?? '9339'
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
const target = list.find((t) => t.type === 'page' && t.url.startsWith('file://'))
assert.ok(target, '请先启动独立演示窗口，调试端口 9339')
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
  assert.match(info.sandboxRoot, /prediction-lab-preview/)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('预测实验演示'))?.click()`)
  await until(`Boolean(document.querySelector('.prediction-lab'))`)
  async function field(label, value) {
    await evaluate(`(() => { const el = document.querySelector('[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true})); })()`)
  }
  await field('实验数据附件', '')
  await field('实验数据附件', 'demo.csv')
  await until(`document.querySelector('[aria-label="实验时间列"]').options.length > 1`)
  await field('实验时间列','date')
  await field('实验预测目标','value')
  await field('实验目标单位','人')
  await field('实验预期','数据有趋势，预计线性方法优于上一期基线，用末段测试误差检查。')
  await click('确认并保存实验计划')
  await click('运行基线与候选比较')
  await until(`document.querySelectorAll('.lab-table tbody tr').length >= 3`)
  await field('实验比较','结合表中 RMSE 比较候选方法与上一期基线。')
  await field('实验局限','合成数据只有 12 个测试点，不能代表真实客流。')
  await field('实验下一步','换用真实附件并检查残差。')
  await click('保存实验复盘')
  await until(`document.querySelector('.lab-statuses').textContent.includes('复盘已记录')`)
  await send('Page.reload')
  await until(`document.querySelector('.lab-statuses')?.textContent.includes('复盘已记录')`)
  await until(`document.querySelector('[aria-label="实验时间列"]')?.value === 'date' && document.querySelector('[aria-label="实验预测目标"]')?.value === 'value'`)
  await until(`document.querySelector('[aria-label="实验时间列"]')?.value === 'date' && document.querySelector('[aria-label="实验预测目标"]')?.value === 'value'`)
  assert.ok(await evaluate(`document.querySelector('.prediction-lab img')?.src.startsWith('data:')`))
  await evaluate(`document.querySelector('.prediction-lab').scrollIntoView({block:'start'})`)
  const shot = await send('Page.captureScreenshot', {format:'png'})
  writeFileSync('.tmp/prediction-lab-preview.png', Buffer.from(shot.data,'base64'))
  console.log('PASS 界面选择数据、保存计划、真实运行、保存复盘、刷新恢复指标与图表')
} finally { ws.close() }



