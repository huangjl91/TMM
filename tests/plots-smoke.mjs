/**
 * M6-5 的离线校验：绘图三问闸门、图表规范检查、报错导读。
 *
 * 这三件东西都刻意做成本地纯函数——不叫模型、不查外网。所以这里能全量断言：
 * 该拦的必须拦住（缺轴名、没图例、dpi 太低），不该报的一条都不许报，
 * 报错导读只给排查方向、不许替学生改代码。
 * 运行：npm run smoke:plots
 */
import assert from 'node:assert/strict'
import {
  CODE_SKELETON,
  PLOT_ANSWER_MIN,
  PLOT_QUESTIONS,
  PLOT_STAGES,
  errorAsksText,
  errorGuide,
  isSkeleton,
  plotDigest,
  plotGate,
  plotHints,
  sameErrorStreak,
  unanswered
} from '../.tmp/plots.mjs'

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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${msg ? `  — ${msg.slice(0, 220)}` : ''}`)
}

const axis = (o) => ({ xlabel: '', ylabel: '', title: '', legend: false, curves: 1, ...o })
const meta = (axes, dpi = 300) => ({ dpi, figWidth: 6, figHeight: 3, axes })
const png = (name, plotMeta) => ({ name, ext: '.png', size: 1, inline: false, dataUrl: '', plotMeta })

const LONG = '问题 1 的结论：残存浓度随时间单调下降，前半段降得比后半段快'
const AXES = '横轴时间 t (min)，纵轴残存浓度 c (mg/L)'
const TAKING = '读者该说出：约 8 分钟后浓度基本不再下降'

check('骨架判定只认「除了注释什么都没写」', () => {
  assert.equal(isSkeleton(CODE_SKELETON), true)
  assert.equal(isSkeleton(''), true)
  assert.equal(isSkeleton('   \n  \n'), true)
  assert.equal(isSkeleton('# a\n# b\ncode = 1\n'), false)
  assert.equal(isSkeleton('print(1)'), false)
  // 注释堆到 7 行以上就不再当骨架，否则学生写满注释也会被闸门拦住
  assert.equal(isSkeleton(Array.from({ length: 7 }, (_, i) => `# 第 ${String(i)} 行说明`).join('\n')), false)
  assert.equal(CODE_SKELETON.includes('import'), false)
  assert.equal(CODE_SKELETON.includes('plt.'), false)
})

check('闸门只设在求解与结果分析这两段，且代码写实了就不再拦', () => {
  assert.deepEqual(PLOT_STAGES, [6, 8])
  assert.equal(plotGate(null, CODE_SKELETON, 6).length, 3)
  assert.equal(plotGate(null, CODE_SKELETON, 4).length, 0)
  assert.equal(plotGate(null, 'import pandas as pd\nprint(1)', 6).length, 0)
  const part = { question: LONG, axes: '时间' }
  assert.deepEqual(plotGate(part, CODE_SKELETON, 6), [PLOT_QUESTIONS[1].ask, PLOT_QUESTIONS[2].ask])
  assert.deepEqual(unanswered(part), [PLOT_QUESTIONS[1].ask, PLOT_QUESTIONS[2].ask])
  assert.deepEqual(unanswered(null), PLOT_QUESTIONS.map((q) => q.ask))
  assert.deepEqual(
    plotGate({ question: LONG, axes: AXES, takeaway: TAKING }, CODE_SKELETON, 8),
    []
  )
})

check('答没答够只看字数，一条糊不过去；三答摘要把三问原样带上', () => {
  assert.equal(PLOT_ANSWER_MIN, 8)
  const digest = plotDigest({ question: LONG, axes: AXES, takeaway: TAKING })
  for (const q of PLOT_QUESTIONS) assert.ok(digest.includes(q.ask), `摘要里少了 ${q.ask}`)
  assert.ok(digest.includes(LONG))
  assert.equal(plotDigest({}).split('\n').filter((l) => l.includes('（没填）')).length, 3)
})

check('轴名缺单位、曲线没图例、dpi 偏低，一条都漏不掉', () => {
  const art = png('bad.png', meta([axis({ ylabel: '残留浓度', curves: 3 })], 120))
  const texts = plotHints([art]).map((h) => h.text)
  assert.ok(texts.some((t) => t.includes('横轴没有名称')), texts.join('/'))
  assert.ok(texts.some((t) => t.includes('残留浓度') && t.includes('没看到单位')), texts.join('/'))
  assert.ok(texts.some((t) => t.includes('没有图例')), texts.join('/'))
  assert.ok(texts.some((t) => t.includes('dpi=120')), texts.join('/'))
  for (const h of plotHints([art])) assert.equal(h.name, 'bad.png')
})

