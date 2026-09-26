/**
 * 通过 Chrome DevTools Protocol 检查渲染层是否真的挂载成功。
 * 需要 dev 以 --remote-debugging-port=9222 启动。
 * 验打包产物时把 MMT_CDP_PORT 指到安装包自己的调试端口，同一套探针照样跑。
 */
const listUrl = `http://127.0.0.1:${process.env.MMT_CDP_PORT ?? 9222}/json/list`

const deadline = Date.now() + 30000
let target = null
while (!target && Date.now() < deadline) {
  try {
    const list = await (await fetch(listUrl)).json()
    target = list.find(
      (t) => t.type === 'page' && (t.url.includes('localhost') || t.url.startsWith('file://'))
    )
    if (!target) await new Promise((r) => setTimeout(r, 500))
  } catch {
    await new Promise((r) => setTimeout(r, 500))
  }
}
if (!target) {
  console.log('FAIL 找不到渲染页面 target（窗口未启动？）')
  process.exit(1)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))

let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  const done = pending.get(msg.id)
  if (done) {
    pending.delete(msg.id)
    done(msg)
  }
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id
    pending.set(n, r)
    ws.send(JSON.stringify({ id: n, method, params }))
  })

await send('Runtime.enable')
await send('Page.enable')

/** 窗口中途关掉时 CDP 回包会永远不到；不给超时就整支探针挂死，看不出任何名堂 */
const withTimeout = (p, ms, what) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`CDP 超时 ${ms / 1000}s：${what}`)), ms))])

const evaluate = async (js, ms = 40000) => {
  const r = await withTimeout(
    send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }),
    ms,
    js.slice(0, 80)
  )
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 1600))
  return r.result?.result?.value
}

/**
 * 走真实输入框发首轮。页面刚重载完 React 未必挂好，所以重试到输入框与发送键都在，
 * 免得探针把「没找到控件」当成产品缺陷报出来。
 */
async function sendFirstMessage(text, tries = 24) {
  let last = 'NO_CHAT_INPUT'
  for (let i = 0; i < tries; i++) {
    last = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').includes('描述你的题目'))
      if (!ta) return 'NO_CHAT_INPUT'
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, ${JSON.stringify(text)})
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      const btn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '发送')
      if (!btn) return 'NO_SEND_BUTTON'
      btn.click()
      return 'SENT'
    })()`)
    if (last === 'SENT') return last
    await new Promise((r) => setTimeout(r, 500))
  }
  return last
}

// 专项探针仍验证自由探究中的旧工作流；新版默认打开“引导式做题”，先显式切换入口。
const legacyChatModes = new Set(['stage', 'paper', 'methods', 'compliance', 'questions', 'quiz', 'plot'])
if (legacyChatModes.has(process.argv[2])) {
  const switched = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => b.innerText.includes('自由探究'))
    if (!btn) return 'NO_FREE_EXPLORE_TAB'
    btn.click()
    return 'SWITCHED_TO_FREE_EXPLORE'
  })()`)
  console.log('工作流入口:', switched)
  await new Promise((r) => setTimeout(r, 500))
}

const expr = `JSON.stringify({
  title: document.title,
  mounted: (document.getElementById('root')?.childElementCount ?? 0) > 0,
  stages: document.querySelectorAll('ol li').length,
  hasStageHead: document.body.innerText.includes('建模阶段'),
  hasEmptyHint: document.body.innerText.includes('把国赛真题贴进来'),
  settingsOpen: !!document.querySelector('input[type=password]'),
  header: document.querySelector('header')?.innerText.replace(/\\s+/g, ' ').trim(),
  env: document.body.innerText.includes('运行环境')
})`
const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
if (res.result?.exceptionDetails) {
  console.log('FAIL 求值异常', JSON.stringify(res.result.exceptionDetails).slice(0, 300))
} else if (res.error || res.result === undefined) {
  console.log('FAIL CDP 响应', JSON.stringify(res).slice(0, 400))
} else {
  console.log(JSON.parse(res.result.result.value))
}

const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync('.tmp/ui.png', Buffer.from(shot.result.data, 'base64'))
  console.log('截图已保存 .tmp/ui.png')
}

/**
 * 传入 run 就再走一遍真实交互：往编辑器塞代码、点运行、等图表回来。
 * 这样才算验证了 IPC -> spawn -> runner -> 产物回传 -> 渲染 的整条链路。
 */
if (process.argv[2] === 'run') {
  const seed = await evaluate(`(() => {
    const ta = document.querySelector('textarea[spellcheck="false"]')
    if (!ta) return 'NO_EDITOR'
    const code = [
      'import numpy as np, matplotlib.pyplot as plt',
      't = np.linspace(0, 8, 100)',
      "plt.figure(figsize=(5,2.5)); plt.plot(t, np.exp(-0.4*t)*np.cos(2*t))",
      "plt.title('UI 端到端验证曲线'); plt.savefig('e2e.png', dpi=100)",
      "print('rows=', t.size)"
    ].join('\\n')
    // 受控组件必须走原生 setter，否则 React 收不到变更
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, code)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('运行'))
    if (!btn) return 'NO_BUTTON'
    btn.click()
    return 'CLICKED'
  })()`)
  console.log('运行触发:', seed)

  let verdict = null
  for (let i = 0; i < 60 && !verdict; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    verdict = await evaluate(`(() => {
      const img = [...document.querySelectorAll('img')].find((im) => (im.getAttribute('src')||'').startsWith('data:image/png'))
      const box = document.querySelector('textarea[spellcheck="false"]')?.parentElement
      const text = box ? box.innerText : ''
      if (img && img.getBoundingClientRect().width > 40) {
        return JSON.stringify({ ok: true, natural: img.naturalWidth + 'x' + img.naturalHeight, text: text.slice(0, 260) })
      }
      if (/Error|错误|失败|Traceback/.test(text)) {
        return JSON.stringify({ ok: false, text: text.slice(0, 260) })
      }
      return null
    })()`)
  }
  console.log('运行结果:', verdict ? JSON.parse(verdict) : 'TIMEOUT 60s 内没等到图表')
}

/**
 * M2 端到端：本地假端点驱动「贴真题 → 教练反馈 → 提交任务卡 → 阶段推进 →
 * 要提示升到 L2 → 采纳脚手架 → 使用日志留痕」整条链路。
 * 不联网、不需要真实 API Key。运行：npm run smoke:ui:stage（dev 需带 9222 调试端口）
 */
