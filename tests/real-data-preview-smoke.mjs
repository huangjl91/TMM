import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildRealDataPreviewCode } from '../.tmp/intake.mjs'

const root = resolve('.tmp/real-data-preview')
const attachmentDir = join(root, '附件')
rmSync(root, { recursive: true, force: true })
mkdirSync(attachmentDir, { recursive: true })

const python = process.env.PYTHON312 || 'py'
const baseArgs = process.env.PYTHON312 ? [] : ['-3.12']

function run(name, relPath, createCode) {
  execFileSync(python, [...baseArgs, '-c', createCode], { cwd: root, stdio: 'pipe' })
  const code = buildRealDataPreviewCode({ kind: 'data', name, relPath })
  assert.ok(code)
  writeFileSync(join(root, 'preview.py'), code, 'utf8')
  const stdout = execFileSync(python, [...baseArgs, 'preview.py'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MPLBACKEND: 'Agg', MPLCONFIGDIR: join(root, '.mplconfig') }
  })
  assert.ok(stdout.trim().length > 0)
  assert.ok(existsSync(join(root, 'real_data_preview.png')))
  rmSync(join(root, 'real_data_preview.png'), { force: true })
  console.log(`PASS  ${name} 真实读取并生成图表`)
}

run(
  '观测.csv',
  '附件/观测.csv',
  "from pathlib import Path; Path('附件/观测.csv').write_text('时间,负荷,温度\\n1,10,20\\n2,12,21\\n3,11,19\\n', encoding='utf-8-sig')"
)

run(
  '观测.xlsx',
  '附件/观测.xlsx',
  "import pandas as pd; pd.DataFrame({'时间':[1,2,3], '负荷':[10,12,11], '温度':[20,21,19]}).to_excel('附件/观测.xlsx', index=False)"
)

console.log('CSV / Excel 真实附件预览测试通过')
