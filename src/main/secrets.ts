import { safeStorage } from 'electron'
import { getDb } from './db'
import type { ProviderId } from '../shared/types'

/**
 * Key 用系统级加密（Windows DPAPI）后存进 SQLite，磁盘上永远看不到明文。
 * 若系统加密不可用则直接报错，不静默降级成明文存储。
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function setApiKey(providerId: ProviderId, plain: string): void {
  if (!plain) {
    getDb().prepare('DELETE FROM secrets WHERE provider_id = ?').run(providerId)
    return
  }
  if (!isEncryptionAvailable()) throw new Error('系统加密不可用，无法安全保存 API Key')
  const blob = safeStorage.encryptString(plain)
  getDb()
    .prepare(
      `INSERT INTO secrets(provider_id, blob, updated_at) VALUES(?,?,?)
       ON CONFLICT(provider_id) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at`
    )
    .run(providerId, blob, Date.now())
}

export function getApiKey(providerId: ProviderId): string | null {
  const row = getDb().prepare('SELECT blob FROM secrets WHERE provider_id = ?').get(providerId) as
    | { blob: Uint8Array }
    | undefined
  if (!row) return null
  if (!isEncryptionAvailable()) throw new Error('系统加密不可用，无法读取 API Key')
  return safeStorage.decryptString(Buffer.from(row.blob))
}

export function hasApiKey(providerId: ProviderId): boolean {
  return getDb().prepare('SELECT 1 FROM secrets WHERE provider_id = ?').get(providerId) !== undefined
}
