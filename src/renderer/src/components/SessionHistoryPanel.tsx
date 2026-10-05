import { ClockCounterClockwise, FolderOpen, Plus } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { SessionSummary } from '@shared/types'

interface Props {
  sessions: SessionSummary[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onChanged: (deletedId?: number) => Promise<void>
  dataPath?: string
  busy?: boolean
}

export function SessionHistoryPanel({ sessions, activeId, onSelect, onNew, onChanged, dataPath, busy }: Props): ReactNode {
  const [trash, setTrash] = useState<SessionSummary[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [permanentId, setPermanentId] = useState<number | null>(null)
  async function removeForever(id: number): Promise<void> {
    setPending(true); setError(''); setNotice('')
    try {
      await window.api.permanentlyDeleteSession(id)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key?.startsWith(`tmm-learning-draft:${id}:`)) localStorage.removeItem(key)
      }
      await onChanged(id)
      setTrash(await window.api.listDeletedSessions())
      setPermanentId(null)
      setNotice('案例及本软件保存的附件、学习和实验记录已永久删除。')
    } catch (e) { setError((e as Error).message) }
    finally { setPending(false) }
  }
  async function backup(restore: boolean): Promise<void> {
    setPending(true); setError(''); setNotice('')
    try {
      if (restore) {
        const count = await window.api.importBackup()
        if (count !== null) {
          await onChanged()
          setTrash(await window.api.listDeletedSessions())
          setNotice(`已追加恢复 ${count} 个案例（含已删除案例），现有历史保持不变。`)
        }
      } else {
        const path = await window.api.exportBackup()
        if (path) setNotice(`备份已保存：${path}`)
      }
    } catch (e) { setError((e as Error).message) }
    finally { setPending(false) }
  }
  useEffect(() => { void window.api.listDeletedSessions().then(setTrash).catch((e: Error) => setError(e.message)) }, [])
  async function change(id: number, deleted: boolean): Promise<void> {
    setPending(true); setError('')
    try {
      await window.api.setSessionDeleted(id, deleted)
      await onChanged(deleted ? id : undefined)
      setTrash(await window.api.listDeletedSessions())
      setConfirmId(null)
    } catch (e) { setError((e as Error).message) }
    finally { setPending(false) }
  }
  return (
    <section className="session-history-page">
      <p className="history-location">历史保存位置：{dataPath || '正在读取…'}{dataPath && /[\\/]\.tmp[\\/]/.test(dataPath) ? '（独立测试窗口，和正常启动的历史分开）' : ''}</p>
      <div className="history-confirm"><button disabled={pending || busy} onClick={() => void backup(false)}>备份全部案例</button><button disabled={pending || busy} onClick={() => void backup(true)}>从备份恢复</button><small>包含附件、学习与实验记录及已删除案例；不含 API Key。恢复会追加新案例。附件合计上限 100 MB。</small></div>
      {notice ? <p role="status">{notice}</p> : null}
      <button onClick={() => { setShowTrash(!showTrash); setConfirmId(null) }}>{showTrash ? '返回历史' : `已删除（${trash.length}）`}</button>
      {error ? <p role="alert">{error}</p> : null}
      {showTrash ? <div className="history-trash">
        <p>删除的案例保留在这里，附件和学习记录仍可恢复。</p>
        {!trash.length ? <p>暂无已删除案例。</p> : trash.map((item) => <div key={item.id} style={{ flexWrap: 'wrap' }}>
          <span>{item.title}</span>
          <button disabled={pending || busy} onClick={() => void change(item.id, false)}>恢复</button>
          <button className="history-delete" disabled={pending || busy} onClick={() => setPermanentId(item.id)}>永久删除</button>
          {permanentId === item.id ? <div className="history-confirm" role="alert">
            <span>永久删除“{item.title}”？本软件中的附件副本、回答、实验结果和学习记录将一起删除，无法在“已删除”中恢复。外部原文件和之前导出的备份不受影响。</span>
            <button disabled={pending || busy} onClick={() => void removeForever(item.id)}>确认永久删除</button>
            <button disabled={pending} onClick={() => setPermanentId(null)}>取消</button>
          </div> : null}
        </div>)}
      </div> : <>
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
              <div key={session.id} className="history-row">
              <button disabled={pending} onClick={() => onSelect(session.id)} className={active ? 'is-active' : ''}>
                <span className="session-history-icon"><FolderOpen size={20} weight="duotone" /></span>
                <span className="session-history-copy">
                  <span className="session-history-title">{session.title}</span>
                  <span className="session-history-meta">
                    最后修改：{new Date(session.updatedAt).toLocaleString('zh-CN')}　·　{session.messageCount} 条讨论　·　{session.model}
                  </span>
                </span>
                <span className="session-history-action">{active ? '当前建模' : '打开继续'}</span>
              </button>
              <button className="history-delete" disabled={pending || busy} onClick={() => setConfirmId(session.id)} aria-label={`删除案例：${session.title}`}>删除</button>
              {confirmId === session.id ? <div className="history-confirm" role="alert">
                <span>将“{session.title}”移到已删除？以后可以恢复。</span>
                <button disabled={pending || busy} onClick={() => void change(session.id, true)}>确认删除</button>
                <button disabled={pending} onClick={() => setConfirmId(null)}>取消</button>
              </div> : null}
              </div>
            )
          })}
        </div>
      )}
      </>}
    </section>
  )
}