if (process.argv[2] === 'stage') {
  const { startMockLlm, SCAFFOLD_MARK } = await import('./mock-llm.mjs')
  const mock = await startMockLlm()
  const step = (name, ok, detail = '') => {
    step.results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }
  step.results = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (js, timeout = 20000) => {
    for (let i = 0; i < timeout / 500; i++) {
      const v = await evaluate(js)
      if (v) return v
      await wait(500)
    }
    return null
  }
  const nativeSet = `(el, v) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
  // 聊天气泡里也会出现「本阶段任务卡」这句话，所以按段落开头的那个折叠标题定位
  const CARD = `[...document.querySelectorAll('section')].find(s => /^[▾▸]\\s*本阶段任务卡/.test(s.innerText))`

  try {
    await evaluate(`(async () => {
      await window.api.saveSettings({ providerId: 'custom', baseUrl: ${JSON.stringify(mock.baseUrl)}, model: 'mock-coach', temperature: 0.2 })
      await window.api.setApiKey('custom', 'mock-key-not-a-real-one')
      return JSON.stringify(await window.api.getSettings())
    })()`)
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) || 'x'`)
    await wait(500)
    const closed = await evaluate(`!document.querySelector('input[type=password]')`)
    step('设置指向本地假端点后模态可关闭', closed === true)

    // 上一轮探针可能留下会话，先开新的，保证每次跑的都是干净的第 1 阶段
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '新会话')?.click() || 'x'`)
    await wait(400)

    const layout = JSON.parse(
      await evaluate(`JSON.stringify({
        stageRows: document.querySelectorAll('ol li').length,
        blocking: document.body.innerText.includes('强制'),
        cardFields: (${CARD}) ? ${CARD}.querySelectorAll('textarea').length : -1,
        hintBtn: [...document.querySelectorAll('button')].some(b => b.innerText.includes('要提示'))
      })`)
    )
    step('阶段面板渲染 11 个阶段', layout.stageRows === 11, `li=${layout.stageRows}`)
    step('强制项与要提示按钮就位', layout.blocking && layout.hintBtn)
    step('任务卡给出第 1 阶段的三个字段', layout.cardFields === 3, `textarea=${layout.cardFields}`)

    const sent = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').includes('描述你的题目'))
      if (!ta) return 'NO_CHAT_INPUT'
      const set = ${nativeSet}
      set(ta, '2025 年 C 题：附件给出三个数据文件，第二问要求给出评价方案并说明指标口径。')
      ;[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '发送')?.click()
      return 'SENT'
    })()`)
    step('首条真题已发出', sent === 'SENT', String(sent))
    const first = await waitFor(`document.body.innerText.includes('检查点 1/2')`)
    step('流式教练卡片落地（含未通过检查点）', Boolean(first))

    const submitted = await evaluate(`(() => {
      const box = ${CARD}
      if (!box) return 'NO_CARD'
      const set = ${nativeSet}
      const vals = ['第一问：输入附件一，输出…；第二问：评价对象是调度方案，指标是总完工时间', '附件一共 12 列，time 为小时，缺失 3%', '正文、图 3 张、附录代码清单',]
      box.querySelectorAll('textarea').forEach((t, i) => set(t, vals[i] ?? ''))
      const btn = [...box.querySelectorAll('button')].find(b => b.innerText.includes('提交给教练评审'))
      btn?.click()
      return btn ? 'SUBMITTED' : 'NO_SUBMIT_BUTTON'
    })()`)
    step('任务卡提交按钮可点', submitted === 'SUBMITTED', String(submitted))
    const passed = await waitFor(`document.body.innerText.includes('检查点 3/3')`)
    step('提交后教练按评分点逐条给反馈', Boolean(passed))
    const advanced = await waitFor(
      `[...document.querySelectorAll('ol li')].some(li => li.innerText.includes('✓')) ? 'yes' : null`
    )
    step('检查点全过 + 评分达标 → 第 1 阶段标记完成', advanced === 'yes')
    const moved = await waitFor(`${CARD}?.innerText.includes('数据探索与预处理') ? 'yes' : null`)
    step('任务卡随阶段推进自动落到第 2 阶段', moved === 'yes')

    /**
     * 上一轮真正收尾的判据：卡片已定稿（rubric 反馈计数增加）且「停止」按钮消失。
     * 只看「要提示」按钮会踩到 broadcastStages 与 start 之间的空档，那会在同一会话上并发两轮。
     */
    const cardCount = () => evaluate(`(document.body.innerText.match(/rubric 反馈/g) || []).length`)
    const settled = (minCards, level) =>
      waitFor(`(() => {
        if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
        const n = (document.body.innerText.match(/rubric 反馈/g) || []).length
        const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('要提示'))
        return n >= ${minCards} && b && b.innerText.includes('L${level}') ? 'ok' : null
      })()`)
    const clickHint = () =>
      evaluate(`(() => {
        const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('要提示'))
        if (!b) return 'NO_BTN'
        b.click()
        return 'CLICKED'
      })()`)

    const base = await cardCount()
    step('第 2 阶段从 L0 提问档起步', (await settled(base, 0)) === 'ok', `cards=${base}`)
    const clicked1 = await clickHint()
    step('第一次要提示升到 L1，仍由教练提问', clicked1 === 'CLICKED' && (await settled(base + 1, 1)) === 'ok')
    const clicked2 = await clickHint()
    const scaffold = await waitFor(`document.body.innerText.includes('采纳到我的文件') ? 'yes' : null`)
    step('第二次要提示升到 L2，改由 Executor 出示例', clicked2 === 'CLICKED' && scaffold === 'yes')
    step(
      '示例卡明确标注不得直接提交',
      scaffold === 'yes' && (await evaluate(`document.body.innerText.includes('需自行核实改写，不得直接提交')`)) === true
    )

    const adopted = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('采纳到我的文件'))
      if (!btn) return 'NO_ADOPT'
      btn.click()
      return 'ADOPTED'
    })()`)
    step('采纳动作已触发', adopted === 'ADOPTED', String(adopted))
    const landed = await waitFor(
      `[...document.querySelectorAll('textarea')].some(t => (t.value || '').includes(${JSON.stringify(SCAFFOLD_MARK)})) ? 'yes' : null`
    )
    step('示例只经由「采纳」落地到代码编辑器', landed === 'yes')

    const usage = JSON.parse(
      await evaluate(`(async () => {
        const sessions = await window.api.listSessions()
        const sid = Math.max(...sessions.map(s => s.id))
        const rows = await window.api.listUsage(sid)
        return JSON.stringify({ sid, actions: [...new Set(rows.map(r => r.action))] })
      })()`)
    )
    const need = ['coach_reply', 'submission', 'stage_done', 'hint_escalation', 'scaffold_given', 'scaffold_adopted']
    step(
      'AI 使用日志覆盖每个引导环节（M5 合规导出的数据源）',
      need.every((a) => usage.actions.includes(a)),
      need.filter((a) => !usage.actions.includes(a)).join('、') || usage.actions.join('、')
    )
    step('合规教练没被误送去重写（启发式未命中即不调 Critic）', mock.calls.every((c) => c.role !== 'critic'))
    step('Executor 走的是非流式一次性补全', mock.calls.some((c) => c.role === 'executor' && c.stream === false))
  } catch (e) {
    step('M2 端到端探针', false, (e instanceof Error ? e.message : String(e)).slice(0, 200))
  } finally {
    await mock.stop()
    const bad = step.results.filter((r) => !r).length
    console.log(`\n${step.results.length - bad}/${step.results.length} 通过`)
    if (bad) process.exitCode = 1
  }
}

/**
 * M3 端到端：沙箱出图 → 论文面板引用同一张图 → xelatex 两遍编译出 PDF →
 * 故意写坏 → 问题面板定位到行并跳过去 → 改稿自动存版。
 * 这一段只依赖本机 xelatex，不依赖真实 API Key。运行：npm run smoke:ui:paper
 */
if (process.argv[2] === 'paper') {
  const step = (name, ok, detail = '') => {
    step.results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }
  step.results = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (js, timeout = 30000) => {
    for (let i = 0; i < timeout / 1000; i++) {
      const v = await evaluate(js)
      if (v) return v
      await wait(1000)
    }
    return null
  }
  const nativeSet = `(el, v) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
  const PAPER = `[...document.querySelectorAll('section')].find(s => /^[▾▸]\\s*国赛论文/.test(s.innerText))`
  /** 代码编辑器现在是三行注释骨架（不给可运行示例），所以只能按面板 + 等宽字体认，不能按内容认 */
  const SANDBOX = `[...document.querySelectorAll('section')].find(s => (s.querySelector(':scope > div > button')?.innerText || '').includes('沙箱'))`
  const CODE_TA = `[...(${SANDBOX}?.querySelectorAll('textarea[spellcheck="false"]') || [])].find(t => (t.className || '').includes('font-mono'))`
  const PAPER_TA = `${PAPER}?.querySelector('textarea')`
  const MARK = 'M3-E2E-论文标记'
  const { startMockLlm } = await import('./mock-llm.mjs')
  const mock = await startMockLlm()
  let before = null

  try {
    // 「模板原文」的提示只在没存过稿的会话上成立，所以每轮都得先要一个干净会话：
    // 重载页面清掉上一轮的活动会话，再走真实输入框发首轮把它建出来
    await send('Page.reload')
    await waitFor(`!!(window.api && (document.getElementById('root')?.childElementCount ?? 0) > 0) ? 1 : 0`, 20000)
    before = await evaluate(`(async () => JSON.stringify(await window.api.getSettings()))()`)
    await evaluate(`(async () => {
      await window.api.saveSettings({ providerId: 'custom', baseUrl: ${JSON.stringify(mock.baseUrl)}, model: 'mock-coach', temperature: 0.2 })
      await window.api.setApiKey('custom', 'mock-key-m3')
      return 'SET'
    })()`)
    const seeded = await sendFirstMessage('2025 年 C 题：光电池装配线排产，先界定问题。')
    if (seeded !== 'SENT') throw new Error('干净会话没建起来：' + seeded)
    await waitFor(
      `(() => {
        if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
        return document.body.innerText.includes('检查点') ? 'ok' : null
      })()`,
      60000
    )

    const ran = await evaluate(`(() => {
      const ta = ${CODE_TA}
      if (!ta) return 'NO_CODE_EDITOR'
      const set = ${nativeSet}
      set(ta, [
        'import numpy as np, matplotlib.pyplot as plt',
        't = np.linspace(0, 6, 80)',
        "plt.figure(figsize=(5,2.2)); plt.plot(t, np.exp(-0.5*t)*np.cos(2*t))",
        "plt.title('微网购电费用示意'); plt.xlabel('t / h'); plt.ylabel('费用 / 元')",
        "plt.savefig('explore.png', dpi=100); print('figure ok')"
      ].join('\\n'))
      const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('运行'))
      btn?.click()
      return btn ? 'RUN_CLICKED' : 'NO_RUN_BUTTON'
    })()`)
    step('沙箱出图已触发', ran === 'RUN_CLICKED', String(ran))
    const figure = await waitFor(
      `[...document.querySelectorAll('img')].some(im => (im.getAttribute('src')||'').startsWith('data:image/png') && im.naturalWidth > 20) ? 'yes' : null`,
      90000
    )
    step('图表产物已回到界面（沙箱工作区可用）', figure === 'yes')
    await wait(600)

    const opened = await evaluate(`(() => {
      const head = ${PAPER}?.querySelector('button')
      if (!head) return 'NO_PAPER_SECTION'
      if (!${PAPER_TA}) head.click()
      return 'OPENED'
    })()`)
    step('论文面板可展开', opened === 'OPENED', String(opened))
    const loaded = await waitFor(
      `(${PAPER_TA}?.value || '').includes('\\\\documentclass') ? 'yes' : null`
    )
    step('论文编辑器自动载入了国赛模板', loaded === 'yes')
    step('未改稿时提示这仍是模板原文', (await evaluate(`${PAPER}?.innerText.includes('还是模板原文')`)) === true)

    const wired = await evaluate(`(() => {
      const ta = ${PAPER_TA}
      if (!ta) return 'NO_TA'
      const set = ${nativeSet}
      set(ta, [
        '\\\\documentclass[12pt,a4paper,UTF8]{ctexart}',
        '\\\\usepackage{graphicx}',
        '\\\\usepackage{amsmath}',
        '\\\\begin{document}',
        '\\\\section{问题重述}',
        '本题要求在波动电价下给出微网当天的计划购电量。${MARK}',
        '\\\\begin{equation}',
        '  \\\\min Z = \\\\sum_{t=1}^{T} p_t x_t \\\\label{eq:cost}',
        '\\\\end{equation}',
        '目标函数见式~\\\\eqref{eq:cost}，示意图见图~\\\\ref{fig:one}。',
        '\\\\begin{figure}[h]',
        '  \\\\centering',
        '  \\\\includegraphics[width=0.5\\\\textwidth]{explore.png}',
        '  \\\\caption{购电费用随时间变化}\\\\label{fig:one}',
        '\\\\end{figure}',
        '\\\\end{document}'
      ].join('\\n'))
      return 'SEEDED'
    })()`)
    step('论文稿已写入（引用沙箱产出的图）', wired === 'SEEDED', String(wired))

    const clicked = await evaluate(`(() => {
      const btn = [...(${PAPER}||document).querySelectorAll('button')].find(b => b.innerText.includes('编译'))
      if (!btn) return 'NO_BTN'
      btn.click()
      return 'COMPILE_CLICKED:' + btn.innerText.trim()
    })()`)
    step('编译按钮可点', String(clicked).startsWith('COMPILE_CLICKED'), String(clicked))
    const okHead = await waitFor(`(${PAPER}?.innerText.match(/✓\\s*(\\d+) 页/) || [])[1] || null`, 180000)
    step('xelatex 两遍编译出 PDF 且页数解析正确', Boolean(okHead), `pages=${String(okHead)}`)
    // 只看 iframe 元素在不在会被打包态的 CSP 骗过去：blob 框架被拦时元素照样存在
    const previewed = await waitFor(
      `(() => {
        const f = ${PAPER} ? ${PAPER}.querySelector('iframe[src^="blob:"]') : null
        if (!f) return null
        try { return f.contentDocument && f.contentDocument.URL === f.src ? 'yes' : null } catch (e) { return null }
      })()`,
      30000
    )
    step('PDF 预览真的装进了窗口（blob 框架没被 CSP 拦）', previewed === 'yes', String(previewed))
    const shoot = async (file) => {
      const s = await send('Page.captureScreenshot', { format: 'png' })
      if (s.result?.data) {
        const { writeFileSync } = await import('node:fs')
        writeFileSync(file, Buffer.from(s.result.data, 'base64'))
        console.log(`截图已保存 ${file}`)
      }
    }
    await shoot('.tmp/ui-paper-pdf.png')
    const refOk = JSON.parse(
      await evaluate(`JSON.stringify({
        warns: (${PAPER}?.innerText.match(/(\\d+) 条排版警告/) || [])[1] || '0',
        viewer: navigator.pdfViewerEnabled !== false
      })`)
    )
    step('两遍编译后交叉引用没有留下警告', refOk.warns === '0', `warnings=${refOk.warns} viewer=${refOk.viewer}`)

    const broken = await evaluate(`(() => {
      const ta = ${PAPER_TA}
      const set = ${nativeSet}
      const bad = ta.value.replace('目标函数见式', '\\\\fooBar 目标函数见式')
      set(ta, bad)
      ;[...(${PAPER}||document).querySelectorAll('button')].find(b => b.innerText.includes('编译'))?.click()
      return 'BROKEN_COMPILED'
    })()`)
    step('故意写坏后重新编译已触发', broken === 'BROKEN_COMPILED', String(broken))
    const errShown = await waitFor(
      `(${PAPER}?.innerText.includes('处错误') ? 'yes' : null)`,
      180000
    )
    step('编译失败被翻译成了错误条数', errShown === 'yes')
    const issue = JSON.parse(
      await evaluate(`(() => {
        const btn = [...(${PAPER}||document).querySelectorAll('button')].find(b => /^第 \\d+/.test(b.innerText.trim()))
        const block = btn?.closest('div.border-l-2')
        return JSON.stringify({
          line: btn ? btn.innerText.trim() : null,
          text: block ? block.innerText.replace(/\\s+/g, ' ').slice(0, 200) : ''
        })
      })()`)
    )
    step('错误定位到了源码行', Boolean(issue.line), issue.line ?? '没有行号按钮')
    step('错误带了可执行建议', /命令|拼写|宏包/.test(issue.text), issue.text.slice(0, 100))
    await shoot('.tmp/ui-paper-issues.png')
    const clickedJump = await evaluate(`(() => {
      const btn = [...(${PAPER}||document).querySelectorAll('button')].find(b => /^第 \\d+/.test(b.innerText.trim()))
      if (!btn) return 'NO_LINE_BTN'
      btn.click()
      return 'JUMP_CLICKED'
    })()`)
    step('点行号跳回源码并选中那一行', clickedJump === 'JUMP_CLICKED', String(clickedJump))
    const jumped = await waitFor(
      `(() => {
        const ta = ${PAPER_TA}
        if (!ta || document.activeElement !== ta) return null
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd)
        return sel.includes('fooBar') ? JSON.stringify({ sel: sel.trim().slice(0, 40) }) : null
      })()`,
      5000
    )
    step('跳过去之后光标落在出错那一行', Boolean(jumped), jumped ?? '没选中目标行')

    const saved = JSON.parse(
      await evaluate(`(async () => {
        const set = ${nativeSet}
        set(${PAPER_TA}, ${PAPER_TA}.value + '\\n% 收尾改一笔')
        await new Promise(r => setTimeout(r, 600))
        const dirtyEarly = ${PAPER}?.innerText.includes('未保存')
        await new Promise(r => setTimeout(r, 2600))
        const sessions = await window.api.listSessions()
        const sid = Math.max(...sessions.map(s => s.id))
        const d = await window.api.paperDraft(sid)
        const shown = ${PAPER_TA}?.value.slice(-12)
        return JSON.stringify({
          sid,
          dirtyEarly,
          dirtyLate: ${PAPER}?.innerText.includes('未保存'),
          panelErr: (${PAPER}?.innerText.match(/保存[^\\n]{0,40}|[^\\n]*Error[^\\n]{0,40}/) || [])[0] || '',
          edited: d.edited,
          shown,
          restored: d.source.trimEnd().endsWith('% 收尾改一笔'),
          tail: d.source.trimEnd().slice(-12)
        })
      })()`)
    )
    step('改一笔立刻显示未保存，存完自己消掉', saved.dirtyEarly === true && saved.dirtyLate === false, JSON.stringify(saved).slice(0, 120))
    step('停手两秒自动存版，切回来还是自己的稿子', saved.restored === true && saved.edited === true && saved.shown === saved.tail, JSON.stringify(saved).slice(-140))
    await shoot('.tmp/ui-paper.png')
  } catch (e) {
    step('M3 端到端探针', false, (e instanceof Error ? e.message : String(e)).slice(0, 300))
  } finally {
    // 假端点只借用了 custom 这一路 Provider，收尾把设置还回学生原本指向的真实端点
    if (before) await evaluate(`(async () => { await window.api.saveSettings(${before}); return 1 })()`).catch(() => undefined)
    await mock.stop()
    const bad = step.results.filter((r) => !r).length
    console.log(`\n${step.results.length - bad}/${step.results.length} 通过`)
    if (bad) process.exitCode = 1
  }
}

