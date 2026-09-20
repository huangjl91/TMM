/** 沙箱执行结果，字段与 sandbox/runner.py 写出的 JSON 一一对应 */

export interface SandboxLimits {
  jobObject: boolean
  memory: boolean
  error: string | null
}

export interface ArtifactInfo {
  name: string
  ext: string
  size: number
  /** 图片类直接内联 dataUrl，避免渲染层碰文件系统 */
  inline: boolean
  dataUrl?: string
}

export interface SandboxError {
  type: string
  message: string
  traceback: string
}

export interface RunOutcome {
  ok: boolean
  stdout: string
  stderr: string
  error: SandboxError | null
  durationMs: number
  limits: SandboxLimits
  artifacts: ArtifactInfo[]
  artifactError?: string
}

export interface RunRecord extends RunOutcome {
  id: number
  sessionId: number
  code: string
  /** 墙钟超时被 taskkill 干掉，runner 自己没写结果 */
  timedOut: boolean
  exitCode: number | null
  createdAt: number
}

export interface RunPayload {
  sessionId: number | null
  code: string
}

/** 按需回读的工作区文件：图片给 dataUrl，文本给原文 */
export interface ArtifactContent {
  dataUrl?: string
  text?: string
  size: number
}
