/** 编译结果与日志解析的共享契约：渲染层只认这几个类型 */

export type LatexSeverity = 'error' | 'warning'

export interface LatexIssue {
  severity: LatexSeverity
  /** 源码行号；日志没给行号时为 0，渲染层就不给跳转 */
  line: number
  /** 溢出类问题会给出行区间 */
  lineEnd?: number
  file: string
  message: string
  /** 面向学生的下一步动作。没把握就留空，不编造解释 */
  hint: string
  /** 日志原文片段，展开可核对 */
  raw: string
}

export interface CompileResult {
  ok: boolean
  /** 探到的 xelatex 路径；null 表示环境里没有 TeX，此时 errors 里只有一条安装指引 */
  engine: string | null
  durationMs: number
  /** 实际跑了几遍：出错时只跑一遍，成功才补第二遍解交叉引用 */
  passes: number
  pages: number
  pdfSize: number
  /** PDF 的修改时间，渲染层拿它做预览缓存 key */
  pdfRev: number
  errors: LatexIssue[]
  warnings: LatexIssue[]
  /** 解析不出来的原始日志尾巴：别让学生对着空白面板猜 */
  logTail: string
  timedOut?: boolean
  stopped?: boolean
}

export interface PaperDraft {
  source: string
  /** false 表示还是模板原文，学生一个字都没改 */
  edited: boolean
  updatedAt: number | null
}
