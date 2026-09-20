import katex from 'katex'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 模型输出属于外部文本，只让 KaTeX 生成的片段以 HTML 形式进入页面 */
export function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
      strict: false,
      trust: false
    })
  } catch {
    return `<code>${escapeHtml(tex)}</code>`
  }
}
