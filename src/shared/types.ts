import type { CoachReply, MessageKind, Scaffold, StageView } from './agent'

export const IPC = {
  SettingsGet: 'settings:get',
  SettingsSave: 'settings:save',
  ApiKeySet: 'apikey:set',
  ApiKeyClear: 'apikey:clear',
  ProviderList: 'provider:list',
  ProviderTest: 'provider:test',
  SessionList: 'session:list',
  SessionCreate: 'session:create',
  SessionGet: 'session:get',
  ChatSend: 'chat:send',
  ChatAbort: 'chat:abort',
  ChatStream: 'chat:stream',
  CodeRun: 'code:run',
  CodeStop: 'code:stop',
  CodeHistory: 'code:history',
  CodeArtifact: 'code:artifact',
  StageList: 'stage:list',
  StageCurrent: 'stage:current',
  StageOpen: 'stage:open',
  StageCard: 'stage:card',
  StageSubmit: 'stage:submit',
  HintAsk: 'hint:ask',
  ScaffoldAdopt: 'scaffold:adopt',
  UsageList: 'usage:list',
  RuntimeInfo: 'runtime:info',
  PaperDraft: 'paper:draft',
  PaperSave: 'paper:save',
  PaperCompile: 'paper:compile',
  PaperStop: 'paper:stop',
  PaperPdf: 'paper:pdf',
  PaperOpen: 'paper:open',
  MethodsPinned: 'methods:pinned',
  MethodsPin: 'methods:pin',
  UsageSummary: 'compliance:summary',
  UsageExport: 'compliance:export',
  UsagePdf: 'compliance:pdf',
  UsageOpen: 'compliance:open',
  /** Python/TeX 是异步探测的，探完要通知渲染层重新拉一次 */
  RuntimeUpdated: 'runtime:updated'
} as const

export type ProviderId = 'deepseek' | 'zhipu' | 'qwen' | 'moonshot' | 'openai' | 'custom'

export interface ProviderPreset {
  id: ProviderId
  label: string
  baseUrl: string
  models: string[]
  keyUrl: string
}

export interface ActiveSettings {
  providerId: ProviderId
  baseUrl: string
  model: string
  temperature: number
}

export interface SettingsView extends ActiveSettings {
  hasApiKey: boolean
}

export interface RuntimeInfo {
  electron: string
  node: string
  chrome: string
  dbPath: string
  /** 学生要能自己去翻图表和 csv，别把产物藏起来 */
  sandboxRoot: string
  python: string | null
  /** 探到 Python 但没装 numpy/matplotlib，画图和拟合都无从谈起 */
  pythonReady: boolean
  xelatex: string | null
}

export type ChatRole = 'system' | 'user' | 'assistant'

export interface StoredMessage {
  id: number
  role: ChatRole
  content: string
  /** 思维链要能回看，它也是 AI 使用记录的一部分 */
  reasoning?: string
  createdAt: number
  error?: string
  /** coach 的 content 是 CoachReply 的 JSON，其余是普通文本 */
  kind?: MessageKind
}

export interface SessionSummary {
  id: number
  title: string
  model: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export type StreamEvent =
  | { type: 'start'; sessionId: number; messageId: number; kind: MessageKind }
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done'; usage: TokenUsage | null }
  | { type: 'aborted' }
  | { type: 'error'; message: string }
  /** 教练卡片定稿（可能已被 Critic 重写），渲染层用它覆盖流式草稿 */
  | { type: 'card'; card: CoachReply }
  /** Executor 的示例/脚手架，等学生点「采纳」才落地 */
  | { type: 'scaffold'; scaffold: Scaffold }
  /** 阶段状态变了（教练反馈、提交、采纳、切换阶段都会推一次） */
  | { type: 'stages'; sessionId: number; stages: StageView[] }

export interface TokenUsage {
  input: number
  output: number
}

export interface SendPayload {
  sessionId: number | null
  text: string
}

export interface TestResult {
  ok: boolean
  latencyMs: number
  detail: string
}
