import { dialog } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, lstatSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { getDb } from './db'
import { workspaceDir, isBusy } from './sandbox'

const TABLES = ['sessions', 'messages', 'runs', 'stage_state', 'stage_outputs', 'ai_usage_log', 'paper_versions', 'session_methods', 'session_files', 'plot_intents', 'guided_choices', 'guided_analyses', 'prediction_labs'] as const
type Row = Record<string, string | number | null>
interface Bundle { format: 'tmm-backup-1'; tables: Record<(typeof TABLES)[number], Row[]>; files: { session: number; path: string; data: string; sha256: string }[] }
const MAX = 200 * 1024 * 1024
const hash = (data: Buffer): string => createHash('sha256').update(data).digest('hex')
function inside(root: string, name: string): string {
  if (!name || /[\\:<>"|?*\x00-\x1f]/.test(name) || name.split('/').some((s) => !s || s === '.' || s === '..' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s))) throw new Error('备份包含无效文件路径')
  const target = resolve(root, name)
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('备份文件路径越界')
  return target
}
export function createBackup(): Buffer {
  const db = getDb()
  const tables = {} as Record<(typeof TABLES)[number], Row[]>
  for (const table of TABLES) tables[table] = db.prepare(`SELECT * FROM ${table}`).all() as Row[]
  const files: Bundle['files'] = []
  let size = 0
  for (const session of tables.sessions) {
    const sid = Number(session.id)
    if (isBusy(sid)) throw new Error('请等待正在运行的实验结束后再备份。')
    const root = workspaceDir(sid)
    if (lstatSync(root).isSymbolicLink()) throw new Error('案例目录是链接，无法安全备份。')
    const walk = (dir: string, prefix = ''): void => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith('.mt-') || item.name === '.mplconfig' || item.name === '__pycache__') continue
        if (item.isSymbolicLink()) throw new Error('附件目录包含链接，无法安全备份。')
        const path = prefix + item.name
        const full = inside(root, path)
        if (item.isDirectory()) walk(full, path + '/')
        else if (item.isFile()) {
          size += lstatSync(full).size
          if (size > MAX / 2) throw new Error('附件超过 100 MB，请减少案例附件后重试。')
          const data = readFileSync(full)
          files.push({ session: sid, path, data: data.toString('base64'), sha256: hash(data) })
        }
      }
    }
    walk(root)
  }
  const included = new Set(files.map((f) => `${f.session}/${f.path}`.toLowerCase()))
  for (const row of tables.session_files) if (row.rel_path && !included.has(`${row.session_id}/${row.rel_path}`.toLowerCase())) throw new Error('部分登记附件已丢失，请补回附件后再备份。')
  const json = Buffer.from(JSON.stringify({ format: 'tmm-backup-1', tables, files } satisfies Bundle))
  if (json.length > MAX) throw new Error('备份超过 200 MB，暂不支持。')
  return gzipSync(json)
}

