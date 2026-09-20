import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ArtifactContent, RunPayload, RunRecord } from '../shared/sandbox'
import type { AdoptPayload, StageCard, StageView, SubmissionPayload, UsageRow } from '../shared/agent'
import type { CompileResult, PaperDraft } from '../shared/latex'
import type { UsageExportResult, UsageSummary } from '../shared/compliance'
import {
  IPC,
  type ActiveSettings,
  type ProviderPreset,
  type RuntimeInfo,
  type SendPayload,
  type SessionSummary,
  type SettingsView,
  type StreamEvent,
  type StoredMessage,
  type TestResult
} from '../shared/types'

const api = {
  getSettings: (): Promise<SettingsView> => ipcRenderer.invoke(IPC.SettingsGet),
  saveSettings: (s: ActiveSettings): Promise<SettingsView> => ipcRenderer.invoke(IPC.SettingsSave, s),
  setApiKey: (providerId: string, key: string): Promise<SettingsView> =>
    ipcRenderer.invoke(IPC.ApiKeySet, providerId, key),
  clearApiKey: (providerId: string): Promise<SettingsView> => ipcRenderer.invoke(IPC.ApiKeyClear, providerId),
  listProviders: (): Promise<ProviderPreset[]> => ipcRenderer.invoke(IPC.ProviderList),
  testProvider: (baseUrl: string, model: string, apiKey?: string): Promise<TestResult> =>
    ipcRenderer.invoke(IPC.ProviderTest, baseUrl, model, apiKey),
  listSessions: (): Promise<SessionSummary[]> => ipcRenderer.invoke(IPC.SessionList),
  getSession: (id: number): Promise<StoredMessage[]> => ipcRenderer.invoke(IPC.SessionGet, id),
  send: (payload: SendPayload): Promise<void> => ipcRenderer.invoke(IPC.ChatSend, payload),
  abort: (sessionId: number | null): Promise<void> => ipcRenderer.invoke(IPC.ChatAbort, sessionId),
  runtimeInfo: (): Promise<RuntimeInfo> => ipcRenderer.invoke(IPC.RuntimeInfo),
  runCode: (payload: RunPayload): Promise<RunRecord> => ipcRenderer.invoke(IPC.CodeRun, payload),
  stopRun: (sessionId: number): Promise<boolean> => ipcRenderer.invoke(IPC.CodeStop, sessionId),
  listRuns: (sessionId: number): Promise<RunRecord[]> => ipcRenderer.invoke(IPC.CodeHistory, sessionId),
  readArtifact: (sessionId: number, name: string): Promise<ArtifactContent> =>
    ipcRenderer.invoke(IPC.CodeArtifact, sessionId, name),
  listStages: (sessionId: number): Promise<StageView[]> => ipcRenderer.invoke(IPC.StageList, sessionId),
  currentStage: (sessionId: number): Promise<number> => ipcRenderer.invoke(IPC.StageCurrent, sessionId),
  openStage: (sessionId: number, stageId: number): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.StageOpen, sessionId, stageId),
  stageCard: (sessionId: number, stageId: number): Promise<StageCard> =>
    ipcRenderer.invoke(IPC.StageCard, sessionId, stageId),
  submitStage: (payload: SubmissionPayload): Promise<StageView[]> => ipcRenderer.invoke(IPC.StageSubmit, payload),
  askHint: (sessionId: number): Promise<void> => ipcRenderer.invoke(IPC.HintAsk, sessionId),
  adoptScaffold: (payload: AdoptPayload): Promise<void> => ipcRenderer.invoke(IPC.ScaffoldAdopt, payload),
  listUsage: (sessionId: number): Promise<UsageRow[]> => ipcRenderer.invoke(IPC.UsageList, sessionId),
  paperDraft: (sessionId: number): Promise<PaperDraft> => ipcRenderer.invoke(IPC.PaperDraft, sessionId),
  savePaper: (sessionId: number, source: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PaperSave, sessionId, source),
  compilePaper: (sessionId: number, source: string): Promise<CompileResult> =>
    ipcRenderer.invoke(IPC.PaperCompile, sessionId, source),
  stopCompile: (sessionId: number): Promise<boolean> => ipcRenderer.invoke(IPC.PaperStop, sessionId),
  paperPdf: (sessionId: number): Promise<ArtifactContent | null> => ipcRenderer.invoke(IPC.PaperPdf, sessionId),
  openPaper: (sessionId: number): Promise<void> => ipcRenderer.invoke(IPC.PaperOpen, sessionId),
  pinnedMethods: (sessionId: number): Promise<string[]> => ipcRenderer.invoke(IPC.MethodsPinned, sessionId),
  pinMethod: (sessionId: number, methodId: string, on: boolean): Promise<string[]> =>
    ipcRenderer.invoke(IPC.MethodsPin, sessionId, methodId, on),
  usageSummary: (sessionId: number): Promise<UsageSummary> => ipcRenderer.invoke(IPC.UsageSummary, sessionId),
  usagePdf: (sessionId: number): Promise<ArtifactContent | null> => ipcRenderer.invoke(IPC.UsagePdf, sessionId),
  openUsagePdf: (sessionId: number): Promise<void> => ipcRenderer.invoke(IPC.UsageOpen, sessionId),
  exportUsagePdf: (sessionId: number): Promise<UsageExportResult> => ipcRenderer.invoke(IPC.UsageExport, sessionId),
  onStream: (cb: (e: StreamEvent) => void): (() => void) => {
    const listener = (_ev: IpcRendererEvent, e: StreamEvent): void => cb(e)
    ipcRenderer.on(IPC.ChatStream, listener)
    return () => ipcRenderer.removeListener(IPC.ChatStream, listener)
  },
  onRuntimeUpdated: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.RuntimeUpdated, listener)
    return () => ipcRenderer.removeListener(IPC.RuntimeUpdated, listener)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
