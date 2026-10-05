// 对独立的 .tmp/prediction-lab-preview 演示窗口检查，不操作日常学习数据。
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
const port = process.env.MMT_LAB_PORT ?? '9340'
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
  assert.match((await evaluate('window.api.runtimeInfo()')).dbPath, /history-preview/)
  await evaluate(`document.querySelector('[title="历史建模"]').click()`)
  await until(`Boolean(document.querySelector('.session-history-page'))`)
  await until(`Boolean(document.querySelector('[aria-label="删除案例：删除恢复界面测试"]'))`)
  await evaluate(`document.querySelector('[aria-label="删除案例：删除恢复界面测试"]').click()`)
  await click('取消')
  assert.equal((await evaluate('window.api.listSessions()')).length, 2)
  await evaluate(`document.querySelector('[aria-label="删除案例：删除恢复界面测试"]').click()`)
  await click('确认删除')
  await until(`document.querySelectorAll('.history-row').length === 1`)
  await click('已删除（1）')
  await click('恢复')
  await click('返回历史')
  await until(`document.querySelectorAll('.history-row').length === 2`)
  await send('Page.reload')
  await until(`Boolean(document.querySelector('[title="历史建模"]'))`)
  await evaluate(`document.querySelector('[title="历史建模"]').click()`)
  await until(`document.querySelectorAll('.history-row').length === 2`)
  const shot = await send('Page.captureScreenshot', {format:'png'})
  writeFileSync('.tmp/history-preview.png', Buffer.from(shot.data,'base64'))
  console.log('PASS 删除取消、确认、回收区恢复、刷新后历史及数据位置展示')
} finally { ws.close() }

