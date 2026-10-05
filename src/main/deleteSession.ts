import { app } from 'electron'
import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { getDb } from './db'

/** 只允许清除已移入回收区的案例及其专属工作目录。 */
export function permanentlyDeleteSession(id: number): void {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('案例编号无效')
  const db = getDb()
  const row = db.prepare('SELECT deleted_at FROM sessions WHERE id=?').get(id) as { deleted_at: number | null } | undefined
  if (!row || row.deleted_at === null) throw new Error('请先将案例移入“已删除”')
  const root = resolve(app.getPath('userData'), 'workspaces')
  const target = resolve(root, `session-${id}`)
  if (relative(root, target) !== `session-${id}`) throw new Error('案例目录校验失败')
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) throw new Error('工作目录是链接，已停止删除')
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() || relative(realpathSync(root), realpathSync(target)) !== `session-${id}`) throw new Error('案例目录是链接或超出范围，已停止删除')
    // 文件被占用时保留数据库记录，让用户释放占用后重试；不误报删除成功。
    try { rmSync(target, { recursive: true, force: true }) }
    catch { throw new Error('部分附件未能删除，案例仍在“已删除”中。请关闭占用附件的程序后重试；部分文件可能已经移除。') }
  }
  // foreign_keys=ON，关联的回答、实验、复盘和日志随案例一起删除。
  db.prepare('DELETE FROM sessions WHERE id=? AND deleted_at IS NOT NULL').run(id)
}
