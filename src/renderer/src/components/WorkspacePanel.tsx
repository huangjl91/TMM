import type { ReactNode } from 'react'
import type { RuntimeInfo, SessionSummary } from '@shared/types'
import type { MethodCard } from '@shared/methods'
import { MethodPanel } from './MethodPanel'

interface Props {
  sessions: SessionSummary[]
  activeId: number | null
  stageId: number
  runtime: RuntimeInfo | null
  pinned: string[]
  onSelect: (id: number) => void
  onNew: () => void
  onPin: (m: MethodCard, on: boolean) => void
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="shrink-0 text-white/40">{label}</span>
      <span className={'truncate font-mono text-[11px] ' + (warn ? 'text-amber-300' : 'text-white/65')}>{value}</span>
    </div>
  )
}

export function WorkspacePanel({
  sessions,
  activeId,
  stageId,
  runtime,
  pinned,
  onSelect,
  onNew,
  onPin
}: Props): ReactNode {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#12141a]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-xs font-semibold tracking-wide text-white/50">会话</span>
        <button onClick={onNew} className="text-[11px] text-sky-300/80 hover:text-sky-200">
          新建
        </button>
      </div>
      <div className="max-h-[35%] shrink-0 overflow-y-auto">
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

      <MethodPanel sessionId={activeId} stageId={stageId} pinned={pinned} onPin={onPin} />

      <div className="shrink-0 border-y border-white/10 px-4 py-3 text-[11px] leading-5">
        <div className="mb-1 text-xs font-semibold tracking-wide text-white/50">运行环境</div>
        <Row label="Python" value={runtime?.python ?? '探测中…'} warn={!runtime?.pythonReady} />
        <Row label="XeLaTeX" value={runtime?.xelatex ? '已找到' : '未探测到'} warn={!runtime?.xelatex} />
        <Row label="Electron" value={runtime?.electron ?? '-'} />
        <Row label="Node" value={runtime?.node ?? '-'} />
      </div>

      <div className="shrink-0 px-4 py-3 text-[11px] leading-5 text-white/35">
        <div className="mb-1 text-xs font-semibold tracking-wide text-white/50">工作区</div>
        <p>图表、数据文件与 paper.tex 按会话放在：</p>
        <p className="mt-1 break-all font-mono text-[10px] text-white/45">{runtime?.sandboxRoot ?? '-'}</p>
        <p className="mt-2">沙箱与论文编译共用这个目录，所以图按文件名就能引用。</p>
      </div>
    </aside>
  )
}
