/** 沙箱执行结果，字段与 sandbox/runner.py 写出的 JSON 一一对应 */

export interface SandboxLimits {
  jobObject: boolean
  memory: boolean
  error: string | null
}

/** savefig 落地那一刻从 figure 上抄下来的客观事实：只记名称与有没有，不判美丑 */
export interface PlotAxisMeta {
  xlabel: string
  ylabel: string
  title: string
  legend: boolean
  curves: number
}

export interface PlotMeta {
  dpi: number
  figWidth: number
  figHeight: number
  axes: PlotAxisMeta[]
}

export interface ArtifactInfo {
  name: string
  ext: string
  size: number
  /** 图片类直接内联 dataUrl，避免渲染层碰文件系统 */
  inline: boolean
  dataUrl?: string
  /** PNG 像素宽高（读文件头，跟 savefig 参数对不对得上看图的人自己判断） */
  px?: [number, number]
  /** matplotlib 存的图才有；别的途径出的图不判 */
  plotMeta?: PlotMeta
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
  /**
   * 图表规范的客观缺项（本地检查，主进程随这次运行给出并留痕）。
   * 不存库：图还在工作区，重开界面时不该把同一份提示再记一遍。
   */
  plotHints?: string[]
  /** 同类报错第几次了；0 或 1 表示刚开始，到 2 才升级成「先发给教练」 */
  errorStreak?: number
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
