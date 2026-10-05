import { writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from './db'
import { createSession, addSessionFile, saveStageOutputs } from './repo'
import { workspaceDir } from './sandbox'
import { TUTORIAL_FILE, TUTORIAL_PROBLEM, tutorialCsv } from '../shared/tutorial'

export function createTutorial(): number {
  const db = getDb()
  const created: string[] = []
  db.exec('BEGIN IMMEDIATE')
  try {
    const sid = createSession('新手练习：客流预测【合成教学数据】', 'offline', '教学练习')
    const root = workspaceDir(sid)
    if (readdirSync(root).length) throw new Error('新案例目录已有内容，请检查后重试，未覆盖原文件。')
    const csv = tutorialCsv()
    for (const [name, content] of [[TUTORIAL_FILE, csv], ['教学练习说明.txt', TUTORIAL_PROBLEM]] as const) {
      const path = join(root, name)
      writeFileSync(path, content, { flag: 'wx' })
      created.push(path)
    }
    addSessionFile(sid, 'data', TUTORIAL_FILE, TUTORIAL_FILE, Buffer.byteLength(csv), 'csv', '教学合成数据，60行；date 为日期，visitors 为人数。不是用户的真实附件。')
    addSessionFile(sid, 'problem', '教学练习说明.txt', '教学练习说明.txt', Buffer.byteLength(TUTORIAL_PROBLEM), 'text', TUTORIAL_PROBLEM)
    saveStageOutputs(sid, 1, { problems: TUTORIAL_PROBLEM, data: '教学合成数据：60天每日客流，date 日期，visitors 人数。' })
    db.exec('COMMIT')
    return sid
  } catch (error) {
    db.exec('ROLLBACK')
    for (const path of created) { try { unlinkSync(path) } catch { /* 保留原始错误，已有文件不覆盖。 */ } }
    throw error
  }
}
