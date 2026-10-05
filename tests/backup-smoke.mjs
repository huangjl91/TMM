import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { build } from 'esbuild'
await build({ entryPoints: ['tests/backup-harness.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.tmp/backup-harness.mjs', plugins: [{ name:'electron-fixture', setup(b) {
  b.onResolve({ filter:/^electron$/ }, () => ({path:'electron',namespace:'fixture'}))
  b.onLoad({ filter:/.*/,namespace:'fixture' }, () => ({contents:`export const app={getPath:()=>process.env.TMM_BACKUP_ROOT}; export const dialog={};`}))
} }] })
process.env.TMM_BACKUP_ROOT = mkdtempSync(resolve('.tmp/backup-test-'))
const h = await import('../.tmp/backup-harness.mjs')
h.initDb(process.env.TMM_BACKUP_ROOT)
const sid = h.createSession('原始案例','offline','test')
h.appendMessage(sid,'user','我的学习记录')
writeFileSync(join(h.workspaceDir(sid),'data.csv'),'date,value\n1,2')
h.addSessionFile(sid,'data','data.csv','data.csv',14,'text','测试附件')
h.getDb().prepare('INSERT INTO secrets VALUES(?,?,?)').run('test',Buffer.from('secret-placeholder'),0)
const run = Number(h.getDb().prepare('INSERT INTO runs(session_id,code,ok,created_at) VALUES(?,?,?,?)').run(sid,'print(1)',1,0).lastInsertRowid)
const state = {...h.emptyLab(), experiment:{runId:run,summary:{metrics:[]}}}
h.getDb().prepare('INSERT INTO prediction_labs VALUES(?,?,?)').run(sid,1,JSON.stringify(state))
const data = h.createBackup()
const raw = gunzipSync(data).toString()
assert.equal(raw.includes('secret-placeholder'),false)
assert.equal(raw.includes('"secrets"'),false)
assert.equal(h.restoreBackup(data),1)
assert.equal(h.listSessions().length,2)
const restored = h.listSessions().find(s=>s.id!==sid)
assert.equal(h.getSessionMessages(restored.id)[0].content,'我的学习记录')
assert.equal(readFileSync(join(h.workspaceDir(restored.id),'data.csv'),'utf8'),'date,value\n1,2')
const restoredState = JSON.parse(h.getDb().prepare('SELECT state_json FROM prediction_labs WHERE session_id=?').get(restored.id).state_json)
assert.notEqual(restoredState.experiment.runId,run)
assert.equal(h.getDb().prepare('SELECT session_id FROM runs WHERE id=?').get(restoredState.experiment.runId).session_id,restored.id)
for (const corrupt of [b=>b.files[0].path='../escape.txt', b=>b.files[0].sha256='bad', b=>b.files=[], b=>b.tables.prediction_labs[0].state_json='invalid']) {
  const b=JSON.parse(raw);corrupt(b)
  assert.throws(()=>h.restoreBackup(gzipSync(JSON.stringify(b))))
  assert.equal(h.listSessions().length,2)
}
const lab = {...h.emptyLab(),experiment:{summary:{metrics:[{model:'baseline',mae:2,rmse:3,mape:4}]}}}
lab.reflection.comparison='效果很好'
assert.ok(h.reviewReflection(lab).some(x=>x.includes('具体数值')))
lab.reflection.comparison='上一期基线 RMSE 为 3'
assert.ok(h.reviewReflection(lab).some(x=>x.includes('近似匹配')))
lab.reflection.comparison='上一期基线 RMSE 为 999'
assert.ok(h.reviewReflection(lab).some(x=>x.includes('暂未找到')))
lab.staleReason='数据已变化'
assert.match(h.reviewReflection(lab)[0],/先运行/)
console.log('PASS 完整备份恢复、原案例保留、密钥排除、实验引用重映射、损坏与越界拒绝、失败回滚、复盘引用反馈')
