import { useState, type ReactNode } from 'react'
import type { RuntimeInfo, SessionSummary } from '@shared/types'
import type { SessionFileView } from '@shared/intake'
import { humanSize } from '@shared/intake'
import type { MethodCard } from '@shared/methods'
import type { ExplainSource } from '@shared/explain'
import { MethodPanel } from './MethodPanel'

interface Props {
  sessions: SessionSummary[]
  activeId: number | null
  stageId: number
  runtime: RuntimeInfo | null
  pinned: string[]
  files: SessionFileView[]
  onSelect: (id: number) => void
  onNew: () => void
  onPin: (m: MethodCard, on: boolean) => void
  onExplain: (src: ExplainSource, level: number) => void
  initiallyOpen?: boolean
  embedded?: boolean
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="shrink-0 text-white/40">{label}</span>
      <span className={'truncate font-mono text-[11px] ' + (warn ? 'text-amber-300' : 'text-white/65')}>{value}</span>
    </div>
  )
}

/**
 * 右侧栏的下半部分：会话、附件、方法库、运行环境、工作区路径。
 *
 * 这些是「查资料用」的，不该和上方的 AI 对话框抢地方，所以默认收起成一条摘要，
 * 点开才展开成固定高度的一列——固定高度是必须的：里面的 MethodPanel 靠 flex-1 自己滚，
 * 换成 max-height + overflow 会让它塌掉。
 */
export function WorkspacePanel({
  sessions,
  activeId,
  stageId,
  runtime,
  pinned,
  files,
  onSelect,
  onNew,
  onPin,
  onExplain,
  initiallyOpen = false,
  embedded = false
}: Props): ReactNode {
  const [open, setOpen] = useState(initiallyOpen)
  const visible = embedded || open

  return (
    <div className={embedded ? 'flex min-h-0 flex-1 flex-col bg-[#12141a]' : 'flex shrink-0 flex-col border-t border-white/10 bg-[#12141a]'}>
      {!embedded ? <button
        onClick={() => setOpen(!open)}
        title={open ? '收起工作区' : '展开会话、附件、方法库与运行环境'}
        className="flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-white/[0.03]"
      >
        <span className="text-xs font-semibold tracking-wide text-white/50">
          工作区 · 会话 {sessions.length} · 附件 {files.length}
        </span>
        <span className="shrink-0 text-[10px] text-white/35">{open ? '▾ 收起' : '▸ 展开'}</span>
      </button> : null}

      {visible ? (
        <div className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'flex h-[46vh] min-h-0 flex-col border-t border-white/5'}>
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
            <span className="text-[11px] font-semibold tracking-wide text-white/40">会话</span>
            <button onClick={onNew} className="text-[11px] text-sky-300/80 hover:text-sky-200">
              新建
            </button>
          </div>
          <div className="max-h-52 shrink-0 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="px-4 py-3 text-[11px] text-white/30">还没有会话</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={
                    'block w-full border-b border-white/5 px-4 py-2.5 text-left ' +
                    (s.id === activeId ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]')
                  }
                >
                  <div className="truncate text-[13px] text-white/80">{s.title}</div>
                  <div className="mt-0.5 text-[11px] text-white/35">
                    {s.model} · {s.messageCount} 条 · {new Date(s.updatedAt).toLocaleString('zh-CN')}
                  </div>
                </button>
              ))
            )}
          </div>

          {files.length > 0 ? (
            <div className="max-h-40 shrink-0 overflow-y-auto border-t border-white/10 px-4 py-2.5">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[11px] font-semibold tracking-wide text-white/50">赛题与附件</span>
                <span className="text-[10px] text-white/30">
                  {files.filter((f) => f.relPath).length} 个已导入
                </span>
              </div>
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="text-[11px] leading-4">
                    <div className="flex items-baseline gap-1.5">
                      <span className={f.kind === 'problem' ? 'text-sky-300/80' : 'text-white/70'}>
                        {f.kind === 'problem' ? '题' : '附'}
                      </span>
                      <span className="truncate text-white/70" title={f.relPath || f.name}>
                        {f.name}
                      </span>
                      <span className="ml-auto shrink-0 text-white/30">{humanSize(f.size)}</span>
                    </div>
                    {f.relPath ? (
                      <div className="truncate pl-5 font-mono text-[10px] text-white/30" title={f.relPath}>
                        {f.relPath}
                      </div>
                    ) : (
                      <div className="pl-5 text-[10px] text-amber-300/70">{f.digest}</div>
                    )}
                  </li>
                ))}
              </ul>
              {files.some((f) => f.needsVerify) ? (
                <p className="mt-1.5 text-[10px] leading-4 text-amber-300/70">
                  PDF 提取的文本可能有错乱，用之前先和纸质题面对一下。
                </p>
              ) : null}
            </div>
          ) : null}

          <MethodPanel
            sessionId={activeId}
            stageId={stageId}
            pinned={pinned}
            onPin={onPin}
            onExplain={onExplain}
          />

          <div className="shrink-0 border-t border-white/10 px-4 py-3 text-[11px] leading-5">
            <div className="mb-1 text-xs font-semibold tracking-wide text-white/50">运行环境</div>
            <Row label="Python" value={runtime?.python ?? '探测中…'} warn={!runtime?.pythonReady} />
            <Row label="XeLaTeX" value={runtime?.xelatex ? '已找到' : '未探测到'} warn={!runtime?.xelatex} />
            <Row label="Electron" value={runtime?.electron ?? '-'} />
            <Row label="Node" value={runtime?.node ?? '-'} />
          </div>

          <div className="shrink-0 border-t border-white/10 px-4 py-3 text-[11px] leading-5 text-white/35">
            <div className="mb-1 text-xs font-semibold tracking-wide text-white/50">工作区</div>
            <p>图表、数据文件与论文草稿按会话保存在本机。</p>
            <p className="mt-1">代码实验和论文编译使用同一会话目录，生成的图表可以直接按文件名引用。</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
