import { useState, type ReactNode } from 'react'
import { HINT_LEVELS } from '@shared/stages'
import type { StageView } from '@shared/agent'

interface Props {
  stages: StageView[]
  currentId: number
  onOpen: (stageId: number) => void
}

const STATUS_MARK: Record<StageView['status'], string> = {
  todo: '○',
  active: '▶',
  submitted: '…',
  done: '✓'
}

export function StagePanel({ stages, currentId, onOpen }: Props): ReactNode {
  const [showRubric, setShowRubric] = useState(true)
  const current = stages.find((s) => s.id === currentId)

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-[#12141a]">
      <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold tracking-wide text-white/50">
        建模阶段
      </div>
      <ol className="flex-1 overflow-y-auto py-1">
        {stages.map((s) => {
          const isCurrent = s.id === currentId
          return (
            <li key={s.id}>
              <button
                onClick={() => onOpen(s.id)}
                className={
                  'w-full px-3 py-2 text-left text-sm hover:bg-white/5 ' +
                  (isCurrent ? 'bg-sky-500/10 text-sky-200' : s.locked ? 'text-white/25' : 'text-white/65')
                }
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 text-xs opacity-70">{s.locked ? '⊘' : STATUS_MARK[s.status]}</span>
                  <span className="w-4 text-right text-xs opacity-50">{s.id}</span>
                  <span className={s.status === 'done' ? 'line-through opacity-60' : ''}>{s.title}</span>
                  {s.blocking ? (
                    <span className="ml-auto rounded border border-amber-500/40 px-1 text-[10px] text-amber-300/80">
                      强制
                    </span>
                  ) : null}
                </div>
                {isCurrent ? (
                  <div className="mt-1 flex flex-wrap gap-1 pl-5 text-[10px]">
                    <span className="rounded bg-white/10 px-1 text-white/60">L{ s.hintLevel } {HINT_LEVELS[s.hintLevel]}</span>
                    {s.attempts > 0 ? <span className="rounded bg-white/10 px-1 text-white/60">未过 {s.attempts} 次</span> : null}
                    {s.score !== null ? <span className="rounded bg-white/10 px-1 text-white/60">评分 {s.score}</span> : null}
                  </div>
                ) : null}
              </button>
            </li>
          )
        })}
      </ol>
      {current ? (
        <div className="shrink-0 border-t border-white/10 text-[11px] leading-4">
          <button
            onClick={() => setShowRubric((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-white/50 hover:bg-white/5"
          >
            <span>{showRubric ? '▾' : '▸'}</span>
            <span>本阶段评分点与失分项</span>
          </button>
          {showRubric ? (
            <div className="max-h-56 overflow-y-auto px-4 pb-3 pl-7 text-white/45">
              <div className="mb-1 text-white/60">{current.output}</div>
              <ul className="mb-2 list-disc space-y-0.5 pl-4">
                {current.rubric.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <div className="mb-1 text-amber-300/70">常见失分</div>
              <ul className="list-disc space-y-0.5 pl-4 text-amber-200/50">
                {current.rubric.pitfalls.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
