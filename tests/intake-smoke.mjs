/**
 * M6-1 冒烟：导入层的纯逻辑（文件名消毒、摘要、注入教练的题面）。
 * dialog 与 pdfjs 在离线冒烟里跑不了，所以这里只测「提取出来之后」的每一段。
 * 运行：npm run smoke:intake
 */
import assert from 'node:assert/strict'
import {
  MAX_BRIEFING_CHARS,
  buildRealDataPreviewCode,
  buildDigest,
  clip,
  csvDigest,
  defaultKind,
  digestKind,
  extOf,
  humanSize,
  intakeBriefing,
  isReadableTabularFile,
  needsVerify,
  normalizeExtracted,
  safeName
} from '../.tmp/intake.mjs'

let pass = 0
let fail = 0
const check = (name, fn) => {
  try {
    fn()
    pass++
    console.log(`PASS  ${name}`)
  } catch (e) {
    fail++
    console.log(`FAIL  ${name}\n      ${String(e.message ?? e).split('\n')[0]}`)
  }
}

const file = (over = {}) => ({
  id: 1,
  kind: 'problem',
  name: 'C题.pdf',
  relPath: '题目/C题.pdf',
  size: 1000,
  digestKind: 'pdf',
  digest: '',
  needsVerify: true,
  createdAt: 0,
  ...over
})

console.log('— 文件名与类型判定 —')

check('extOf 只看最后一个点且忽略目录', () => {
  assert.equal(extOf('D:\\题\\2024_C 题.pdf'), '.pdf')
  assert.equal(extOf('附件1.csv'), '.csv')
  assert.equal(extOf('noext'), '')
  // 目录名里带点不能骗过扩展名判定
  assert.equal(extOf('v1.2 目录/数据.xlsx'), '.xlsx')
})

check('中文与空格文件名判为题目，数据文件判为附件', () => {
  assert.equal(defaultKind('2024 年 C 题 中文.pdf'), 'problem')
  assert.equal(defaultKind('附件2 数据.csv'), 'data')
  assert.equal(defaultKind('result.xlsx'), 'data')
})

check('只有 PDF 需要学生核对提取结果', () => {
  assert.equal(needsVerify('题.pdf'), true)
  assert.equal(needsVerify('题.txt'), false)
  assert.equal(digestKind('x.CSV'), 'csv')
})

check('safeName 挡掉目录穿越与 Windows 保留字符', () => {
  assert.equal(safeName('../../etc/passwd'), 'passwd')
  assert.equal(safeName('C:\\windows\\system32\\x.pdf'), 'x.pdf')
  assert.equal(safeName('题目:附*件?.pdf'), '题目 附 件 .pdf')
  assert.equal(safeName('a\r\nb.txt'), 'a b.txt')
  assert.equal(safeName('.hidden'), '_.hidden')
  assert.equal(safeName('..'), '未命名文件')
  assert.equal(safeName('   '), '未命名文件')
  assert.equal(safeName(''), '未命名文件')
  assert.equal(safeName('x'.repeat(300)).length, 120)
  // 消毒后不许再留下任何能改路径的东西
  for (const n of ['a/b', 'a\\b', '../..', ':x:']) assert.ok(!/[\\/]/.test(safeName(n)), n)
})

check('humanSize 对异常大小不崩', () => {
  assert.equal(humanSize(512), '512 B')
  assert.equal(humanSize(2048), '2.0 KB')
  assert.equal(humanSize(3 * 1024 * 1024), '3.0 MB')
  assert.equal(humanSize(-1), '大小未知')
  assert.equal(humanSize(Number.NaN), '大小未知')
})

console.log('— 提取文本清洗与摘要 —')

check('normalizeExtracted 折掉 PDF 的断行与多余空格', () => {
  const raw = '在目标\r\n定位问题中\r，  相机\r\n\r\n\r\n安装高度'
  assert.equal(normalizeExtracted(raw), '在目标\n定位问题中\n， 相机\n安装高度')
})

check('clip 超长才截断并报原长', () => {
  assert.equal(clip(' abc ', 10), ' abc ')
  const long = 'x'.repeat(50)
  const out = clip(long, 20)
  assert.ok(out.startsWith('x'.repeat(20)))
  assert.ok(out.includes('共 50 字'))
})

