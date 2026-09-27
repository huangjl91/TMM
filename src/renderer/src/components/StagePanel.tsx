import { type ReactNode } from 'react'
import { Books, ClockCounterClockwise, Path } from '@phosphor-icons/react'
import type { StageView } from '@shared/agent'

type NavKey = 'path' | 'history' | 'library'
interface Props { stages: StageView[]; currentId: number; onOpen: (stageId: number) => void; activeNav?: NavKey; onNavigate?: (key: NavKey) => void }
const groups = [
  { label: '问题理解', range: '1–3', ids: [1, 2, 3] },
  { label: '建模求解', range: '4–8', ids: [4, 5, 6, 7, 8] },
  { label: '表达交付', range: '9–11', ids: [9, 10, 11] }
]

export function StagePanel({ stages, currentId, onOpen, activeNav = 'path', onNavigate }: Props): ReactNode {
  return <aside className="tmm-rail" aria-label="主导航">
    <div className="tmm-rail-brand">T</div>
    <button onClick={() => onNavigate?.('path')} className={`tmm-rail-item ${activeNav === 'path' ? 'is-active' : ''}`} title="建模路径"><Path size={20} weight="duotone" /><small>建模路径</small></button>
    <button onClick={() => onNavigate?.('history')} className={`tmm-rail-item ${activeNav === 'history' ? 'is-active' : ''}`} title="历史建模"><ClockCounterClockwise size={20} weight="regular" /><small>历史</small></button>
    <button onClick={() => onNavigate?.('library')} className={`tmm-rail-item ${activeNav === 'library' ? 'is-active' : ''}`} title="资料库"><Books size={20} weight="regular" /><small>资料</small></button>
    <div className="tmm-rail-spacer" />
    <div className="tmm-rail-step">{currentId}<small>/ 11</small></div>
    <ol className="tmm-stage-semantics" aria-label="完整建模阶段">
      {stages.map((stage) => <li key={stage.id}>
        <button onClick={() => onOpen(stage.id)} aria-disabled={stage.locked}>
          {stage.status === 'done' ? '✓' : stage.status === 'active' ? '▶' : '○'} {stage.id} {stage.title}
          {stage.blocking ? ' 强制' : ''}
        </button>
      </li>)}
    </ol>
  </aside>
}

export function JourneyProgress({ stages, currentId, onOpen }: Props): ReactNode {
  const current = stages.find((stage) => stage.id === currentId)
  const next = stages.find((stage) => stage.id === currentId + 1)
  return <div className="tmm-journey">
    <div className="tmm-journey-groups">{groups.map((group) =>
      <section className="tmm-journey-group" key={group.label}>
        <div className="tmm-journey-label"><strong>{group.label}</strong><span>{group.range}</span></div>
        <div className="tmm-journey-dots">{group.ids.map((id) => {
          const stage = stages.find((item) => item.id === id)
          const locked = stage?.locked === true
          return <button key={id} onClick={() => onOpen(id)} aria-disabled={locked}
            title={locked ? `阶段 ${id} 尚未解锁；点击查看前置要求` : `打开阶段任务：${stage?.title ?? id}`}
            className={`${id === currentId ? 'is-current' : stage?.status === 'done' ? 'is-done' : ''}${locked ? ' is-locked' : ''}`}>
            {stage?.status === 'done' ? '✓' : id}
          </button>
        })}</div>
      </section>
    )}</div>
    <div className="tmm-current-step">
      <span>当前 <strong>{currentId} / 11</strong></span>
      <span>本步 <strong>{current?.title ?? '准备开始'}</strong></span>
      <span>下一步 <strong>{next?.title ?? '完成'}</strong></span>
    </div>
  </div>
}
