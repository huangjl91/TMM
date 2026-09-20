import type { TokenUsage } from '../../shared/types'

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamOpts {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMsg[]
  temperature?: number
  signal?: AbortSignal
  /** 要求服务端返回 JSON 对象；不支持的端点会自动降级成普通补全 */
  jsonMode?: boolean
}

export type StreamKind = 'delta' | 'reasoning'

export interface StreamResult {
  content: string
  reasoning: string
  usage: TokenUsage | null
}

function endpoint(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path
}

/** 按 SSE 规范切事件块，兼容跨分片到达与 CRLF 换行 */
function drain(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = parts.pop() ?? ''
  return { events: parts.filter((p) => p.trim().length > 0), rest }
}

function toUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as Record<string, unknown>
  const input = Number(u.prompt_tokens ?? 0)
  const output = Number(u.completion_tokens ?? 0)
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null
  return { input, output }
}

function post(opts: StreamOpts, jsonMode: boolean): Promise<Response> {
  return fetch(endpoint(opts.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      stream: true,
      stream_options: { include_usage: true },
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
    }),
    signal: opts.signal
  })
}

export async function streamChat(
  opts: StreamOpts,
  onEvent: (kind: StreamKind, text: string) => void
): Promise<StreamResult> {
  let res = await post(opts, opts.jsonMode === true)
  // 端点不认 response_format 就退回普通补全：解析层本来就容错，别让整个对话挂掉
  if (!res.ok && opts.jsonMode && res.status === 400) {
    await res.body?.cancel().catch(() => undefined)
    res = await post(opts, false)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 400) : ''}`)
  }
  if (!res.body) throw new Error('响应没有可读流')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''
  let usage: TokenUsage | null = null

  const handle = (data: string): void => {
    let json: any
    try {
      json = JSON.parse(data)
    } catch {
      return
    }
    if (json.usage) usage = toUsage(json.usage)
    const d = json.choices?.[0]?.delta
    if (!d) return
    // deepseek-reasoner、qwen3 等把思维链放在 reasoning_content，与正文分开显示
    if (typeof d.reasoning_content === 'string' && d.reasoning_content) {
      reasoning += d.reasoning_content
      onEvent('reasoning', d.reasoning_content)
    }
    if (typeof d.content === 'string' && d.content) {
      content += d.content
      onEvent('delta', d.content)
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = drain(buffer)
    buffer = rest
    for (const evt of events) {
      for (const line of evt.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data && data !== '[DONE]') handle(data)
      }
    }
  }

  return { content, reasoning, usage }
}

/** 非流式一次性补全：Critic 判定和 Executor 脚手架用得上 */
export async function completeText(opts: {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMsg[]
  temperature?: number
  jsonMode?: boolean
  maxTokens?: number
  signal?: AbortSignal
}): Promise<string> {
  const res = await fetch(endpoint(opts.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens,
      stream: false,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {})
    }),
    signal: opts.signal
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 300) : ''}`)
  }
  const json: any = await res.json().catch(() => null)
  return String(json?.choices?.[0]?.message?.content ?? '')
}

export async function testConnection(opts: {
  baseUrl: string
  apiKey: string
  model: string
}): Promise<{ latencyMs: number; reply: string }> {
  const started = Date.now()
  const res = await fetch(endpoint(opts.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping' }]
    })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`)
  }
  const json: any = await res.json().catch(() => null)
  return {
    latencyMs: Date.now() - started,
    reply: String(json?.choices?.[0]?.message?.content ?? '').slice(0, 40)
  }
}