export function restoreBackup(data: Buffer): number {
  if (data.length > MAX) throw new Error('备份文件过大')
  const bundle = JSON.parse(gunzipSync(data, { maxOutputLength: MAX }).toString('utf8')) as Bundle
  if (bundle.format !== 'tmm-backup-1' || !bundle.tables || !Array.isArray(bundle.files)) throw new Error('不是支持的学习备份文件')
  const db = getDb()
  const columns = new Map<string, string[]>()
  for (const table of TABLES) {
    const names = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
    columns.set(table, names)
    if (!Array.isArray(bundle.tables[table])) throw new Error(`备份缺少 ${table}`)
    for (const row of bundle.tables[table]) {
      if (!row || Object.keys(row).length !== names.length || names.some((name) => !(name in row)) || Object.values(row).some((v) => v !== null && typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v)))) throw new Error('备份记录格式损坏或版本不兼容')
    }
  }
  const ids = new Set(bundle.tables.sessions.map((s) => s.id))
  if (ids.size !== bundle.tables.sessions.length || [...ids].some((id) => !Number.isSafeInteger(id) || Number(id) < 1)) throw new Error('案例编号损坏')
  for (const table of TABLES.slice(1)) for (const row of bundle.tables[table]) if (!ids.has(row.session_id)) throw new Error('备份存在不属于案例的记录')
  const seen = new Set<string>()
  const decoded = bundle.files.map((file) => {
    if (!ids.has(file.session) || typeof file.path !== 'string' || typeof file.data !== 'string') throw new Error('备份附件格式错误')
    inside(resolve('backup-validation'), file.path)
    const key = `${file.session}/${file.path}`.toLowerCase()
    if (seen.has(key)) throw new Error('备份附件路径重复')
    seen.add(key)
    const bytes = Buffer.from(file.data, 'base64')
    if (hash(bytes) !== file.sha256) throw new Error('附件校验失败，未恢复任何案例')
    return { ...file, bytes }
  })
  for (const row of bundle.tables.session_files) if (row.rel_path && !seen.has(`${row.session_id}/${row.rel_path}`.toLowerCase())) throw new Error('备份缺少登记的附件')
  const mapped = new Map<number, number>()
  const runs = new Map<number, number>()
  const created: string[] = []
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const table of TABLES) for (const source of bundle.tables[table]) {
      const row = { ...source }
      const oldId = Number(row.id)
      if (table === 'sessions') row.title = `${row.title}（恢复）`.slice(0, 60)
      else row.session_id = mapped.get(Number(row.session_id))!
      if (table === 'prediction_labs') {
        const state = JSON.parse(String(row.state_json))
        if (state.experiment) {
          const runId = runs.get(state.experiment.runId)
          if (!runId) throw new Error('实验记录引用损坏')
          state.experiment.runId = runId
        }
        row.state_json = JSON.stringify(state)
      }
      const names = columns.get(table)!.filter((name) => name !== 'id')
      const result = db.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...names.map((name) => row[name]!))
      if (table === 'sessions') {
        const id = Number(result.lastInsertRowid)
        mapped.set(oldId, id)
        const root = workspaceDir(id)
        if (lstatSync(root).isSymbolicLink()) throw new Error('恢复目录是链接，已停止')
        if (readdirSync(root).length) throw new Error('恢复目标目录已有文件，已停止以防覆盖')
        created.push(root)
      }
      if (table === 'runs') runs.set(oldId, Number(result.lastInsertRowid))
    }
    for (const file of decoded) {
      const path = inside(workspaceDir(mapped.get(file.session)!), file.path)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, file.bytes, { flag: 'wx' })
    }
    db.exec('COMMIT')
    return mapped.size
  } catch (error) {
    db.exec('ROLLBACK')
    // 只清理本次新建且确认为空后占用的案例目录。
    for (const root of created) rmSync(root, { recursive: true, force: true })
    throw error
  }
}

export async function exportBackup(): Promise<string | null> {
  const choice = await dialog.showSaveDialog({ title: '备份全部案例（含已删除案例，不含 API Key）', defaultPath: '学习案例.tmmbackup', filters: [{ name: '学习案例备份', extensions: ['tmmbackup'] }] })
  if (choice.canceled || !choice.filePath) return null
  const buffer = createBackup()
  const temp = choice.filePath + '.' + randomUUID() + '.tmp'
  try { writeFileSync(temp, buffer, { flag: 'wx' }); renameSync(temp, choice.filePath) }
  finally { if (existsSync(temp)) rmSync(temp) }
  return choice.filePath
}
export async function importBackup(): Promise<number | null> {
  const choice = await dialog.showOpenDialog({ title: '恢复备份为新案例（保留当前历史）', properties: ['openFile'], filters: [{ name: '学习案例备份', extensions: ['tmmbackup'] }] })
  if (choice.canceled || !choice.filePaths[0]) return null
  if (lstatSync(choice.filePaths[0]).size > MAX) throw new Error('备份文件过大')
  return restoreBackup(readFileSync(choice.filePaths[0]))
}

