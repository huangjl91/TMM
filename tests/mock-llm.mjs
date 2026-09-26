/**
 * 假的 OpenAI 兼容端点：只为端到端验证 M2 闭环服务，不联网、不要真实 Key。
 * 三种角色按 system 提示分流：教练（流式 SSE 分片，顺便测流式 JSON 解析）、
 * Executor（非流式，出代码脚手架）、Critic（判不越界）。
 */
import { createServer } from 'node:http'

export const SCAFFOLD_MARK = '# MOCK-SCAFFOLD-9f3c'

export const SCAFFOLD_CODE = [
  SCAFFOLD_MARK,
  'import numpy as np',
  'from scipy.optimize import linprog',
  '',
  '# TODO: 把目标函数系数换成你自己推出来的那个',
  'c = np.array([])',
  'res = linprog(c)',
  "print('结果：', res.fun)"
].join('\n')

function quizIfAllowed(sys) {
  if (!/选择题闸门=开/.test(sys)) return undefined
  return [
    {
      ask: '这一问你打算先走哪条路？',
      multi: false,
      options: [
        { key: 'A', text: '先按附件字段做加权评分', means: '权重要由数据本身的离散程度定' },
        { key: 'B', text: '先建约束规划再比方案', means: '求解成本更高，但约束能写全' },
        // 故意写成两句陈述：主进程的选项闸门应当丢掉它
        {
          key: 'C',
          text: '综上所述本文采用层次分析法',
          means: '我们先请专家打分确定权重。然后再用 TOPSIS 排序。'
        }
      ]
    },
    {
      ask: '缺失值这一轮怎么处置？',
      multi: false,
      options: [
        { key: 'A', text: '同组中位数插补', means: '保住样本量，但要说明为何不偏' },
        { key: 'B', text: '单独标记成一类', means: '后续把缺失本身当特征看' }
      ]
    }
  ]
}

function coachReply(userText, sys) {
  const submitted = userText.includes('任务卡')
  const quiz = submitted ? undefined : quizIfAllowed(sys)
  return JSON.stringify({
    next_question: submitted
      ? '这三格内容里，哪一条是你自己核对过附件原文的？'
      : '第二问的评价对象和评价指标分别是什么？',
    ...(quiz ? { quiz } : {}),
    checks: submitted
      ? [
          { item: '每问的输入输出明确', passed: true },
          { item: '评价对象与指标口径写清', passed: true },
          { item: '附件字段含义核对过', passed: true }
        ]
      : [
          { item: '每问的输入输出明确', passed: true },
          { item: '评价对象与指标口径写清', passed: false, note: '第二问只写了"求解"，没写指标' }
        ],
    hint: submitted ? null : { level: 1, text: '回到附件的字段说明那一段，逐字找评价对象。' },
    rubric_score: submitted
      ? { total: 88, comments: ['交付物清单还可以更具体'] }
      : { total: 62, comments: ['评价指标缺口径'] },
    blockers: submitted ? '' : '评价对象与指标口径'
  })
}

function sse(res, text, model) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const chunks = []
  for (let i = 0; i < text.length; i += 24) chunks.push(text.slice(i, i + 24))
  let n = 0
  const tick = () => {
    if (n < chunks.length) {
      const piece = chunks[n++]
      res.write(
        `data: ${JSON.stringify({ id: 'mock', model, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: piece } }] })}\n\n`
      )
      setTimeout(tick, 4)
      return
    }
    res.write(
      `data: ${JSON.stringify({
        id: 'mock',
        model,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 137, completion_tokens: 64 }
      })}\n\n`
    )
    res.write('data: [DONE]\n\n')
    res.end()
  }
  tick()
}

export function startMockLlm() {
  const calls = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const o = JSON.parse(body || '{}')
      const messages = Array.isArray(o.messages) ? o.messages : []
      const nonSystem = messages.filter((m) => m?.role !== 'system')
      const sys = String(messages.find((m) => m?.role === 'system')?.content ?? '')
      const isExecutor = sys.startsWith('你是 Executor')
      const isCritic = sys.startsWith('判断下面这段')
      const lastUser = String([...messages].reverse().find((m) => m?.role === 'user')?.content ?? '')
      calls.push({
        role: isExecutor ? 'executor' : isCritic ? 'critic' : 'coach',
        stream: o.stream === true,
        sys: sys.slice(0, 8000),
        user: lastUser.slice(0, 4000),
        // 去掉 system 之后的对话：验证上一轮的选择题确实回到了教练上下文里
        joined: nonSystem.map((m) => `${m.role}\u0001${String(m.content ?? '')}`).join('\u0002').slice(0, 40000)
      })
      const model = String(o.model ?? 'mock')
      let text
      if (isExecutor) text = JSON.stringify({ kind: 'code', fieldKey: null, content: SCAFFOLD_CODE })
      else if (isCritic) text = JSON.stringify({ violation: false, kind: 'none', evidence: '' })
      else text = coachReply(lastUser, sys)
      if (o.stream === true) sse(res, text, model)
      else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            id: 'mock',
            model,
            object: 'chat.completion',
            choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 137, completion_tokens: 64 }
          })
        )
      }
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      resolve({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        calls,
        stop: () =>
          new Promise((r) => {
            server.closeAllConnections?.()
            server.close(r)
          })
      })
    })
  })
}