check('csvDigest 给列数、表头和前三行，不给整表', () => {
  const body = Array.from({ length: 500 }, (_, i) => `${String(i)},${String(i * 2)}`).join('\r\n')
  const d = csvDigest(`time,value\r\n${body}`)
  assert.ok(d.includes('列数 2'))
  assert.ok(d.includes('数据行数约 500'))
  assert.ok(d.includes('表头：time,value'))
  assert.ok(d.includes('第 3 行：2,4'))
  assert.ok(d.includes('另有 497 行未列出'))
  assert.ok(d.length < 2000)
})

check('空 CSV 与单行 CSV 不炸', () => {
  assert.equal(csvDigest(''), '（空文件）')
  assert.ok(csvDigest('a,b').includes('数据行数约 0'))
})

check('buildDigest 按类型分派，扫描件 PDF 明确要学生手贴', () => {
  assert.ok(buildDigest('题.pdf', 10, '   ').includes('扫描件'))
  assert.equal(buildDigest('空.txt', 0, '  '), '（文件是空的）')
  assert.ok(buildDigest('x.csv', 10, 'a,b\n1,2').includes('表头：a,b'))
  assert.ok(buildDigest('data.xlsx', 2048, null).includes('pandas.read_excel'))
  assert.ok(buildDigest('raw.unknown', 10, null).includes('未识别的文件类型'))
  // 提取成功的 PDF 要留下原文，且带截断标记
  assert.equal(buildDigest('题.txt', 3, '题目  正文'), '题目 正文')
})

console.log('— 注入教练的题面简报 —')

check('什么都没导入时不注入任何段落', () => {
  assert.equal(intakeBriefing([]), '')
})

check('题面 + 附件都出现，且告诉教练相对路径怎么读', () => {
  const out = intakeBriefing([
    file({ digest: '针对目标运动轨迹，建立坐标系……共四问。' }),
    file({
      id: 2,
      kind: 'data',
      name: '附件1.csv',
      relPath: '附件/附件1.csv',
      digestKind: 'csv',
      needsVerify: false,
      digest: '列数 3，数据行数约 100'
    })
  ])
  assert.ok(out.includes('赛题原文'))
  assert.ok(out.includes('PDF 提取结果可能错乱，须学生核对'))
  assert.ok(out.includes('建立坐标系'))
  assert.ok(out.includes('已导入附件'))
  assert.ok(out.includes("'附件/文件名'"))
  assert.ok(out.includes('附件1.csv · 1000 B'))
})

check('题面预算压得住：再多文件也只给到预算内', () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    file({ id: i, digest: '题'.repeat(3000), name: `第${i}版.pdf` })
  )
  const out = intakeBriefing(many)
  assert.ok(out.length < MAX_BRIEFING_CHARS + 6000 + 200, `实际 ${String(out.length)}`)
})

check('digest 为空的题目文件不进简报，别给教练看空壳', () => {
  const out = intakeBriefing([file({ digest: '  ' })])
  assert.equal(out, '')
})

check('只有附件时不谎称有题面', () => {
  const out = intakeBriefing([file({ kind: 'data', name: 'a.csv', relPath: '附件/a.csv', digestKind: 'csv', digest: '列数 1' })])
  assert.ok(!out.includes('赛题原文'))
  assert.ok(out.includes('已导入附件'))
})

check('CSV 附件生成真实路径读取代码，不生成模拟数组', () => {
  const data = file({ kind: 'data', name: '观测.csv', relPath: '附件/观测.csv' })
  assert.equal(isReadableTabularFile(data), true)
  const code = buildRealDataPreviewCode(data)
  assert.ok(code.includes('Path("附件/观测.csv")'))
  assert.ok(code.includes('pd.read_csv(DATA_FILE)'))
  assert.ok(!code.includes('np.random'))
})

check('Excel 与 TSV 使用对应读取器，非表格附件不生成代码', () => {
  const excel = buildRealDataPreviewCode(file({ kind: 'data', name: '结果.xlsx', relPath: '附件/结果.xlsx' }))
  const tsv = buildRealDataPreviewCode(file({ kind: 'data', name: '结果.tsv', relPath: '附件/结果.tsv' }))
  assert.ok(excel.includes('pd.read_excel(DATA_FILE)'))
  assert.ok(tsv.includes("sep='\\t'"))
  assert.equal(buildRealDataPreviewCode(file({ kind: 'data', name: '压缩包.zip', relPath: '附件/压缩包.zip' })), null)
})

console.log(`\n${String(pass)} passed, ${String(fail)} failed`)
if (fail > 0) process.exitCode = 1
