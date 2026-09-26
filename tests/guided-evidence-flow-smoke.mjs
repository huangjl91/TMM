import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildRealDataPreviewCode } from '../.tmp/intake.mjs'
import { buildDefaultGuidedQuestions, explainProblemCategory, synthesizeGuidedDraft } from '../.tmp/guidedQuiz.mjs'

const problem = `问题 1：根据附件中的月份、用电负荷和气温数据，分析历史变化趋势，预测下一阶段负荷，并报告误差与预测区间。`
const category = explainProblemCategory(problem)
assert.equal(category.detected, 'prediction')

const guided = buildDefaultGuidedQuestions(1, problem)
assert.equal(guided.knowledge.category, 'prediction')
assert.ok(guided.candidateModels.some((model) => /ARIMA|Prophet|预测/.test(model.name + model.aka)))

const choices = Object.fromEntries(
  Object.entries(guided.questions).map(([step, question]) => {
    const option = question.options[0]
    return [step, {
      pickedKey: option.key,
      pickedText: option.text,
      pickedMeans: option.means,
      userNote: '验收夹具选择，仅用于检查流程',
      timestamp: Date.now()
    }]
  })
)
const draft = synthesizeGuidedDraft(
  1,
  problem,
  guided.knowledge,
  choices,
  guided.questions.visualization.visualization
)
assert.ok(draft.paperSnippet.includes('【待计算】'))
assert.equal(/MAPE\s*(?:为|=)\s*\d/i.test(draft.paperSnippet), false)

const root = resolve('.tmp/evidence-flow')
const attachmentDir = join(root, '附件')
rmSync(root, { recursive: true, force: true })
mkdirSync(attachmentDir, { recursive: true })
writeFileSync(
  join(attachmentDir, '月度负荷.csv'),
  '月份,用电负荷_kWh,平均气温_C\n2026-01,1020,5.2\n2026-02,980,7.1\n2026-03,1100,12.4\n2026-04,1180,17.8\n',
  'utf8'
)

const code = buildRealDataPreviewCode(
  { kind: 'data', name: '月度负荷.csv', relPath: '附件/月度负荷.csv' },
  { xColumn: '月份', yColumns: ['用电负荷_kWh', '平均气温_C'] }
)
assert.ok(code)
writeFileSync(join(root, 'preview.py'), code, 'utf8')
const python = process.env.PYTHON312 || 'py'
const args = process.env.PYTHON312 ? ['preview.py'] : ['-3.12', 'preview.py']
execFileSync(python, args, {
  cwd: root,
  stdio: 'pipe',
  env: { ...process.env, MPLBACKEND: 'Agg', MPLCONFIGDIR: join(root, '.mplconfig') }
})

assert.ok(existsSync(join(root, 'real_data_preview.png')))
const manifest = JSON.parse(readFileSync(join(root, 'evidence_manifest.json'), 'utf8'))
assert.equal(manifest.sourceFile, '附件/月度负荷.csv')
assert.equal(manifest.rowCount, 4)
assert.equal(manifest.xColumn, '月份')
assert.deepEqual(manifest.yColumns, ['用电负荷_kWh', '平均气温_C'])

console.log('PASS  题目 → 题型 → 候选模型 → 引导选择 → 真实数据图 → 证据清单 → 写作提纲')
