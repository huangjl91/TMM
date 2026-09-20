/**
 * SSE 解析冒烟测试（不需要 API Key）。
 * 覆盖三个真实故障点：事件块跨 TCP 分片、多字节 UTF-8 断在分片中间、思维链与正文分流。
 * 用法：npm run smoke
 */
import { createServer } from 'node:http'
import { streamChat } from '../.tmp/openai-compat.mjs'

const REASON_PARTS = ['推理甲', '推理乙']
const CONTENT_PARTS = ['正文一，', '正文二 $x^2$ ', '正文三']

const LINES = [
  ...REASON_PARTS.map((t) => JSON.stringify({ choices: [{ delta: { reasoning_content: t } }] })),
  ...CONTENT_PARTS.map((t) => JSON.stringify({ choices: [{ delta: { content: t } }] })),
  JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
  JSON.stringify({ usage: { prompt_tokens: 11, completion_tokens: 7 }, choices: [] }),
  '[DONE]'
]

const server = createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer test-key') {
    res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"bad key"}')
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  let i = 0
  const sendBlock = () => {
    if (i >= LINES.length) {
      res.end()
      return
    }
    // 每个事件块从中间劈成两次 write，其中一次刻意落在中文字节内部
    const block = Buffer.from(`data: ${LINES[i++]}\n\n`, 'utf8')
    const cut = Math.floor(block.length / 2)
    res.write(block.subarray(0, cut))
    setTimeout(() => {
      res.write(block.subarray(cut))
      setTimeout(sendBlock, 3)
    }, 3)
  }
  sendBlock()
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

let deltas = ''
let reasoning = ''
const result = await streamChat(
  {
    baseUrl: `http://127.0.0.1:${port}/v1/`,
    apiKey: 'test-key',
    model: 'mock',
    messages: [{ role: 'user', content: 'ping' }]
  },
  (kind, text) => {
    if (kind === 'reasoning') reasoning += text
    else deltas += text
  }
)
await new Promise((r) => server.close(r))

const checks = [
  ['正文按序拼接', result.content, CONTENT_PARTS.join('')],
  ['思维链按序拼接', result.reasoning, REASON_PARTS.join('')],
  ['分片转发不丢字', deltas, result.content],
  ['UTF-8 断字节不乱码', result.content.includes('\ufffd') || result.reasoning.includes('\ufffd'), false],
  ['usage 解析', JSON.stringify(result.usage), '{"input":11,"output":7}']
]

let failed = 0
for (const [name, got, want] of checks) {
  const ok = got === want
  if (!ok) failed++
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`}`
  )
}
console.log(`转发统计：正文 ${deltas.length} 字，思维链 ${reasoning.length} 字`)
process.exitCode = failed ? 1 : 0
