import { ClockCounterClockwise, FolderOpen, Plus } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { SessionSummary } from '@shared/types'

interface Props {
  sessions: SessionSummary[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
}

export function SessionHistoryPanel({ sessions, activeId, onSelect, onNew }: Props): ReactNode {
  return (
    <section className="session-history-page">
      <div className="session-history-summary">
        <div>
          <strong>共 {sessions.length} 次建模</strong>
          <span>每次导入题目都会保留为独立记录，可随时继续。</span>
        </div>
        <button onClick={onNew}><Plus size={16} />新建建模</button>
      </div>

      {sessions.length === 0 ? (
        <div className="session-history-empty">
          <ClockCounterClockwise size={28} />
          <strong>还没有历史建模</strong>
          <span>导入第一道题后会自动出现在这里。</span>
        </div>
      ) : (
        <div className="session-history-list">
          {sessions.map((session) => {
            const active = session.id === activeId
            return (
              <button key={session.id} onClick={() => onSelect(session.id)} className={active ? 'is-active' : ''}>
                <span className="session-history-icon"><FolderOpen size={20} weight="duotone" /></span>
                <span className="session-history-copy">
                  <span className="session-history-title">{session.title}</span>
                  <span className="session-history-meta">
                    最后修改：{new Date(session.updatedAt).toLocaleString('zh-CN')}　·　{session.messageCount} 条讨论　·　{session.model}
                  </span>
                </span>
                <span className="session-history-action">{active ? '当前建模' : '打开继续'}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
