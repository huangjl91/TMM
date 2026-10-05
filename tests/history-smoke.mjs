import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
if (!process.argv.includes('--reload')) await build({ entryPoints: ['tests/history-harness.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.tmp/history-harness.mjs' })
const h = await import('../.tmp/history-harness.mjs')
const dir = process.argv[3] || mkdtempSync(resolve('.tmp/history-test-'))
h.initDb(dir)
if (process.argv.includes('--reload')) {
  assert.equal(h.listSessions().length, 54)
  assert.equal(h.listSessions(true).length, 1)
  h.setSessionDeleted(1, false)
  assert.equal(h.listSessions().length, 55)
  assert.equal(h.getSessionMessages(1)[0].content, '保留的学习笔记')
  console.log('PASS 重启后删除状态保持，恢复后学习记录完整')
  process.exit(0)
}
for (let i = 0; i < 55; i++) h.createSession(`测试案例${i}`, 'offline', 'test')
h.appendMessage(1, 'user', '保留的学习笔记')
assert.equal(h.listSessions().length, 55)
h.setSessionDeleted(1, true)
assert.equal(h.listSessions().length, 54)
assert.equal(h.listSessions(true)[0].id, 1)
assert.throws(() => h.setSessionDeleted(-1, true))
assert.throws(() => h.setSessionDeleted(999, true))
const r = spawnSync(process.execPath, ['tests/history-smoke.mjs', '--reload', dir], { encoding: 'utf8' })
assert.equal(r.status, 0, r.stderr + r.stdout)
console.log(r.stdout.trim())
console.log('PASS 超过50条历史可见、删除隔离、无效编号检查')
