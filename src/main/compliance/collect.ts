import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { PROVIDERS } from '../llm/presets'
import {
  countPaperVersions,
  countRuns,
  getSessionMessages,
  listAiUsage,
  loadSettings,
  latestStageOutputs,
  pinnedMethods,
  sessionInfo
} from '../repo'
import { stageViews } from '../stage'
import { methodById } from '../../shared/methods'
import { stageByKey } from '../../shared/stages'
import {
  summarizeReport,
  type PolicyConfig,
  type ReportEvent,
  type ReportTool,
  type UsageReport,
  type UsageSummary
} from '../../shared/compliance'

/**
 * 合规留痕的采集层：把本机数据库里的记录拼成 UsageReport。
 *
 * 密钥在这层是拿不到的——secrets.ts 只在调用模型时现取现用，这里连读都不读，
 * 导出的《AI 工具使用详情》只写服务提供方与主机名，够说明「用了哪家的服务」，
 * 又不会把凭据写进一份要交给评委的 PDF。
 */
let cachedPolicy: PolicyConfig | null = null

/** 打包后配置在 resources/compliance 下（electron-builder 的 extraResources），开发态退回仓库 */
export function policyConfig(): PolicyConfig {
  if (cachedPolicy) return cachedPolicy
  const candidates = [
    join(process.resourcesPath ?? '', 'compliance', 'ai-policy.json'),
    join(__dirname, '..', '..', 'resources', 'compliance', 'ai-policy.json')
  ]
  for (const p of candidates) {
    if (!p || !existsSync(p)) continue
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as PolicyConfig
    if (!Array.isArray(parsed.requiredItems) || !parsed.actionLabels) break
    cachedPolicy = parsed
    return parsed
  }
  throw new Error('找不到合规配置 resources/compliance/ai-policy.json，请重新安装应用')
}

function toolInfo(): ReportTool {
  const s = loadSettings()
  let host = ''
  try {
    host = new URL(s.baseUrl).hostname
  } catch {
    host = ''
  }
  return {
    appName: app.getName(),
    appVersion: app.getVersion(),
    electron: process.versions.electron ?? '未知',
    node: process.versions.node ?? '未知',
    platform: `${process.platform} ${process.arch}`,
    provider: PROVIDERS.find((p) => p.id === s.providerId)?.label ?? s.providerId,
    baseUrlHost: host,
    models: [s.model]
  }
}

export function collectReport(sessionId: number): UsageReport {
  const info = sessionInfo(sessionId)
  if (!info) throw new Error('会话不存在，先把题目贴进对话再导出')
  const events: ReportEvent[] = listAiUsage(sessionId).map((u) => ({
    at: u.createdAt,
    stageId: u.stageId,
    action: u.action,
    level: u.level,
    detail: u.detail,
    model: u.model
  }))
  const tool = toolInfo()
  const models = new Set<string>([...tool.models, info.model])
  for (const e of events) if (e.model) models.add(e.model)

  const disclosure = stageByKey('disclosure')
  let review = ''
  if (disclosure) {
    const key = disclosure.fields.some((f) => f.key === 'review') ? 'review' : (disclosure.fields[0]?.key ?? 'review')
    review = latestStageOutputs(sessionId, disclosure.id)[key] ?? ''
  }

  return {
    sessionId,
    title: info.title,
    startedAt: info.createdAt,
    generatedAt: Date.now(),
    policy: policyConfig(),
    tool: { ...tool, models: [...models].filter(Boolean) },
    stages: stageViews(sessionId).map((v) => ({
      id: v.id,
      title: v.title,
      status: v.status,
      hintLevel: v.hintLevel,
      attempts: v.attempts,
      score: v.score,
      blocking: v.blocking
    })),
    events,
    // system 消息是应用的内部提示词，不属于师生交互，也不该出现在提交材料里
    turns: getSessionMessages(sessionId)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ at: m.createdAt, role: m.role as 'user' | 'assistant', kind: m.kind ?? 'chat', content: m.content })),
    extra: {
      codeRuns: countRuns(sessionId),
      paperSaves: countPaperVersions(sessionId),
      pinnedMethods: pinnedMethods(sessionId).map((id) => methodById(id)?.name ?? id)
    },
    review
  }
}

export function usageSummary(sessionId: number): UsageSummary {
  return summarizeReport(collectReport(sessionId))
}
