/**
 * M6-4 讲解语料的离线校验：字数、结构、以及最重要的「像不像正文」。
 *
 * 这堆文案是要给学生看的科普，不是答案。所以除了长度，这里钉住三条硬约束：
 * 不许出现论文套语、不许出现判分措辞、迷你例子不许连写成段（两句以内）。
 * 运行：npm run smoke:explain
 */
import assert from 'node:assert/strict'
import { EXPLAIN_LIMITS, METHOD_EXPLAIN, TERMS, explainHits, explainLookup } from '../.tmp/explain.mjs'
import { METHOD_CARDS } from '../.tmp/methods.mjs'

const results = []
function check(name, fn) {
  let ok = false
  let msg = ''
  try {
    fn()
    ok = true
  } catch (e) {
    msg = ((e && e.message) || String(e)).split('\n')[0]
  }
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${msg ? `  — ${msg.slice(0, 200)}` : ''}`)
}

/** 与主进程反代写同一批套语：讲解里出现即说明这段能直接粘进论文 */
const BANNED = [
  '综上所述',
  '本文采用',
  '本文提出',
  '本文认为',
  '我们建立了',
  '因此我们',
  '结果表明',
  '可以得出',
  '由此可见',
  '由式',
  '不难得到',
  '模型求解得',
  '本节将'
]
const JUDGING = ['正确答案', '最优解是', '应该选', '选 A', '得分高']

const entries = [
  ...Object.entries(METHOD_EXPLAIN).map(([ref, e]) => ({ ref, kind: 'method', e })),
  ...TERMS.map((t) => ({ ref: t.title, kind: 'term', e: t.explain }))
]

const over = []
for (const { ref, e } of entries) {
  for (const k of ['intuition', 'analogy', 'miniExample', 'formula']) {
    const v = e[k] ?? ''
    if (v.length > EXPLAIN_LIMITS[k]) over.push(`${ref}.${k} ${String(v.length)}>${String(EXPLAIN_LIMITS[k])}`)
  }
  for (const s of e.symbols ?? []) {
    if (s.length > EXPLAIN_LIMITS.symbols) over.push(`${ref}.symbols ${String(s.length)} 字`)
  }
}
check(`每段都在字数上限内（${String(entries.length)} 条词条）`, () => assert.deepEqual(over, []), '')

const badText = []
for (const { ref, e } of entries) {
  const all = [e.intuition, e.analogy, e.miniExample, e.formula, ...(e.symbols ?? [])].join('\n')
  for (const w of [...BANNED, ...JUDGING]) if (all.includes(w)) badText.push(`${ref} 含「${w}」`)
  const periods = (e.miniExample.match(/。/g) ?? []).length
  if (periods > 2) badText.push(`${ref}.miniExample 有 ${String(periods)} 句，像在写正文`)
}
check('讲解里没有论文套语、没有判分措辞、迷你例子不连写成段', () => assert.deepEqual(badText, []))

check('26 张方法卡每张都有 explain，且没有对不上的孤儿词条', () => {
  const ids = METHOD_CARDS.map((c) => c.id)
  const missing = ids.filter((id) => !METHOD_EXPLAIN[id])
  const orphan = Object.keys(METHOD_EXPLAIN).filter((id) => !ids.includes(id))
  assert.deepEqual(missing, [], `缺讲解的方法：${missing.join('、')}`)
  assert.deepEqual(orphan, [], `讲解里有不存在的方法 id：${orphan.join('、')}`)
  assert.equal(ids.length, 26)
})

check('方法词条五段齐全，符号表 2-5 条', () => {
  for (const [id, e] of Object.entries(METHOD_EXPLAIN)) {
    assert.ok(e.intuition && e.analogy && e.miniExample && e.formula, `${id} 有空段`)
    assert.ok(e.symbols.length >= 2 && e.symbols.length <= 5, `${id} 符号条数 ${String(e.symbols.length)}`)
    assert.ok(!/[?？]$/.test(e.intuition.trim()), `${id} 的直觉段写成了问句`)
  }
})

check('术语表覆盖学生最常问的那些词，且都带直觉与类比', () => {
  assert.ok(TERMS.length >= 15, `只有 ${String(TERMS.length)} 条`)
  for (const t of TERMS) {
    assert.ok(t.title && t.explain.intuition && t.explain.analogy && t.explain.miniExample, `${t.title} 缺段`)
    assert.ok(Array.isArray(t.explain.symbols) && t.explain.symbols.length <= 5, `${t.title} symbols 不对`)
  }
})

check('选项文本能命中方法卡（最长匹配优先，不被短别名抢走）', () => {
  assert.equal(explainLookup('先按熵权法定权重')?.ref, 'entropy-weight')
  assert.equal(explainLookup('用 TOPSIS 排序看贴近度')?.ref, 'topsis')
  assert.equal(explainLookup('判断矩阵要做一致性检验')?.kind, 'term')
  assert.equal(explainLookup('蒙特卡洛仿真')?.ref, 'monte-carlo')
})

check('没讲过的名词不硬凑：查不到就返回空，交给「让教练解释」', () => {
  assert.equal(explainLookup('这个完全不存在的第七种方法'), null)
  assert.deepEqual(explainHits('把每个订单拆成若干批次再排'), [])
})

check('一段话里能同时揪出方法名与术语名，同一词条不重复出现', () => {
  const hits = explainHits('先用熵权法定权重，再用 TOPSIS 排序，最后做灵敏度分析')
  assert.deepEqual(
    hits.map((h) => h.ref).sort(),
    ['entropy-weight', 'topsis', '权重', '灵敏度分析'].sort()
  )
  assert.equal(new Set(hits.map((h) => h.ref)).size, hits.length)
  assert.deepEqual(
    hits.filter((h) => h.kind === 'method').map((h) => h.ref),
    ['topsis', 'entropy-weight']
  )
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${String(results.length - failed.length)}/${String(results.length)} 通过`)
for (const f of failed) console.log(`  FAILED  ${f.name}`)
process.exit(failed.length ? 1 : 0)