/**
 * M4 端到端：右栏方法库检索 → 展开卡（只有坑与追问）→ 钉候选（上限 3）→
 * 注入教练提示 → 使用日志留痕 → 切走再切回来钉选还在。
 * 用本地假端点只为造出一轮真实教练调用；结束时把设置原样还回去。
 * 运行：npm run smoke:ui:methods
 */
if (process.argv[2] === 'methods') {
  const { startMockLlm } = await import('./mock-llm.mjs')
  const mock = await startMockLlm()
  const step = (name, ok, detail = '') => {
    step.results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }
  step.results = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (js, timeout = 30000) => {
    for (let i = 0; i < timeout / 500; i++) {
      const v = await evaluate(js)
      if (v) return v
      await wait(500)
    }
    return null
  }
  const setTa = `(el, v) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
  const setInput = `(el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
  /** 方法库面板 = 包含搜索框的那层 div（aside 本身不是 div，所以这层就是面板根） */
  const PANEL = `[...document.querySelectorAll('aside div')].find(d => d.querySelector('input[placeholder^="搜方法"]'))`
  const CHIPS = `[...(${PANEL}||document).querySelectorAll('button')].filter(b => b.innerText.trim().endsWith('×'))`
  const HEADER = `(name) => [...(${PANEL}||document).querySelectorAll('button')].find(b => /^[▾▸]/.test(b.innerText.trim()) && b.innerText.includes(name))`
  const setQuery = (q) =>
    evaluate(`(() => {
      const inp = [...(${PANEL}||document).querySelectorAll('input')][0]
      if (!inp) return 'NO_INPUT'
      const set = ${setInput}
      set(inp, ${JSON.stringify(q)})
      return 'TYPED'
    })()`)
  /** React 的展开是异步的：点卡头和点卡里的钉选按钮必须分两次求值 */
  const openCard = (name) =>
    evaluate(`(() => {
      const head = (${HEADER})(${JSON.stringify(name)})
      if (!head) return 'NO_CARD'
      if (head.innerText.trim().startsWith('▾')) return 'ALREADY_OPEN'
      head.click()
      return 'OPENED'
    })()`)
  const clickPin = (name, want) =>
    evaluate(`(() => {
      const head = (${HEADER})(${JSON.stringify(name)})
      const pin = head ? [...head.closest('div').querySelectorAll('button')].find(b => /钉为候选方法|取消钉选/.test(b.innerText)) : null
      if (!pin) return 'NO_PIN_BTN'
      const pinned = pin.innerText.includes('取消钉选')
      if (${JSON.stringify(want)} === 'on' && pinned) return 'ALREADY'
      if (${JSON.stringify(want)} === 'off' && !pinned) return 'NOT_PINNED'
      pin.click()
      return 'CLICKED'
    })()`)
  const cardText = (name) =>
    evaluate(`(() => {
      const head = (${HEADER})(${JSON.stringify(name)})
      if (!head) return JSON.stringify({ found: false })
      const t = head.closest('div').innerText
      return JSON.stringify({
        found: true,
        hasPit: t.includes('常见坑'),
        hasAsk: t.includes('教练会追问'),
        ghost: /综上所述|我们建立了|本文采用/.test(t),
        excerpt: t.replace(/\\s+/g, ' ').slice(0, 80)
      })
    })()`)
  /** 走一遍「搜 → 展开 → 钉」，返回最后一步的结果 */
  const pinMethod = async (query, name) => {
    await setQuery(query)
    await wait(350)
    const opened = await openCard(name)
    await wait(300)
    const clicked = await clickPin(name, 'on')
    await wait(450)
    return `${name}:${opened}/${clicked}`
  }
  const shoot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    if (s.result?.data) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(file, Buffer.from(s.result.data, 'base64'))
      console.log(`截图已保存 ${file}`)
    }
  }

  let settingsRestored = false
  let before = null
  try {
    before = await evaluate(`(async () => JSON.stringify(await window.api.getSettings()))()`)

    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) || 'x'`)
    await wait(400)
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '新建')?.click() || 'x'`)
    await wait(400)
    // 方法库的搜索词是浏览状态，切会话不清空，所以探针自己先归零
    await setQuery('')
    await wait(400)

    const head = JSON.parse(
      await evaluate(`JSON.stringify({
        hasPanel: (${PANEL} || undefined) !== undefined,
        defaultRows: [...(${PANEL}||document).querySelectorAll('button')].filter(b => /^[▾▸]/.test(b.innerText.trim())).length,
        explainsFallback: (${PANEL}?.innerText || '').includes('这一步还没到选方法')
      })`)
    )
    step('右栏挂上了方法库区块', head.hasPanel === true)
    step('空搜索框给出常用方法垫底（本阶段无专属卡时有说明）', head.defaultRows >= 5 && head.explainsFallback === true, `rows=${head.defaultRows} 说明=${head.explainsFallback}`)

    const search = await setQuery('评价')
    await wait(400)
    const hits = await evaluate(`(${PANEL}?.innerText || '')`)
    step('搜索「评价」能出评价族', search === 'TYPED' && /熵权|TOPSIS|层次分析/.test(hits), hits.slice(0, 60).replace(/\s+/g, ' '))

    const opened = await openCard('熵权')
    await wait(350)
    const txt = JSON.parse(await cardText('熵权'))
    step(
      '展开卡只给适用条件/坑/追问，没有可粘贴正文',
      opened !== 'NO_CARD' && txt.found && txt.hasPit && txt.hasAsk && !txt.ghost,
      `${String(opened)} 坑=${txt.hasPit} 追问=${txt.hasAsk} 成稿句=${txt.ghost} ｜ ${txt.excerpt}`
    )
    const exCard = () =>
      evaluate(`(() => {
        const head = (${HEADER})('熵权')
        const card = head ? head.closest('div') : null
        const blk = card ? [...card.querySelectorAll('div')].find(d => (d.className || '').includes('text-emerald-200')) : null
        return JSON.stringify({ t: blk ? (blk.parentElement.innerText || '').replace(/\\s+/g, ' ') : null })
      })()`)
    const inCard = JSON.parse(await exCard())
    step(
      '方法卡自带分级讲解：第一层只给直觉，并写明「这一段是科普，不是本题答案」',
      !!inCard.t &&
        inCard.t.includes('方法卡 · 熵权法') &&
        inCard.t.includes('讲到第 1 / 4 层') &&
        inCard.t.includes('这一段是科普，不是本题答案') &&
        !inCard.t.includes('比方：'),
      String(inCard.t).slice(0, 90)
    )
    const deeper = await evaluate(`(() => {
      const head = (${HEADER})('熵权')
      const b = head ? [...head.closest('div').querySelectorAll('button')].find(x => (x.innerText || '').trim() === '再讲一层') : null
      if (!b) return 'NO_BTN'
      b.click()
      return 'CLICKED'
    })()`)
    await wait(400)
    const inCard2 = JSON.parse(await exCard())
    step(
      '方法卡讲解同样按层往下走（第二层出「比方：」）',
      deeper === 'CLICKED' && !!inCard2.t && inCard2.t.includes('讲到第 2 / 4 层') && inCard2.t.includes('比方：'),
      `${deeper} ｜ ${String(inCard2.t).slice(0, 90)}`
    )
    const disabled = await evaluate(`(() => {
      const head = (${HEADER})('熵权')
      const pin = head ? [...head.closest('div').querySelectorAll('button')].find(b => b.innerText.includes('钉为候选')) : null
      return pin ? pin.disabled === true : 'NO_PIN_BTN'
    })()`)
    step('还没建会话时钉选按钮不可用', disabled === true, String(disabled))
    await shoot('.tmp/ui-methods-search.png')

    // 先造一轮真实教练调用，未钉选时应按任务卡自动匹配
    await evaluate(`(async () => {
      await window.api.saveSettings({ providerId: 'custom', baseUrl: ${JSON.stringify(mock.baseUrl)}, model: 'mock-coach', temperature: 0.2 })
      await window.api.setApiKey('custom', 'mock-key-not-a-real-one')
      return 'SET'
    })()`)
    const sent = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').includes('描述你的题目'))
      if (!ta) return 'NO_CHAT_INPUT'
      const set = ${setTa}
      set(ta, '2025 年 C 题：要给出评价方案，指标权重怎么定，附件是三个数据文件。')
      ;[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '发送')?.click()
      return 'SENT'
    })()`)
    step('首轮对话已发出（建会话）', sent === 'SENT', String(sent))
    const settled1 = await waitFor(
      `(() => {
        if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
        return document.body.innerText.includes('检查点') ? 'ok' : null
      })()`
    )
    step('教练卡片已定稿', settled1 === 'ok')
    const sid = await evaluate(
      `(async () => { const ss = await window.api.listSessions(); return String(Math.max(...ss.map(s => s.id))) })()`
    )
    const auto = JSON.parse(
      await evaluate(`(async () => {
        const rows = await window.api.listUsage(${sid})
        const c = rows.filter(r => r.action === 'coach_reply').pop()
        return JSON.stringify({ pinned: await window.api.pinnedMethods(${sid}), detail: c ? c.detail : '' })
      })()`)
    )
    step('第 1 阶段没到选型：未钉选也没硬塞方法卡', /未参考方法卡/.test(auto.detail), auto.detail.slice(0, 80))
    step('切会话前钉选为空', Array.isArray(auto.pinned) && auto.pinned.length === 0, JSON.stringify(auto.pinned))

    const pinLog = []
    for (const [q, name] of [
      ['评价', '熵权法'],
      ['评价', 'TOPSIS'],
      ['AHP', 'AHP 层次分析法']
    ])
      pinLog.push(await pinMethod(q, name))
    const pinOk = pinLog.every((s) => s.endsWith('/CLICKED') || s.endsWith('/ALREADY'))
    const chips = JSON.parse(
      await evaluate(`(async () => JSON.stringify({
        chips: ${CHIPS}.map(b => b.innerText.trim()),
        db: await window.api.pinnedMethods(${sid}),
        counter: (${PANEL}?.innerText.match(/已钉 (\\d)\\/3/) || [])[1] || ''
      }))()`)
    )
    step('连钉三张候选方法', pinOk, pinLog.join(' '))
    step(
      'chips 与库里的钉选一致（上限 3 张）',
      chips.db.length === 3 && chips.counter === '3' && chips.chips.length === 3,
      JSON.stringify(chips).slice(0, 180)
    )

    await setQuery('模糊')
    await wait(400)
    const fourthOpen = await openCard('模糊')
    await wait(350)
    const over = await clickPin('模糊', 'on')
    const rejected = await waitFor(`document.body.innerText.includes('最多钉 3 张') ? 'yes' : null`, 4000)
    step(
      '钉第四张被拒并提示先取消一张',
      fourthOpen === 'OPENED' && over === 'CLICKED' && rejected === 'yes',
      `${fourthOpen}/${over} err=${String(rejected)}`
    )
    const stillThree = await evaluate(`(async () => (await window.api.pinnedMethods(${sid})).length)()`)
    step('被拒之后库里仍是三张', stillThree === 3, `n=${String(stillThree)}`)
    await shoot('.tmp/ui-methods-pinned.png')

    // 带钉选再走一轮：方法要点应进入教练系统提示，且日志记为「学生钉选」
    const before2 = mock.calls.length
    const sent2 = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').includes('描述你的题目'))
      if (!ta) return 'NO_CHAT_INPUT'
      const set = ${setTa}
      set(ta, '我打算用熵权法定权重，TOPSIS 排序，AHP 做对照。')
      ;[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '发送')?.click()
      return 'SENT'
    })()`)
    step('第二轮对话已发出', sent2 === 'SENT', String(sent2))
    await waitFor(
      `(() => {
        if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
        return (document.body.innerText.match(/检查点/g) || []).length >= 2 ? 'ok' : null
      })()`,
      40000
    )
    const coachCall = mock.calls.slice(before2).find((c) => c.role === 'coach')
    const digestOk =
      !!coachCall && /【方法库要点/.test(coachCall.sys) && /熵权法/.test(coachCall.sys) && /TOPSIS/.test(coachCall.sys)
    step('钉选的方法要点已注入教练提示', digestOk === true, coachCall ? `sys ${String(coachCall.sys.length)} 字` : '没打到假端点')
    const logged = JSON.parse(
      await evaluate(`(async () => {
        const rows = await window.api.listUsage(${sid})
        const c = rows.filter(r => r.action === 'coach_reply').pop()
        return JSON.stringify({ detail: c ? c.detail : '' })
      })()`)
    )
    step('使用日志记下这轮参考了哪些卡（M5 留痕）', /学生钉选/.test(logged.detail), logged.detail.slice(0, 100))

    const clickChip = () =>
      evaluate(`(() => {
        const chip = (${CHIPS})[0]
        if (!chip) return 'NO_CHIP'
        chip.click()
        return 'UNPINNED'
      })()`)

    const backAgain = await clickChip()
    await wait(500)
    const afterUnpin = await evaluate(`(async () => (await window.api.pinnedMethods(${sid})).length)()`)
    step('点 chip 能取消钉选', backAgain === 'UNPINNED' && afterUnpin === 2, `${backAgain} n=${String(afterUnpin)}`)

    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '新建')?.click() || 'x'`)
    await wait(400)
    const reopened = await evaluate(`(async () => {
      const row = [...document.querySelectorAll('aside button')].find(b => b.innerText.includes('2025 年 C 题'))
      if (!row) return 'NO_SESSION_ROW'
      row.click()
      await new Promise(r => setTimeout(r, 900))
      return JSON.stringify({ n: (await window.api.pinnedMethods(${sid})).length, chips: (${CHIPS}).length })
    })()`)
    const re = JSON.parse(String(reopened).startsWith('{') ? reopened : '{"n":-1,"chips":-1}')
    step('切走再切回来，钉选从库里还原', re.n === 2 && re.chips === 2, JSON.stringify(re))
    await shoot('.tmp/ui-methods.png')

    // 清空钉选后，方法要点应改由学生交出的任务卡文本自动挑
    for (let i = 0; i < 2; i++) {
      await clickChip()
      await wait(450)
    }
    const cleared = await evaluate(`(async () => (await window.api.pinnedMethods(${sid})).length)()`)
    step('三张全部取消后库里有 0 张钉选', cleared === 0, `n=${String(cleared)}`)
    const seeded = await evaluate(`(async () => {
      const card = await window.api.stageCard(${sid}, 1)
      const values = {}
      for (const f of card.fields)
        values[f.key] = '第二问对若干调度方案做综合评价：先用熵权法按指标离散程度定权重，再用 TOPSIS 按贴近理想解排序，指标口径见附件字段说明'
      await window.api.submitStage({ sessionId: ${sid}, stageId: 1, values })
      return 'CARDED'
    })()`)
    const before3 = mock.calls.length
    await wait(300)
    const sent3 = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').includes('描述你的题目'))
      if (!ta) return 'NO_CHAT_INPUT'
      const set = ${setTa}
      set(ta, '第二问的评价对象是各调度方案，指标口径我按附件字段写清了，接下来怎么比出高低？')
      ;[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '发送')?.click()
      return 'SENT'
    })()`)
    await waitFor(
      `(() => {
        if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
        return (document.body.innerText.match(/检查点/g) || []).length >= 3 ? 'ok' : null
      })()`,
      40000
    )
    const autoMatch = JSON.parse(
      await evaluate(`(async () => {
        const rows = await window.api.listUsage(${sid})
        const c = rows.filter(r => r.action === 'coach_reply').pop()
        return JSON.stringify({ detail: c ? c.detail : '' })
      })()`)
    )
    const autoCall = mock.calls.slice(before3).find((c) => c.role === 'coach')
    step(
      '没钉选时按学生交出的任务卡文本自动挑方法并留痕',
      seeded === 'CARDED' &&
        sent3 === 'SENT' &&
        /按任务卡自动匹配/.test(autoMatch.detail) &&
        /【方法库要点/.test(autoCall?.sys ?? ''),
      autoMatch.detail.slice(0, 90)
    )

    await evaluate(`(async () => { await window.api.saveSettings(${before}); return 'RESTORED' })()`)
    settingsRestored = true
  } catch (e) {
    step('M4 端到端探针', false, (e instanceof Error ? e.message : String(e)).slice(0, 1200))
  } finally {
    // 假端点只借用了 custom 这一路 Provider，收尾把设置还回学生原本指向的真实端点
    if (!settingsRestored && before) {
      await evaluate(`(async () => { await window.api.saveSettings(${before}); return 1 })()`).catch(() => undefined)
    }
    await mock.stop()
    const bad = step.results.filter((r) => !r).length
    console.log(`\n${step.results.length - bad}/${step.results.length} 通过`)
    if (bad) process.exitCode = 1
  }
}

