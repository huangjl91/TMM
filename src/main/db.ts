import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let db: DatabaseSync | null = null
let dbFile = ''

/** 迁移列表：只追加，不修改历史项 */
const MIGRATIONS: string[] = [
  `CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE secrets (
     provider_id TEXT PRIMARY KEY,
     blob        BLOB NOT NULL,
     updated_at  INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     title      TEXT NOT NULL,
     provider   TEXT NOT NULL,
     model      TEXT NOT NULL,
     stage_key  TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE messages (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     role            TEXT NOT NULL,
     content         TEXT NOT NULL,
     reasoning       TEXT,
     kind            TEXT NOT NULL DEFAULT 'chat',
     usage_input     INTEGER,
     usage_output    INTEGER,
     created_at      INTEGER NOT NULL
   );
   CREATE INDEX idx_messages_session ON messages(session_id, id);`,
  `CREATE TABLE runs (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     code          TEXT NOT NULL,
     ok            INTEGER NOT NULL,
     stdout        TEXT NOT NULL DEFAULT '',
     stderr        TEXT NOT NULL DEFAULT '',
     error_type    TEXT,
     error_message TEXT,
     traceback     TEXT,
     artifacts     TEXT NOT NULL DEFAULT '[]',
     limits        TEXT NOT NULL DEFAULT '{}',
     duration_ms   INTEGER NOT NULL DEFAULT 0,
     timed_out     INTEGER NOT NULL DEFAULT 0,
     exit_code     INTEGER,
     created_at    INTEGER NOT NULL
   );
   CREATE INDEX idx_runs_session ON runs(session_id, id);`,
  `CREATE TABLE stage_state (
     session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     stage_id   INTEGER NOT NULL,
     status     TEXT NOT NULL DEFAULT 'todo',
     hint_level INTEGER NOT NULL DEFAULT 0,
     attempts   INTEGER NOT NULL DEFAULT 0,
     score      INTEGER,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (session_id, stage_id)
   );
   CREATE TABLE stage_outputs (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     stage_id   INTEGER NOT NULL,
     field_key  TEXT NOT NULL,
     content    TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX idx_outputs_session ON stage_outputs(session_id, stage_id, id);
   CREATE TABLE ai_usage_log (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     stage_id   INTEGER,
     action     TEXT NOT NULL,
     level      INTEGER,
     detail     TEXT NOT NULL DEFAULT '',
     model      TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   );
   CREATE INDEX idx_usage_session ON ai_usage_log(session_id, id);`,
  // 论文稿追加式存版本：M5 的《AI 工具使用详情》要能说清正文是谁在什么时候写下的
  `CREATE TABLE paper_versions (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     source     TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX idx_paper_session ON paper_versions(session_id, id);`,
  // 学生自己钉选的候选方法：教练提问要围着学生选的方法转，而不是围着它随手想到的方法转
  `CREATE TABLE session_methods (
     session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     method_id  TEXT NOT NULL,
     pinned_at  INTEGER NOT NULL,
     PRIMARY KEY (session_id, method_id)
   );`
]

export function initDb(dir: string): DatabaseSync {
  if (db) return db
  mkdirSync(dir, { recursive: true })
  dbFile = join(dir, 'app.db')
  db = new DatabaseSync(dbFile)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (v INTEGER PRIMARY KEY, applied_at INTEGER)')
  const done = new Set(
    (db.prepare('SELECT v FROM _migrations').all() as { v: number }[]).map((r) => Number(r.v))
  )
  const ins = db.prepare('INSERT INTO _migrations(v, applied_at) VALUES(?, ?)')
  MIGRATIONS.forEach((sql, i) => {
    const v = i + 1
    if (done.has(v)) return
    db!.exec('BEGIN')
    try {
      db!.exec(sql)
      ins.run(v, Date.now())
      db!.exec('COMMIT')
    } catch (e) {
      db!.exec('ROLLBACK')
      throw new Error(`迁移 ${v} 失败: ${(e as Error).message}`)
    }
  })
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('数据库未初始化')
  return db
}

export function getDbFile(): string {
  return dbFile
}