check('一张图最多报四条，报满屏等于没报', () => {
  const many = plotHints([
    png(
      'many.png',
      meta([
        axis({ xlabel: '温度', ylabel: '浓度', title: '', legend: false, curves: 4 }),
        axis({ xlabel: '', ylabel: '', curves: 2 })
      ], 72)
    )
  ])
  assert.equal(many.length, 4)
  assert.ok(new Set(many.map((h) => h.name)).size === 1)
})

check('名称里带单位与图例齐全就不报，单曲线不逼着加图例', () => {
  const clean = plotHints([
    png(
      'ok.png',
      meta([axis({ xlabel: '时间 t (min)', ylabel: '残存浓度 c (mg/L)', title: '衰减曲线', legend: true, curves: 3 })], 300)
    )
  ])
  assert.deepEqual(clean, [])
  assert.deepEqual(
    plotHints([png('one.png', meta([axis({ xlabel: 'x (m)', ylabel: 'y (kg)', title: '分布', curves: 1 })], 300))]),
    []
  )
})

check('非 matplotlib 存的图与空图各兜一条，不硬挑轴名', () => {
  const a = plotHints([png('fig.png', undefined)])
  assert.equal(a.length, 1)
  assert.ok(a[0].text.includes('不是 matplotlib 存的'), a[0].text)
  const b = plotHints([png('fig.png', meta([]))])
  assert.ok(b[0].text.includes('没识别到坐标系'), b[0].text)
  assert.deepEqual(plotHints([{ name: 'r.csv', ext: '.csv', size: 1, inline: false, dataUrl: '' }]), [])
})

check('常见报错都有导读，且只给排查方向不给改法', () => {
  for (const type of [
    'NameError',
    'AttributeError',
    'FileNotFoundError',
    'KeyError',
    'IndexError',
    'ValueError',
    'TypeError',
    'ZeroDivisionError',
    'SyntaxError',
    'IndentationError',
    'ImportError',
    'ModuleNotFoundError',
    'MemoryError',
    'Crashed',
    'Timeout'
  ]) {
    const g = errorGuide({ type, message: 'x', traceback: '' }, 1)
    assert.ok(g, `${type} 没有导读`)
    assert.equal(g.type, type)
    assert.ok(g.line && g.line.length <= 40, `${type} 的 line 太长`)
    assert.equal(g.checks.length, 2, `${type} 第一次只该给两条`)
    assert.deepEqual(
      g.checks.filter((c) => /^\s*(改成|换成|你应该|把代码改)/.test(c)),
      [],
      `${type} 的清单像在替学生改代码`
    )
  }
  assert.equal(errorGuide({ type: 'SomeWeirdError', message: 'x', traceback: '' }, 3), null)
  assert.equal(errorGuide(null, 3), null)
})

check('同类报错连着第二次才给满三条并升级成发给教练', () => {
  const e = { type: 'NameError', message: "name 'df' is not defined", traceback: '' }
  assert.equal(errorGuide(e, 1).checks.length, 2)
  const g = errorGuide(e, 2)
  assert.equal(g.checks.length, 3)
  const text = errorAsksText(e, g, 2)
  assert.ok(text.includes('第 2 次报 NameError'), text)
  assert.ok(text.includes("name 'df' is not defined"), text)
  assert.ok(text.includes('别替我改代码'), text)
  assert.equal(/正确|最优|得分/.test(text), false)
})

check('同类连错按时间往前数，中间换个错就归零', () => {
  const run = (type) => ({ error: type ? { type, message: '', traceback: '' } : null })
  assert.equal(sameErrorStreak([run('KeyError'), run('KeyError'), run('KeyError')], 'KeyError'), 3)
  assert.equal(sameErrorStreak([run('KeyError'), run('ValueError'), run('KeyError')], 'KeyError'), 1)
  assert.equal(sameErrorStreak([run('KeyError'), run(null), run('KeyError')], 'KeyError'), 1)
  assert.equal(sameErrorStreak([], 'KeyError'), 0)
  assert.equal(sameErrorStreak([run(null)], 'KeyError'), 0)
})

check('三问的措辞不判对错，也不替学生说出这句话', () => {
  assert.equal(PLOT_QUESTIONS.length, 3)
  for (const q of PLOT_QUESTIONS) {
    assert.ok(/？$/.test(q.ask), `${q.ask} 不是问句`)
    assert.equal(/正确|应该选|最优|得分/.test(q.ask + q.hint), false, `${q.ask} 带判分措辞`)
    assert.ok(q.hint.length >= 10)
  }
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${String(results.length - failed.length)}/${String(results.length)} 通过`)
for (const f of failed) console.log(`  FAILED  ${f.name}`)
process.exit(failed.length ? 1 : 0)
