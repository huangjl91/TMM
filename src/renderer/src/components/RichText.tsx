import type { ReactNode } from 'react'
import { escapeHtml, renderMath } from '../lib/math'

const TOKEN = /(```[\s\S]*?```|\$\$[\s\S]+?\$\$|`[^`\n]+`|\$[^$\n]+\$)/g

function inline(text: string): ReactNode {
  const html = escapeHtml(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

function segment(part: string, i: number): ReactNode {
  if (part.startsWith('```')) {
    const body = part.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '')
    return (
      <pre
        key={i}
        className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[13px]"
      >
        <code>{body}</code>
      </pre>
    )
  }
  if (part.startsWith('$$') && part.endsWith('$$')) {
    return (
      <div
        key={i}
        className="overflow-x-auto py-1 text-center"
        dangerouslySetInnerHTML={{ __html: renderMath(part.slice(2, -2), true) }}
      />
    )
  }
  if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
    return <code key={i} className="rounded bg-white/10 px-1">{part.slice(1, -1)}</code>
  }
  if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
    return (
      <span key={i} dangerouslySetInnerHTML={{ __html: renderMath(part.slice(1, -1), false) }} />
    )
  }
  return (
    <p key={i} className="whitespace-pre-wrap">
      {inline(part)}
    </p>
  )
}

export function RichText({ text }: { text: string }): ReactNode {
  const parts = text.includes('`') || text.includes('$') ? splitTokens(text) : [text]
  return <div className="space-y-2 leading-7">{parts.map(segment)}</div>
}

/** 没有反引号和美元符号就跳过正则，长回答里这能省掉大部分解析 */
function splitTokens(text: string): string[] {
  return text.split(TOKEN).filter((p) => p !== '')
}
