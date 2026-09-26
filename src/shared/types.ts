import type { CoachReply, MessageKind, Scaffold, StageView } from './agent'
import type { PlotAnswers } from './plots'

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
  /** 导入赛题与附件：选文件 + 提取 + 落会话工作区，一次完成 */
  SessionIntake: 'session:intake',
  SessionFiles: 'session:files',
  /** 逐问轴：读清单与当前聚焦，切聚焦 */
  SessionQuestions: 'session:questions',
  SessionQuestionSet: 'session:question:set',
  /** 赛题原始 PDF 回读与打开 */
  SessionProblemPdf: 'session:problem:pdf',
  SessionProblemOpen: 'session:problem:open',
  ChatSend: 'chat:send',
  ChatAbort: 'chat:abort',
  ChatStream: 'chat:stream',
  /** 右侧 AI 对话框：不走阶段任务卡，直接调模型，但保留反代写与留痕 */
  ChatFree: 'chat:free',
  ChatFreeAbort: 'chat:free:abort',
  ChatFreeHistory: 'chat:free:history',
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
  /** 讲解卡片每展开一层记一条：学生看的是哪个名词、看到第几层 */
  ExplainShown: 'explain:shown',
  /** 绘图三问：阶段 6/8 要代码骨架之前的必答输入 */
  PlotGet: 'plot:get',
  PlotAnswer: 'plot:answer',
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
  /** 引导式解题中心：从简单到难的选择题、问AI建议、数据可视化与结论推导 */
  GuidedGet: 'guided:get',
  GuidedChoose: 'guided:choose',
  GuidedAskAi: 'guided:askAi',
  GuidedSync: 'guided:sync',
  GuidedReanalyze: 'guided:reanalyze',
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
  /**
   * 自由对话专用：正文是流式发出去的，Critic 判定要等到定稿，
   * 判为代写时用这条把渲染层已经显示的草稿整段换掉。coach 走 card 事件覆盖，用不到它。
   */
  | { type: 'replace'; text: string }
  /** 阶段状态变了（教练反馈、提交、采纳、切换阶段都会推一次） */
  | { type: 'stages'; sessionId: number; stages: StageView[] }

export interface TokenUsage {
  input: number
  output: number
}

export interface SendPayload {
  sessionId: number | null
  text: string
  /** 学生答诊断选择题时带来的留痕文本，给了就记一条 quiz_answered */
  quizLog?: string
}

/** 右侧自由对话：没有阶段、没有 rubric，只有会话与文本 */
export interface FreeSendPayload {
  sessionId: number | null
  text: string
}

export interface ExplainShownPayload {
  sessionId: number
  /** 方法卡 id 或术语标题 */
  ref: string
  title: string
  kind: 'method' | 'term'
  /** 展开到第几层：0 一句话、1 类比、2 迷你例子、3 公式与符号 */
  level: number
}

export interface PlotAnswerPayload {
  sessionId: number
  stageId: number
  answers: PlotAnswers
}

export interface TestResult {
  ok: boolean
  latencyMs: number
  detail: string
}

export interface GuidedGetPayload {
  sessionId: number
  questionIdx: number
}

export interface GuidedChoosePayload {
  sessionId: number
  questionIdx: number
  step: 'intuition' | 'model_select' | 'formulation' | 'visualization'
  pickedKey: string
  pickedText: string
  pickedMeans: string
  userNote?: string
}

export interface GuidedAskAiPayload {
  sessionId: number
  questionIdx: number
  step: 'intuition' | 'model_select' | 'formulation' | 'visualization'
  ask: string
  options: { key: string; text: string; means: string }[]
}

export interface GuidedSyncPayload {
  sessionId: number
  questionIdx: number
}

export interface GuidedReanalyzePayload {
  sessionId: number
  questionIdx: number
}

export interface ProblemFileContent {
  name: string
  kind: 'pdf' | 'text' | 'empty'
  size: number
  dataUrl?: string
  fullText?: string
}