/**
 * M5 端到端：留痕 → 合规面板 → 生成《AI 工具使用详情.pdf》。
 * 导出走的是原生另存对话框，自动化点不动，所以 dev 必须带 MMT_EXPORT_DIR 启动，
 * 让主进程把同一份 PDF 直接写进那个目录。
 */
if (process.argv[2] === 'compliance') {
  const { startMockLlm } = await import('./mock-llm.mjs')
  const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const mock = await startMockLlm()
  const step = (name, ok, detail = '') => {
    step.results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }
  step.results = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (js, timeout = 30000) => {
    for (let i = 0; i < timeout / 500; i++) {
      const v = await evaluate(js)
      if (v) return v
      await wait(500)
    }
    return null
  }
  const PANEL = `[...document.querySelectorAll('section')].find(s => [...s.querySelectorAll('button')].some(b => b.innerText.includes('AI 使用详情')))`
  const btn = (re) => `[...(${PANEL}||document).querySelectorAll('button')].find(b => ${re}.test(b.innerText.trim()))`
  const shoot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    if (s.result?.data) writeFileSync(file, Buffer.from(s.result.data, 'base64'))
    console.log(`截图 ${file}`)
  }
  const KEY = 'mock-key-NEVER-LEAKS-123456'
  /** 面板可能因切到第 11 阶段而自动展开，这里只补点、绝不再点已展开的开关 */
  const ensureOpen = async () => {
    for (let i = 0; i < 6; i++) {
      const open = await evaluate(`(${PANEL}?.innerText || '').includes('工具与版本') ? 1 : 0`)
      if (open) return
      await evaluate(`(${btn('/AI 使用详情/')})?.click() || 'x'`)
      await wait(400)
    }
  }

  let settingsRestored = false
  let before = null
  try {
    // 上一次探针可能留下活动会话，而「没建会话时导出应禁用」要求空白状态；重载页面比点「新建」可靠
    await send('Page.reload')
    await waitFor(`!!(window.api && (document.getElementById('root')?.childElementCount ?? 0) > 0)`, 20000)
    before = await evaluate(`(async () => JSON.stringify(await window.api.getSettings()))()`)
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '新建')?.click() || 'x'`)
    await wait(400)
    await evaluate(`(async () => {
      await window.api.saveSettings({ providerId: 'custom', baseUrl: ${JSON.stringify(mock.baseUrl)}, model: 'mock-coach', temperature: 0.2 })
      await window.api.setApiKey('custom', ${JSON.stringify(KEY)})
      return 'SET'
    })()`)

    const mounted = JSON.parse(
      await evaluate(`JSON.stringify({
        hasPanel: (${PANEL} || undefined) !== undefined,
        header: (${PANEL}?.innerText || '').replace(/\\s+/g, ' ').slice(0, 60),
        exportDisabled: (${btn('/生成并导出/')})?.disabled === true
      })`)
    )
    step('主区挂上了合规面板', mounted.hasPanel === true, mounted.header)
    step('没建会话时导出按钮禁用', mounted.exportDisabled === true, String(mounted.exportDisabled))

    const sent = await sendFirstMessage('2025 年 C 题：光电池装配线要排产，附件是三个数据文件，先界定问题。')
    step('首轮对话已发出', sent === 'SENT', String(sent))
    await waitFor(
      `(() => {
        if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
        return document.body.innerText.includes('检查点') ? 'ok' : null
      })()`
    )
    const sid = await evaluate(
      `(async () => { const ss = await window.api.listSessions(); return String(Math.max(...ss.map(s => s.id))) })()`
    )
    // L1 只给提问，示例从 L2 才开始：新建会话要点两次「要提示」才留出 scaffold_given
    let hinted = null
    for (let i = 0; i < 3 && !hinted; i++) {
      await evaluate(`(async () => { await window.api.askHint(${sid}); return 1 })()`)
      hinted = await waitFor(
        `(async () => ((await window.api.listUsage(${sid})).some(r => r.action === 'scaffold_given') ? 'ok' : null))()`,
        40000
      )
    }
    step('提示升级已留痕（scaffold_given）', hinted === 'ok', String(hinted))

    const pre = JSON.parse(
      await evaluate(`(async () => {
        const s = await window.api.usageSummary(${sid})
        return JSON.stringify({ turns: s.turns, events: s.events, actions: s.actions.map(a => a.label), gaps: s.gaps, review: s.review })
      })()`)
    )
    step(
      '留痕统计覆盖提问与示例两条线',
      pre.events >= 3 &&
        pre.turns >= 2 &&
        pre.actions.some((a) => a.includes('教练')) &&
        pre.actions.some((a) => a.includes('示例')),
      JSON.stringify(pre.actions).slice(0, 160)
    )
    step('复核未填时先催第 11 阶段', pre.gaps.some((g) => g.includes('记录复核')), pre.gaps.join(' / ').slice(0, 160))

    const filled = await evaluate(`(async () => {
      const card = await window.api.stageCard(${sid}, 11)
      const values = {}
      for (const f of card.fields) values[f.key] = '排产表的灵敏度数值由本队自己跑代码得到；L2 示例只参考思路，已全部改写并核实'
      await window.api.submitStage({ sessionId: ${sid}, stageId: 11, values })
      const s = await window.api.usageSummary(${sid})
      return JSON.stringify({ review: s.review, gaps: s.gaps })
    })()`)
    const ff = JSON.parse(filled)
    step(
      '填了任务卡复核后缺口提示随之消失',
      ff.review.includes('已全部改写') && !ff.gaps.some((g) => g.includes('记录复核')),
      ff.gaps.join(' / ').slice(0, 140)
    )

    await ensureOpen()
    await evaluate(`(${btn('/重新统计/')})?.click() || 'x'`)
    await wait(900)
    const ui = JSON.parse(
      await evaluate(`(async () => {
        const s = await window.api.usageSummary(${sid})
        return JSON.stringify({
          events: s.events,
          text: (${PANEL}?.innerText || '').replace(/\\s+/g, ' '),
          stat: (${PANEL}?.innerText.match(/事件 (\\d+) · 交互 (\\d+) 条/) || []).slice(1, 3)
        })
      })()`)
    )
    step(
      '面板展开后显示工具/事件/复核三段',
      /工具与版本/.test(ui.text) && /AI 参与事件/.test(ui.text) && /记录复核/.test(ui.text),
      ui.text.slice(0, 120)
    )
    step('面板上的计数与库里一致', Number(ui.stat[0]) === ui.events, JSON.stringify(ui.stat))
    step('面板明说密钥不写进文件', ui.text.includes('密钥只存在本机系统钥匙串'))
    await shoot('.tmp/ui-compliance.png')

    const outDir = process.env.MMT_EXPORT_DIR
    if (!outDir) throw new Error('dev 未带 MMT_EXPORT_DIR 启动，导出会卡在原生对话框')
    mkdirSync(outDir, { recursive: true })
    await evaluate(`(${btn('/生成并导出/')})?.click() || 'x'`)
    const done = await waitFor(
      `(() => {
        const t = (${PANEL}?.innerText || '')
        if (/生成中/.test(t)) return null
        return /已存到/.test(t) ? 'yes' : null
      })()`,
      180000
    )
    step('点导出后状态条报出保存位置', done === 'yes', String(done))

    const pdf = join(outDir, 'AI工具使用详情.pdf')
    const rt = JSON.parse(await evaluate(`(async () => JSON.stringify(await window.api.runtimeInfo()))()`))
    const texPath = join(rt.sandboxRoot, `session-${sid}`, 'ai-usage.tex')
    const tex = existsSync(texPath) ? readFileSync(texPath, 'utf8') : ''
    step(
      'PDF 真的落盘且非空',
      existsSync(pdf) && statSync(pdf).size > 20000,
      existsSync(pdf) ? `${String(Math.round(statSync(pdf).size / 1024))} KB` : '没生成'
    )
    step(
      '生成的 .tex 不含 API 密钥',
      tex.length > 0 && !tex.includes(KEY) && !/sk-[A-Za-z0-9]{8}/.test(tex),
      tex ? `${String(tex.length)} 字` : '读不到 tex'
    )
    step(
      '文件里写明密钥不外泄与以官方原文为准',
      tex.includes('密钥只存在本机系统钥匙串') &&
        tex.includes('以官方原文为准') &&
        tex.includes('七、完整交互过程') &&
        tex.includes('六、引导交互明细')
    )
    step('交互过程按学生原话照录', tex.includes('光电池装配线') && tex.includes('已全部改写并核实'))
    await shoot('.tmp/ui-compliance-pdf.png')

    await evaluate(`(async () => { await window.api.saveSettings(${before}); return 'RESTORED' })()`)
    settingsRestored = true
  } catch (e) {
    step('M5 端到端探针', false, (e instanceof Error ? e.message : String(e)).slice(0, 1200))
  } finally {
    if (!settingsRestored && before) {
      await evaluate(`(async () => { await window.api.saveSettings(${before}); return 1 })()`).catch(() => undefined)
    }
    await mock.stop()
    const bad = step.results.filter((r) => !r).length
    console.log(`\n${String(step.results.length - bad)}/${String(step.results.length)} 通过`)
    if (bad) process.exitCode = 1
  }
}

/**
 * M6-2 端到端：学生在阶段 1 交出逐问拆解 → 界面长出「整题 / 问题 N」切换条 →
 * 聚焦跟着会话落进 DB（迁移 v7，页面重载后还在）→ 可拆字段按问分开存 →
 * 教练那一轮的系统提示里带上逐问进度与当前聚焦。
 * 运行：npm run smoke:ui:questions
 */
if (process.argv[2] === 'questions') {
  const { startMockLlm } = await import('./mock-llm.mjs')
  const mock = await startMockLlm()
  const step = (name, ok, detail = '') => {
    step.results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }
  step.results = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (js, timeout = 30000) => {
    for (let i = 0; i < timeout / 400; i++) {
      const v = await evaluate(js)
      if (v) return v
      await wait(400)
    }
    return null
  }
  const setTa = `(el, v) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
  const CARD = `[...document.querySelectorAll('section')].find(s => /^[▾▸]\\s*本阶段任务卡/.test(s.innerText))`
  const BAR = `(${CARD}?.innerText.match(/这一轮盯着[\\s\\S]{0,120}/) || [])[0] || ''`
  const PROBLEMS = [
    '问题 1：给定附件一的工艺参数，给出每班排产方案，输出各工序开工时刻',
    '问题 2：评价指标为总完工时间与不合格率，评价对象是三种装配顺序',
    '问题 3：考虑返工与故障，评价对象扩展到随机扰动下的方案鲁棒性'
  ].join('\n')
  const shoot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    if (s.result?.data) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(file, Buffer.from(s.result.data, 'base64'))
      console.log(`截图已保存 ${file}`)
    }
  }

  let settingsRestored = false
  let before = null
  try {
    await send('Page.reload')
    await waitFor(`!!(window.api && (document.getElementById('root')?.childElementCount ?? 0) > 0) ? 1 : 0`, 20000)
    before = await evaluate(`(async () => JSON.stringify(await window.api.getSettings()))()`)
    await evaluate(`(async () => {
      await window.api.saveSettings({ providerId: 'custom', baseUrl: ${JSON.stringify(mock.baseUrl)}, model: 'mock-coach', temperature: 0.2 })
      await window.api.setApiKey('custom', 'mock-key-m6')
      return 'SET'
    })()`)
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) || 'x'`)
    await wait(400)
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '新会话')?.click() || 'x'`)
    await wait(400)

    const sent = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').includes('描述你的题目'))
      if (!ta) return 'NO_CHAT_INPUT'
      const set = ${setTa}
      set(ta, '2025 年 C 题 M6Q：光电池装配线排产，附件三个数据文件，共三问。')
      ;[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '发送')?.click()
      return 'SENT'
    })()`)
    step('首轮已发出（建会话）', sent === 'SENT', String(sent))
    await waitFor(`document.body.innerText.includes('检查点') ? 'ok' : null`, 60000)

    const noBar = await evaluate(`(${BAR}).replace(/\\s+/g, ' ')`)
    step('只交题干还没拆解时不出现切换条', !String(noBar).includes('问题 1'), String(noBar).slice(0, 60))

    const submitted = await evaluate(`(() => {
      const box = ${CARD}
      if (!box) return 'NO_CARD'
      const set = ${setTa}
      const ta = [...box.querySelectorAll('textarea')]
      if (ta.length < 3) return 'TOO_FEW_TAS:' + ta.length
      set(ta[0], ${JSON.stringify(PROBLEMS)})
      set(ta[1], '附件一 12 列，含工序、工时、故障率，缺失 3%')
      set(ta[2], '正文、每问至少 2 张图、附录代码')
      ;[...box.querySelectorAll('button')].find(b => b.innerText.includes('提交给教练评审'))?.click()
      return 'SUBMITTED'
    })()`)
    step('阶段 1 逐问拆解已提交', submitted === 'SUBMITTED', String(submitted))
    const bar = await waitFor(`(${BAR}).includes('问题 3') ? ${BAR} : null`, 30000)
    step('拆解出三问后任务卡长出问题切换条', Boolean(bar), String(bar).replace(/\s+/g, ' ').slice(0, 90))
    const sid = await evaluate(
      `(async () => { const ss = await window.api.listSessions(); return String(Math.max(...ss.map(s => s.id))) })()`
    )

    const clicked = await evaluate(`(() => {
      const b = [...(${CARD}||document).querySelectorAll('button')].find(x => x.innerText.trim() === '问题 2')
      if (!b) return 'NO_Q2_BTN'
      b.click()
      return 'CLICKED'
    })()`)
    const focus = await waitFor(
      `(async () => ((await window.api.questions(${sid})).focus === 2 ? 'ok' : null))()`
    )
    step('点「问题 2」后焦点落库（迁移 v7 的 question_idx）', clicked === 'CLICKED' && focus === 'ok', `${clicked} focus=${String(focus)}`)
    await shoot('.tmp/ui-questions-bar.png')

    /** 填卡 → 点「提交给教练评审」，mock 教练一轮就判过，所以一次调用推进一个阶段 */
    const passStage = async (vals, nextTitle) => {
      const n = await evaluate(`(document.body.innerText.match(/检查点/g) || []).length`)
      const callAt = mock.calls.length
      const script = `(() => {
        const box = ${CARD}
        if (!box) return 'NO_CARD'
        const set = ${setTa}
        const tas = [...box.querySelectorAll('textarea')]
        if (tas.length !== ${String(vals.length)}) return 'TA_COUNT:' + tas.length
        const want = ${JSON.stringify(vals)}
        want.forEach((v, i) => set(tas[i], v))
        return 'FILLED:' + tas.length
      })()`
      const filled = await evaluate(script)
      if (filled !== 'FILLED:' + String(vals.length)) return { r: String(filled), sys: '', moved: false }
      // 受控组件的 disabled 由 React 状态决定，填值和点提交必须分两次求值
      const r = await evaluate(`(() => {
        const box = ${CARD}
        const btn = [...(box?.querySelectorAll('button') || [])].find(b => b.innerText.includes('提交给教练评审'))
        if (!btn || btn.disabled) return 'NO_SUBMIT_BTN'
        btn.click()
        return 'SUBMITTED'
      })()`)
      if (r !== 'SUBMITTED') return { r, sys: '', moved: false }
      const settled = await waitFor(
        `(() => {
          if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
          return (document.body.innerText.match(/检查点/g) || []).length > ${n} ? 'ok' : null
        })()`,
        90000
      )
      const sys = mock.calls.slice(callAt).find((c) => c.role === 'coach')?.sys ?? ''
      const moved = nextTitle
        ? await waitFor(`(${CARD}?.innerText || '').includes(${JSON.stringify(nextTitle)}) ? 'yes' : null`, 30000)
        : 'skip'
      return { r: `${r}/${String(settled)}`, sys, moved: moved === 'yes' }
    }

    const s2 = await passStage(
      ['缺失 3% 按同班同工序中位数补，故障标记单独成列；异常值超出 3σ 才剔除', '完工时间右偏，故障集中在夜班，量纲统一为小时'],
      '假设与符号表'
    )
    step('阶段 2 提交后推进到阶段 3', s2.moved, s2.r)
    const s3 = await passStage(
      ['同一批订单不跨班拆分；若不为真则需重排班表', 'C_ij 为工序 i 在设备 j 的工时，单位小时；T 为总完工时间，单位小时'],
      '模型选型'
    )
    step('阶段 3 提交后推进到阶段 4（可拆字段该露脸了）', s3.moved, s3.r)

    const q4 = JSON.parse(
      await evaluate(`(() => {
        const box = ${CARD}
        return JSON.stringify({
          tas: box ? box.querySelectorAll('textarea').length : -1,
          labels: [...(box?.querySelectorAll('span') || [])].filter(s => /^问题 \\d$/.test(s.textContent || '')).map(s => s.textContent),
          head: (box?.innerText || '').replace(/\\s+/g, ' ').slice(0, 70)
        })
      })()`)
    )
    step(
      '选型阶段的两个字段各按三问铺开（2×3=6 个框）',
      q4.tas === 6 && q4.labels.join(',') === '问题 1,问题 2,问题 3,问题 1,问题 2,问题 3',
      `textarea=${q4.tas} labels=${q4.labels.join('/')} ｜ ${q4.head}`
    )
    await shoot('.tmp/ui-questions-split.png')

    const s4 = await passStage(
      [
        '第一问候选：贪心排产、混合整数规划',
        '第二问候选：熵权法定权重、TOPSIS 排序',
        '第三问候选：蒙特卡洛仿真',
        '第一问选 MIP，因为约束是硬工艺顺序',
        '第二问选熵权+TOPSIS，指标离散度够大不用请专家打分',
        '第三问选仿真，随机故障只能靠采样'
      ],
      '模型推导'
    )
    step('按问填完选型卡并提交后推进到阶段 5', s4.moved, s4.r)
    step(
      '教练那一轮的上下文含逐问进度、当前聚焦与「标签 · 问题 N」内容',
      /本阶段逐问进度：问题 1 2\/2，问题 2 2\/2，问题 3 2\/2/.test(s4.sys) &&
        /当前聚焦 问题 2「评价指标为总完工时间/.test(s4.sys) &&
        /【选择与理由 · 问题 2】\n第二问选熵权\+TOPSIS/.test(s4.sys),
      (s4.sys.match(/本阶段逐问进度[^\n]*/) || [''])[0].slice(0, 120)
    )

    const after = JSON.parse(
      await evaluate(`(async () => {
        await window.api.submitStage({ sessionId: ${sid}, stageId: 5, values: {
          'q2:objective': '第二问最小化总完工时间，权重由评价口径给出',
          'q2:constraints': '每台设备一次只做一道工序',
          objective: '拆分之前写的整格内容',
          bogus: '不该入库'
        } })
        const card = await window.api.stageCard(${sid}, 5)
        const o = card.fields.find(f => f.key === 'objective')
        return JSON.stringify({
          split: o.questions ? o.questions.map(q => q.idx + ':' + q.content.slice(0, 6)) : null,
          saved: (await window.api.listUsage(${sid})).pop().detail
        })
      })()`)
    )
    step(
      '可拆字段按问分开存，拆分前的整格内容归到第 1 问',
      Array.isArray(after.split) &&
        after.split.length === 3 &&
        after.split[1] === '2:第二问最小化' &&
        /拆分之前写的/.test(String(after.split[0])),
      JSON.stringify(after.split)
    )
    step('不在字段白名单里的 key 不会入库（含 bogus）', after.saved.includes('q2:objective') && !after.saved.includes('bogus'), after.saved.slice(0, 140))

    await send('Page.reload')
    await waitFor(`!!(window.api && (document.getElementById('root')?.childElementCount ?? 0) > 0) ? 1 : 0`, 20000)
    const reopenedRaw = await waitFor(
      `(async () => {
        const row = [...document.querySelectorAll('button')].find(b => b.innerText.includes('M6Q'))
        if (!row) return null
        row.click() || 'x'
        await new Promise(r => setTimeout(r, 1500))
        const box = ${CARD}
        const hot = [...(box?.querySelectorAll('button') || [])].find(b => /^问题 \\d$/.test(b.innerText.trim()) && b.className.includes('bg-sky-600'))
        return JSON.stringify({
          clicked: 'ROW',
          highlighted: hot ? hot.innerText.trim() : null,
          focus: (await window.api.questions(${sid})).focus,
          stage: (box?.innerText.match(/本阶段任务卡\\s*([^\\n]{0,12})/) || [])[1] || '',
          vals: [...(box?.querySelectorAll('textarea') || [])].map(t => t.value.slice(0, 8)).join('|')
        })
      })()`,
      30000
    )
    const reopened = JSON.parse(reopenedRaw ?? '{"clicked":"NO_ROW"}')
    step('页面重载后仍停在问题 2（焦点真在 DB 里，不是组件状态）', reopened.highlighted === '问题 2' && reopened.focus === 2, JSON.stringify(reopened).slice(0, 220))
    step(
      '重载后逐问的内容按问回到各自的框',
      String(reopened.vals ?? '').includes('第二问最小化') && String(reopened.vals ?? '').includes('拆分之前写的'),
      `stage=${reopened.stage ?? ''} vals=${reopened.vals ?? ''}`
    )
    await shoot('.tmp/ui-questions.png')

    const back = await evaluate(`(() => {
      const b = [...(${CARD}||document).querySelectorAll('button')].find(x => x.innerText.trim() === '整题')
      if (!b) return 'NO_WHOLE_BTN'
      b.click()
      return 'CLICKED'
    })()`)
    const cleared = await waitFor(`(async () => ((await window.api.questions(${sid})).focus === 0 ? 'ok' : null))()`)
    step('点「整题」把焦点退回全题模式', back === 'CLICKED' && cleared === 'ok', `${back} ${String(cleared)}`)

    await evaluate(`(async () => { await window.api.saveSettings(${before}); return 'RESTORED' })()`)
    settingsRestored = true
  } catch (e) {
    step('M6-2 端到端探针', false, (e instanceof Error ? e.message : String(e)).slice(0, 1200))
  } finally {
    if (!settingsRestored && before) {
      await evaluate(`(async () => { await window.api.saveSettings(${before}); return 1 })()`).catch(() => undefined)
    }
    await mock.stop()
    const bad = step.results.filter((r) => !r).length
    console.log(`\n${step.results.length - bad}/${step.results.length} 通过`)
    if (bad) process.exitCode = 1
  }
}

/**
 * M6-3 端到端：诊断选择题从教练卡片长出来、代笔腔选项被闸门丢掉、
 * 学生自己选完并写下理由后真的回到教练上下文，且升级提示后不再出题。
 */
if (process.argv[2] === 'quiz') {
  const { startMockLlm } = await import('./mock-llm.mjs')
  const mock = await startMockLlm()
  const step = (name, ok, detail = '') => {
    step.results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }
  step.results = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (js, timeout = 30000) => {
    for (let i = 0; i < timeout / 400; i++) {
      const v = await evaluate(js)
      if (v) return v
      await wait(400)
    }
    return null
  }
  const setTa = `(el, v) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
  /** 最新一张教练卡片里的选择题区块（说明行的 div 带这个 class，取它的父节点即整块） */
  const QBLK =
    `[...document.querySelectorAll('div')].filter(d => (d.className || '').includes('text-violet-200')).pop()?.parentElement`
  const OPTS = `[...(${QBLK}?.querySelectorAll('button') || [])].filter(b => /^[A-J]\\S/.test((b.innerText || '').trim()))`
  const QTEXT = `(${QBLK}?.innerText || '').replace(/\\s+/g, ' ')`
  const COUNT = `(document.body.innerText.match(/检查点/g) || []).length`
  const WHY = '因为指标附件里已经给全了，不想请专家拍权重'
  const shoot_quiz = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    if (s.result?.data) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(file, Buffer.from(s.result.data, 'base64'))
      console.log(`截图已保存 ${file}`)
    }
  }

  let settingsRestored = false
  let before = null
  try {
    await send('Page.reload')
    await waitFor(`!!(window.api && (document.getElementById('root')?.childElementCount ?? 0) > 0) ? 1 : 0`, 20000)
    before = await evaluate(`(async () => JSON.stringify(await window.api.getSettings()))()`)
    await evaluate(`(async () => {
      await window.api.saveSettings({ providerId: 'custom', baseUrl: ${JSON.stringify(mock.baseUrl)}, model: 'mock-coach', temperature: 0.2 })
      await window.api.setApiKey('custom', 'mock-key-m6q')
      return 'SET'
    })()`)
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) || 'x'`)
    await wait(400)
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '新会话')?.click() || 'x'`)
    await wait(400)

    const callAt1 = mock.calls.length
    const sent = await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').includes('描述你的题目'))
      if (!ta) return 'NO_CHAT_INPUT'
      const set = ${setTa}
      set(ta, '2025 年 C 题 M6QUIZ：装配线排产与评价，共三问，附件三个数据文件。')
      ;[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '发送')?.click()
      return 'SENT'
    })()`)
    step('首轮已发出（建会话）', sent === 'SENT', String(sent))
    const card1 = await waitFor(`${COUNT} > 0 ? 'ok' : null`, 60000)
    step('教练卡片回来了', card1 === 'ok')
    const call1 = mock.calls.slice(callAt1).find((c) => c.role === 'coach') ?? { sys: '', joined: '' }
    step(
      '阶段 1 且提示在 L0：这一轮教练被允许出选择题',
      /选择题闸门=开/.test(call1.sys),
      (call1.sys.match(/选择题闸门=[^。\n]{0,20}/) || [''])[0].slice(0, 60)
    )
    const hasQuiz = await waitFor(`${QBLK} ? 'ok' : null`, 15000)
    const q1 = JSON.parse(
      await evaluate(`JSON.stringify({ text: ${QTEXT}, opts: ${OPTS}.map(b => (b.innerText || '').replace(/\\s+/g, ' ').trim()) })`)
    )
    step(
      '选择题区块渲染：说明文案 + 两道题的 ask 与选项',
      hasQuiz === 'ok' &&
        q1.text.includes('先挑路子，不给对错') &&
        q1.text.includes('这一问你打算先走哪条路？') &&
        q1.text.includes('缺失值这一轮怎么处置？'),
      q1.text.slice(0, 80)
    )
    step(
      '带论文套语的 C 选项在主进程就被丢掉，界面上根本不会出现',
      q1.opts.length === 4 && q1.opts.every((t) => !t.includes('综上所述')) && !q1.text.includes('综上所述'),
      q1.opts.join(' / ').slice(0, 160)
    )
    step(
      '选项只有「这条路是什么」与「意味着什么」，没有任何判分措辞',
      !['正确', '错误', '最优', '得分高'].some((w) => q1.text.includes(w)) &&
        q1.opts.some((t) => /^B先建约束规划/.test(t)),
      q1.opts.join(' / ').slice(0, 120)
    )
    const disabled0 = await evaluate(
      `(() => { const b = [...(${QBLK}?.querySelectorAll('button') || [])].find(x => x.innerText.includes('把选择发给教练')); return b ? (b.disabled === true) : 'NO_BTN' })()`
    )
    step('两题都还没选时不能提交', disabled0 === true, String(disabled0))

    const picked = await evaluate(`(() => { const o = ${OPTS}; if (o.length < 4) return 'TOO_FEW:' + o.length; o[0].click(); o[2].click(); return 'CLICKED:' + o.length })()`)
    const revealed = await waitFor(
      `(() => { const t = ${QTEXT}; const b = [...(${QBLK}?.querySelectorAll('button') || [])].find(x => x.innerText.includes('把选择发给教练')); return (t.includes('A 意味着：权重要由数据本身的离散程度定') && t.includes('A 意味着：保住样本量') && b && !b.disabled) ? 'ok' : null })()`,
      15000
    )
    step('选中后就地展开「A 意味着：…」，两题都选了才放开提交按钮', revealed === 'ok', `${picked} revealed=${String(revealed)}`)
    await shoot_quiz('.tmp/ui-quiz-picked.png')

    const filledWhy = await evaluate(`(() => {
      const ta = [...(${QBLK}?.querySelectorAll('textarea') || [])].find(t => (t.placeholder || '').includes('为什么走这条'))
      if (!ta) return 'NO_WHY_TA'
      const set = ${setTa}
      set(ta, ${JSON.stringify(WHY)})
      return 'WHY_SET'
    })()`)
    const callAt2 = mock.calls.length
    const n2 = await evaluate(COUNT)
    const deliveredBtn = await evaluate(`(() => {
      const b = [...(${QBLK}?.querySelectorAll('button') || [])].find(x => x.innerText.includes('把选择发给教练'))
      if (!b || b.disabled) return 'NO_SUBMIT'
      b.click()
      return 'SUBMITTED'
    })()`)
    const inThread = await waitFor(
      `document.body.innerText.includes(${JSON.stringify(WHY)}) && document.body.innerText.includes('我选 A 先按附件字段做加权评分') ? 'ok' : null`,
      20000
    )
    step(
      '点「把选择发给教练」：选项与理由合成一条学生消息进对话流',
      filledWhy === 'WHY_SET' && deliveredBtn === 'SUBMITTED' && inThread === 'ok',
      `${filledWhy}/${deliveredBtn}/${String(inThread)}`
    )
    const card2 = await waitFor(`${COUNT} > ${n2} ? 'ok' : null`, 90000)
    step('教练按学生选的路继续问（新一轮卡片回来了）', card2 === 'ok', String(card2))
    const call2 = mock.calls.slice(callAt2).find((c) => c.role === 'coach') ?? { joined: '' }
    step(
      '上一轮的选择题以学生能读懂的形态回到教练上下文',
      /选择题：这一问你打算先走哪条路？（A\. 先按附件字段做加权评分；B\. 先建约束规划再比方案）/.test(call2.joined) &&
        call2.joined.includes(WHY),
      (call2.joined.match(/选择题：[^\u0002]{0,60}/) || [''])[0]
    )

    const sid = await evaluate(
      `(async () => { const ss = await window.api.listSessions(); return String(Math.max(...ss.map(s => s.id))) })()`
    )
    const usage = JSON.parse(
      await evaluate(`(async () => {
        const rows = (await window.api.listUsage(${sid})).filter(r => r.action === 'quiz_answered')
        const last = rows[rows.length - 1] || { detail: '', stageId: null }
        return JSON.stringify({ n: rows.length, detail: last.detail, stageId: last.stageId })
      })()`)
    )
    step(
      '选择与理由按 quiz_answered 留痕（供《AI 工具使用详情》引用）',
      usage.n === 1 &&
        /选 A「先按附件字段做加权评分」/.test(usage.detail) &&
        /含义：权重要由数据本身的离散程度定/.test(usage.detail) &&
        usage.detail.includes(WHY) &&
        usage.stageId === 1,
      `n=${usage.n} stage=${usage.stageId} ｜ ${String(usage.detail).slice(0, 150)}`
    )

    // —— M6-4：选择题旁的「这是什么？」分级讲解 ——
    const EBLK = `[...document.querySelectorAll('div')].filter(d => (d.className || '').includes('text-emerald-200')).pop()?.parentElement`
    const ETEXT = `(${EBLK}?.innerText || '').replace(/\\s+/g, ' ')`
    const clickChip = await evaluate(`(() => {
      const b = [...(${QBLK}?.querySelectorAll('button') || [])].find(x => (x.innerText || '').trim() === '权重')
      if (!b) return 'NO_CHIP'
      b.click()
      return 'CHIP_CLICKED'
    })()`)
    const level1 = await waitFor(
      `(() => { const t = ${ETEXT}; return t.includes('名词 · 权重（评价）') && t.includes('讲到第 1 / 4 层') &&
        t.includes(${JSON.stringify('权重是「这项指标在综合结果里说话的分量」')}) && !t.includes('比方：') ? 'ok' : null })()`,
      15000
    )
    step(
      '点「这是什么？→ 权重」：第一层只给一句话直觉，不铺开后面的',
      clickChip === 'CHIP_CLICKED' && level1 === 'ok',
      `${clickChip}/${String(level1)}`
    )
    const clickDeeper = async (label) =>
      evaluate(`(() => {
        const b = [...(${EBLK}?.querySelectorAll('button') || [])].find(x => (x.innerText || '').trim() === ${JSON.stringify(label)})
        if (!b) return 'NO_BTN'
        b.click()
        return 'CLICKED'
      })()`)
    const d1 = await clickDeeper('再讲一层')
    const withAnalogy = await waitFor(
      `(${ETEXT}).includes(${JSON.stringify('期末成绩里平时分占 30%')}) ? 'ok' : null`,
      15000
    )
    const d2 = await clickDeeper('再讲一层')
    const withMini = await waitFor(
      `(${ETEXT}).includes(${JSON.stringify('两项指标权重 0.7 与 0.3')}) ? 'ok' : null`,
      15000
    )
    const d3 = await clickDeeper('再讲一层')
    const withFormula = await waitFor(
      `(() => { const t = ${ETEXT}; return t.includes('讲到第 4 / 4 层') && t.includes('Σ_j w_j') &&
        t.includes(${JSON.stringify('字母照你自己的题目改一遍再进符号表')}) ? t : null })()`,
      15000
    )
    step(
      '「再讲一层」依次给出比方 → 小例子 → 公式骨架与符号表',
      d1 === 'CLICKED' && withAnalogy === 'ok' && d2 === 'CLICKED' && withMini === 'ok' && d3 === 'CLICKED' && !!withFormula,
      `${d1}/${String(withAnalogy)}/${d2}/${String(withMini)}/${d3}`
    )
    const formulaText = String(withFormula || '')
    const clean =
      formulaText.includes('正确答案') || /应该选[A-J]/.test(formulaText) || formulaText.includes('本题用')
    step('讲解只讲概念，不含「该选哪个/本题答案」这类替学生做主的话', clean === false, formulaText.slice(0, 140))
    await shoot_quiz('.tmp/ui-explain-l4.png')
    const back = await clickDeeper('只留一句话')
    const collapsed = await waitFor(
      `(() => { const t = ${ETEXT}; return t.includes('讲到第 1 / 4 层') && !t.includes('比方：') ? 'ok' : null })()`,
      15000
    )
    step('「只留一句话」能收回去，学生自己决定讲多深', back === 'CLICKED' && collapsed === 'ok', `${back}/${String(collapsed)}`)
    const exUsage = JSON.parse(
      await evaluate(`(async () => {
        const rows = (await window.api.listUsage(${sid})).filter(r => r.action === 'explain_shown')
        const last = rows[rows.length - 1] || { detail: '', stageId: null }
        return JSON.stringify({ n: rows.length, levels: rows.map(r => (r.detail.match(/讲到第 (\\d)/) || [])[1]).join(','), detail: last.detail, stageId: last.stageId })
      })()`)
    )
    step(
      '每展开一层都按 explain_shown 留痕（记到第 4 层，进《AI 工具使用详情》）',
      exUsage.n === 4 && exUsage.levels === '1,2,3,4' && /讲到第 4 层：权重（名词）/.test(exUsage.detail) && exUsage.stageId === 1,
      `n=${exUsage.n} levels=${exUsage.levels} stage=${exUsage.stageId} ｜ ${String(exUsage.detail).slice(0, 90)}`
    )

    const callAt3 = mock.calls.length
    const blocksBefore = await evaluate(`[...document.querySelectorAll('div')].filter(d => (d.className || '').includes('text-violet-200')).length`)

    const n3 = await evaluate(COUNT)
    const clickedHint = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim().startsWith('要提示'))
      if (!b) return 'NO_HINT_BTN'
      b.click()
      return 'HINT_CLICKED'
    })()`)
    const card3 = await waitFor(`${COUNT} > ${n3} ? 'ok' : null`, 90000)
    const call3 = mock.calls.slice(callAt3).find((c) => c.role === 'coach') ?? { sys: '' }
    step(
      '学生点了「要提示」之后：闸门关掉，教练只给提示不出选择题',
      clickedHint === 'HINT_CLICKED' &&
        card3 === 'ok' &&
        /选择题闸门=关/.test(call3.sys) &&
        !/选择题闸门=开/.test(call3.sys),
      (call3.sys.match(/选择题闸门=[^。\n]{0,20}/) || [''])[0].slice(0, 60)
    )
    const blocksAfter = await evaluate(`[...document.querySelectorAll('div')].filter(d => (d.className || '').includes('text-violet-200')).length`)
    step('新卡片里没有再长出选择题区块', blocksAfter === blocksBefore, `${blocksBefore} -> ${blocksAfter}`)
    await shoot_quiz('.tmp/ui-quiz.png')

    await evaluate(`(async () => { await window.api.saveSettings(${before}); return 'RESTORED' })()`)
    settingsRestored = true
  } catch (e) {
    step('M6-3 端到端探针', false, (e instanceof Error ? e.message : String(e)).slice(0, 1200))
  } finally {
    if (!settingsRestored && before) {
      await evaluate(`(async () => { await window.api.saveSettings(${before}); return 1 })()`).catch(() => undefined)
    }
    await mock.stop()
    const bad = step.results.filter((r) => !r).length
    console.log(`\n${step.results.length - bad}/${step.results.length} 通过`)
    if (bad) process.exitCode = 1
  }
}

/**
 * M6-5 端到端：把阶段一路推到 6「求解实现」，验绘图三问闸门 → 图表规范检查 → 报错导读整条链路。
 * 只依赖本机 Python 与本地假端点，不联网、不需要真实 API Key。运行：npm run smoke:ui:plot
 */
if (process.argv[2] === 'plot') {
  const { startMockLlm } = await import('./mock-llm.mjs')
  const mock = await startMockLlm()
  const step = (name, ok, detail = '') => {
    step.results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }
  step.results = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (js, timeout = 40000) => {
    for (let i = 0; i < timeout / 400; i++) {
      const v = await evaluate(js)
      if (v) return v
      await wait(400)
    }
    return null
  }
  const setTa = `(el, v) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
  const CARD = `[...document.querySelectorAll('section')].find(s => /^[▾▸]\\s*本阶段任务卡/.test(s.innerText))`
  // 论文面板的说明文字里也出现「Python 沙箱」，所以锚定面板自己的折叠按钮
  const PANEL = `[...document.querySelectorAll('section')].find(s => (s.querySelector(':scope > div > button')?.innerText || '').includes('沙箱'))`
  const EDIT = `[...(${PANEL}?.querySelectorAll('textarea[spellcheck="false"]') || [])].find(t => (t.className || '').includes('font-mono'))`
  // 聊天里的教练卡也用了同一组 violet/sky/amber 边框色，所以这三张卡一律只在沙箱面板内找
  const violet = (n) => `[...(${PANEL}?.querySelectorAll('div') || [])].filter(d => (d.className || '').includes('${n}'))`
  const ASK = `(${violet('border-violet-500/25')}).pop()`
  const SKY = `(${violet('border-sky-500/25')}).pop()`
  const AMBER = `(${violet('border-amber-500/25')}).pop()`
  const RUNS = `(document.body.innerText.match(/个产物/g) || []).length`
  const CODE_PLOT = [
    'import numpy as np, matplotlib.pyplot as plt',
    't = np.linspace(0, 9, 60)',
    "plt.figure(figsize=(5,2.5))",
    "plt.plot(t, np.exp(-0.35*t)*np.cos(1.6*t))",
    "plt.plot(t, np.exp(-0.35*t))",
    "plt.xlabel('时间 t (min)')",
    "plt.savefig('m65-plot.png', dpi=100)",
    "print('rows=', t.size)"
  ].join('\n')
  const CODE_FAIL = "total = rounds + 1\nprint('M65NAMEERROR', total)"

  /** 把任务卡填满并提交，等阶段标题变成 next */
  const submitCard = async (next) => {
    const ready = await waitFor(`(() => {
      if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
      const box = ${CARD}
      return box && [...box.querySelectorAll('button')].find(b => b.innerText.includes('提交给教练评审')) ? 'ready' : null
    })()`)
    if (!ready) return 'NOT_READY'
    await evaluate(`(() => {
      const set = ${setTa}
      ;(${CARD}).querySelectorAll('textarea').forEach((t, i) => set(t, 'M65 阶段填写 ' + i + '：输入来自附件，输出是给下一问用的量，口径已核对原文。'))
      ;[...(${CARD}).querySelectorAll('button')].find(b => b.innerText.includes('提交给教练评审'))?.click()
      return 'SUBMITTED'
    })()`)
    return waitFor(`(${CARD}?.innerText || '').includes(${JSON.stringify(next)}) ? 'ok' : null`, 60000)
  }

  let settingsRestored = false
  let before = null
  try {
    await send('Page.reload')
    await waitFor(`!!(window.api && (document.getElementById('root')?.childElementCount ?? 0) > 0) ? 1 : 0`, 20000)
    before = await evaluate(`(async () => JSON.stringify(await window.api.getSettings()))()`)
    await evaluate(`(async () => {
      await window.api.saveSettings({ providerId: 'custom', baseUrl: ${JSON.stringify(mock.baseUrl)}, model: 'mock-coach', temperature: 0.2 })
      await window.api.setApiKey('custom', 'mock-key-m65')
      return 'SET'
    })()`)
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) || 'x'`)
    await wait(400)
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '新会话')?.click() || 'x'`)
    await wait(400)
    await evaluate(`(() => {
      const ta = [...document.querySelectorAll('textarea')].find(t => (t.placeholder || '').includes('描述你的题目'))
      const set = ${setTa}
      set(ta, '2025 年 C 题 M6PLOT：装配线排产与评价，共三问，附件三个数据文件。')
      ;[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '发送')?.click()
      return 'SENT'
    })()`)
    await waitFor(`(${CARD}?.innerText || '').includes('读题与问题拆解') ? 'ok' : null`)

    const walk = []
    for (const [i, next] of ['数据探索与预处理', '假设与符号表', '模型选型', '模型推导', '求解实现'].entries()) {
      walk.push(`${i + 1}:${await submitCard(next)}`)
    }
    step('任务卡逐阶段提交，一直推进到第 6 阶段求解实现', walk.every((w) => w.endsWith(':ok')), walk.join(' '))

    const skeleton = await evaluate(`(${EDIT}?.value || '')`)
    step(
      '代码编辑器给的是三行注释骨架，不是可运行示例',
      skeleton.includes('# 这张图要回答哪个小问的哪句话') && !skeleton.includes('plt.') && !skeleton.includes('import'),
      skeleton.slice(0, 40).replace(/\\n/g, '⏎')
    )

    const asked = JSON.parse(
      await evaluate(`JSON.stringify({
        present: !!(${ASK}),
        text: (${ASK}?.innerText || '').replace(/\\s+/g, ' '),
        disabled: [...(${ASK}?.querySelectorAll('button') || [])].some(b => b.innerText.includes('记下这三答') && b.disabled),
        runs: ${RUNS}
      })`)
    )
    step(
      '一进第 6 阶段就弹出绘图三问，三问原样都在',
      asked.present === true &&
        asked.text.includes('这张图回答哪个小问的哪句话') &&
        asked.text.includes('横轴和纵轴各是什么量') &&
        asked.text.includes('读者只看这张图'),
      asked.text.slice(0, 90)
    )
    step('没答够字数时「记下这三答」点不动', asked.disabled === true)

    const RUN = `[...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith('运行'))`
    await evaluate(`(${RUN})?.click() || 'x'`)
    await wait(600)
    const blocked = JSON.parse(
      await evaluate(
        `JSON.stringify({ runs: ${RUNS}, text: (${PANEL}?.innerText || '').replace(/\\s+/g, ' '), askStillThere: !!(${ASK}) })`
      )
    )
    step(
      '三问没答完点运行：不进沙箱，只说清楚为什么拦',
      blocked.runs === 0 && blocked.text.includes('先答完上面这三问再运行'),
      `runs=${String(blocked.runs)} text=${blocked.text.slice(blocked.text.indexOf('先答完'), blocked.text.indexOf('先答完') + 40)}`
    )

    /**
     * 上一轮真收尾的判据：教练卡已定稿且「停止」消失、按钮可点。
     * 只看按钮上的等级会踩到 broadcastStages 与 start 之间的空档，那会并发两轮。
     */
    const hintReady = (minCards, level) =>
      waitFor(`(() => {
        if ([...document.querySelectorAll('button')].some(b => b.innerText.trim() === '停止')) return null
        const n = (document.body.innerText.match(/rubric 反馈/g) || []).length
        const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('要提示'))
        return n >= ${minCards} && b && !b.disabled && b.innerText.includes('L${level}') ? 'ok' : null
      })()`)
    const clickHint = () =>
      evaluate(`(() => {
        const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('要提示'))
        if (!b || b.disabled) return 'NO_BTN'
        b.click()
        return 'CLICKED'
      })()`)
    const execCount = () => mock.calls.filter((c) => c.role === 'executor').length

    const execBefore = execCount()
    const cards0 = await evaluate(`(document.body.innerText.match(/rubric 反馈/g) || []).length`)
    const c1 = await clickHint()
    const s1 = await hintReady(cards0 + 1, 1)
    const c2 = await clickHint()
    const blockedHint = await waitFor(`document.body.innerText.includes('这次没有向 AI 要骨架') ? 'ok' : null`, 60000)
    step(
      '三问没答完时升到 L2 也不去向 Executor 要骨架，只说清为什么不给',
      c1 === 'CLICKED' && s1 === 'ok' && c2 === 'CLICKED' && blockedHint === 'ok' && execCount() === execBefore,
      `c1=${c1} s1=${String(s1)} c2=${c2} blocked=${String(blockedHint)} exec+${String(execCount() - execBefore)}`
    )

    await evaluate(`(() => {
      const set = ${setTa}
      const boxes = [...(${ASK}).querySelectorAll('textarea')]
      set(boxes[0], '问题 1 的结论：残存浓度随时间单调下降，前半段降得更快')
      set(boxes[1], '横轴时间 t (min)，纵轴残存浓度 c (mg/L)')
      set(boxes[2], '读者该说出：约 8 分钟后浓度基本不再下降')
      return boxes.length
    })()`)
    const saved = await waitFor(
      `[...document.querySelectorAll('button')].some(b => b.innerText.includes('记下这三答') && !b.disabled) ? 'ok' : null`
    )
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('记下这三答') && !b.disabled)?.click() || 'x'`)
    const collapsed = await waitFor(
      `!(${ASK}) && (${EDIT}) ? 'ok' : null`
    )
    const intentUsage = JSON.parse(
      await evaluate(`(async () => {
        const ss = await window.api.listSessions()
        const sid = Math.max(...ss.map(s => s.id))
        const rows = await window.api.listUsage(sid)
        const r = rows.filter(x => x.action === 'plot_intent').pop()
        return JSON.stringify({ n: rows.filter(x => x.action === 'plot_intent').length, detail: r?.detail ?? '', stageId: r?.stageId ?? 0 })
      })()`)
    )
    step('三问答完表单收起，并记下一条绘图三答', saved === 'ok' && collapsed === 'ok' && intentUsage.n === 1, `saved=${String(saved)} collapsed=${String(collapsed)} n=${intentUsage.n}`)
    step(
      '留痕写的是学生自己那三句话，且落在第 6 阶段',
      intentUsage.detail.includes('残存浓度随时间单调下降') && intentUsage.detail.includes('mg/L') && intentUsage.stageId === 6,
      intentUsage.detail.slice(0, 120)
    )

    await hintReady(0, 2)
    await clickHint()
    const scaffold = await waitFor(`document.body.innerText.includes('采纳到我的文件') ? 'ok' : null`, 60000)
    const execCall = [...mock.calls].reverse().find((c) => c.role === 'executor') ?? { user: '' }
    step(
      '答完之后 L3 才让 Executor 出骨架，且 brief 里带着学生自己写的轴名与单位',
      scaffold === 'ok' && execCount() === execBefore + 1 && execCall.user.includes('横轴时间 t (min)') && execCall.user.includes('mg/L'),
      execCall.user.slice(execCall.user.indexOf('绘图三答'), execCall.user.indexOf('绘图三答') + 90)
    )

    await evaluate(`(() => {
      const set = ${setTa}
      set(${EDIT}, ${JSON.stringify(CODE_PLOT)})
      ;(${RUN})?.click()
      return 'RUN1'
    })()`)
    const checked = await waitFor(`${SKY} ? 'ok' : null`, 90000)
    const hintText = String(
      await evaluate(`(${SKY}?.innerText || '').replace(/\\s+/g, ' ')`)
    )
    step(
      '出图后本地挑出客观缺项：纵轴没名称、两条曲线没图例、dpi 偏低',
      checked === 'ok' &&
        hintText.includes('纵轴没有名称') &&
        hintText.includes('没有图例') &&
        hintText.includes('dpi=100'),
      `sky=${String(checked)} ${hintText.slice(0, 160)}`
    )
    step('规范检查说明它不改代码', hintText.includes('怎么改由你判断'))

    const runs1 = JSON.parse(await evaluate(`JSON.stringify({ runs: ${RUNS}, sky: ${SKY} ? 1 : 0 })`))
    await evaluate(`(() => {
      const set = ${setTa}
      set(${EDIT}, ${JSON.stringify(CODE_FAIL)})
      ;(${RUN})?.click()
      return 'RUN2'
    })()`)
    const guide1 = await waitFor(`${AMBER} ? 'ok' : null`, 90000)
    const after1 = JSON.parse(
      await evaluate(`JSON.stringify({
        runs: ${RUNS},
        text: (${AMBER}?.innerText || '').replace(/\\s+/g, ' '),
        asks: [...document.querySelectorAll('button')].some(b => b.innerText.includes('把这条报错发给教练'))
      })`)
    )
    step(
      '第一次报错只给两条排查方向，不急着把学生推给模型',
      guide1 === 'ok' && after1.runs === runs1.runs + 1 && after1.asks === false,
      `guide=${String(guide1)} runs=${String(runs1.runs)}→${String(after1.runs)} ${after1.text.slice(0, 120)}`
    )

    await evaluate(`(${RUN})?.click() || 'x'`)
    const escalated = await waitFor(
      `[...document.querySelectorAll('button')].some(b => b.innerText.includes('把这条报错发给教练')) ? 'ok' : null`,
      90000
    )
    const errUsage = JSON.parse(
      await evaluate(`(async () => {
        const ss = await window.api.listSessions()
        const sid = Math.max(...ss.map(s => s.id))
        const rows = await window.api.listUsage(sid)
        const hints = rows.filter(x => x.action === 'error_hint')
        return JSON.stringify({
          n: hints.length,
          detail: hints.pop()?.detail ?? '',
          plot: rows.some(x => x.action === 'plot_hint'),
          code: (${EDIT}?.value || '')
        })
      })()`)
    )
    step('同类报错第二次才升级成「发给教练」', escalated === 'ok')
    step(
      '升级时留一条 error_hint：写明第几次、报的什么、给过哪几条排查',
      errUsage.n === 1 && /第 2 次/.test(errUsage.detail) && errUsage.detail.includes('NameError'),
      errUsage.detail.slice(0, 150)
    )
    step('图表规范检查也留了痕', errUsage.plot === true)
    step('本地导读一个字都没动学生的代码', errUsage.code === CODE_FAIL, errUsage.code.slice(0, 40))

    const callAt = mock.calls.length
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('把这条报错发给教练'))?.click() || 'x'`)
    const sentBack = await waitFor(
      `[...document.querySelectorAll('div')].some(d => (d.innerText || '').includes('第 2 次报 NameError') && (d.innerText || '').includes('别替我改代码')) ? 'ok' : null`,
      60000
    )
    await waitFor(`(${RUNS}) >= 0 ? 'ok' : null`, 1000)
    const askCall = mock.calls.slice(callAt).find((c) => c.role === 'coach') ?? { user: '', joined: '' }
    step(
      '这条报错以学生自己的口吻进了对话，教练收到的是他署名的那段',
      sentBack === 'ok' && askCall.user.includes('NameError') && askCall.user.includes('请你只针对我这条提问'),
      askCall.user.slice(0, 120)
    )

    const coachSysHasIntent = mock.calls.some((c) => c.role === 'coach' && c.sys.includes('学生的绘图三答'))
    step('教练上下文里能看到学生的绘图三答（据此追问，而不是替他画）', coachSysHasIntent)

    const s = await send('Page.captureScreenshot', { format: 'png' })
    if (s.result?.data) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync('.tmp/ui-plot.png', Buffer.from(s.result.data, 'base64'))
      console.log('截图已保存 .tmp/ui-plot.png')
    }
    await evaluate(`(async () => { await window.api.saveSettings(${before}); return 'RESTORED' })()`)
    settingsRestored = true
  } catch (e) {
    step('M6-5 端到端探针', false, (e instanceof Error ? e.message : String(e)).slice(0, 1200))
  } finally {
    if (!settingsRestored && before) {
      await evaluate(`(async () => { await window.api.saveSettings(${before}); return 1 })()`).catch(() => undefined)
    }
    await mock.stop()
    const bad = step.results.filter((r) => !r).length
    console.log(`\n${step.results.length - bad}/${step.results.length} 通过`)
    if (bad) process.exitCode = 1
  }
}

ws.close()
process.exit(process.exitCode ?? 0)
