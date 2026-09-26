import type { ArtifactInfo, PlotMeta, SandboxError } from './sandbox'

/* ------------------------------------------------------------------ *
 * 绘图与运行这一段的引导语料：全在本地，不经 AI。
 * 三问与检查项只陈述客观事实（轴上有没有名称、dpi 多少、报的哪类错），
 * 判断与改代码的动作留在学生手里。
 * ------------------------------------------------------------------ */

/** 打开 Python 面板时给的不是可运行示例，是三行要学生自己接着往下写的空位 */
export const CODE_SKELETON = `# 这张图要回答哪个小问的哪句话：
# 横轴 / 纵轴：量名 + 单位，例如 时间 t (min)
# 读者看完这张图该说出哪句话：
`

/** 求解实现与结果分析这两步最容易「先画了再说」，所以只有这两段设闸门 */
export const PLOT_STAGES = [6, 8]

/** 除了注释和空行什么都没写，就还是骨架 */
export function isSkeleton(code: string): boolean {
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return true
  if (lines.length > 6) return false
  return lines.every((l) => l.startsWith('#'))
}

export interface PlotQuestion {
  key: 'question' | 'axes' | 'takeaway'
  ask: string
  hint: string
}

export const PLOT_QUESTIONS: PlotQuestion[] = [
  {
    key: 'question',
    ask: '这张图回答哪个小问的哪句话？',
    hint: '写成「问题 2 的结论：X 随 Y 怎么变」这种。写「画个折线图」不算回答。'
  },
  {
    key: 'axes',
    ask: '横轴和纵轴各是什么量，单位写在哪？',
    hint: '量名与单位一起写清，例如 时间 t (min) / 残存浓度 c (mg/L)。'
  },
  {
    key: 'takeaway',
    ask: '读者只看这张图，该说出哪一句话？',
    hint: '这句话要能直接接在图注后面。说不出来，说明这张图还没想清楚要说什么。'
  }
]

export type PlotAnswers = Partial<Record<PlotQuestion['key'], string>>

/** 每问至少写这么点字才算真答了，避免一个字糊过去 */
export const PLOT_ANSWER_MIN = 8

/** 三问里还没答够字数的，返回问题原文；渲染层的表单与主进程的闸门都用它 */
export function unanswered(answers: PlotAnswers | null): string[] {
  return PLOT_QUESTIONS.filter((q) => (answers?.[q.key] ?? '').trim().length < PLOT_ANSWER_MIN).map((q) => q.ask)
}

export function plotGate(answers: PlotAnswers | null, code: string, stageId: number): string[] {
  if (!PLOT_STAGES.includes(stageId) || !isSkeleton(code)) return []
  return unanswered(answers)
}

export function plotDigest(answers: PlotAnswers): string {
  return PLOT_QUESTIONS.map((q) => `${q.ask} ${(answers[q.key] ?? '').trim() || '（没填）'}`).join('\n')
}

/* ----------------------------- 图表规范 ----------------------------- */

export interface PlotHint {
  name: string
  text: string
}

/**
 * 名称里有括号、斜杠、单位符号或末尾是拉丁字母，就当作带单位。
 * 只是启发式，所以话头停在「没看到单位」，不判对错。
 */
const UNIT_MARK = /[()（）/·%℃°±]|[a-zA-Z]{1,5}$/

/** 一张图最多报几条：报满屏学生就不会看了，剩下的自己对着图找 */
const MAX_HINTS_PER_PLOT = 4

function axisHints(meta: PlotMeta): string[] {
  const out: string[] = []
  // dpi 排在最前：四条上限截掉的是逐轴清单，而这条整张图共用一句
  if (meta.dpi > 0 && meta.dpi < 300)
    out.push(`存图 dpi=${String(meta.dpi)}，进论文排版会被压糊，savefig 用 dpi=300 以上`)
  for (const ax of meta.axes) {
    if (ax.curves === 0 && !ax.title) continue
    if (!ax.xlabel) out.push('横轴没有名称')
    else if (!UNIT_MARK.test(ax.xlabel)) out.push(`横轴名称「${ax.xlabel}」里没看到单位`)
    if (!ax.ylabel) out.push('纵轴没有名称')
    else if (!UNIT_MARK.test(ax.ylabel)) out.push(`纵轴名称「${ax.ylabel}」里没看到单位`)
    if (ax.curves >= 2 && !ax.legend) out.push(`${String(ax.curves)} 条曲线但没有图例，读者分不出哪条是哪条`)
    if (!ax.title) out.push('图上没有标题（正文里有图题也行，但单独导出时要能认出是哪张）')
  }
  return out
}

/** 只报客观缺项，不改学生代码、不替他决定图该怎么画 */
export function plotHints(artifacts: ArtifactInfo[]): PlotHint[] {
  const out: PlotHint[] = []
  for (const a of artifacts) {
    if (a.ext !== '.png' && a.ext !== '.jpg') continue
    const m = a.plotMeta
    if (!m) {
      out.push({ name: a.name, text: '这张图不是 matplotlib 存的，读不到轴名与 dpi，规范只能自己对着看' })
      continue
    }
    if (!m.axes.length) {
      out.push({ name: a.name, text: '这张图里没识别到坐标系，确认一下是不是存了空图' })
      continue
    }
    for (const text of [...new Set(axisHints(m))].slice(0, MAX_HINTS_PER_PLOT)) out.push({ name: a.name, text })
  }
  return out
}

/* ----------------------------- 报错导读 ----------------------------- */

export interface ErrorGuide {
  type: string
  line: string
  checks: string[]
}

const GUIDES: Record<string, ErrorGuide> = {
  NameError: {
    type: 'NameError',
    line: '有个名字还没被赋值就被用了。',
    checks: [
      '看回溯最后一行点的是哪个名字',
      '它是拼错了，还是产生它的那一步根本没跑到',
      '来自附件的列名，先 print(df.columns.tolist()) 再引用'
    ]
  },
  AttributeError: {
    type: 'AttributeError',
    line: '这个对象上没有那个方法或属性。',
    checks: [
      '先 print(type(x)) 看你手上到底是 Series 还是 DataFrame',
      '上一行是不是返回了 None（就地修改的函数常这样）',
      '方法名照文档核对一遍大小写与下划线'
    ]
  },
  FileNotFoundError: {
    type: 'FileNotFoundError',
    line: '按这个路径没找到文件。',
    checks: [
      '先 print(os.listdir(".")) 看沙箱工作区里到底有什么',
      '文件名与扩展名和「赛题与附件」清单逐项对齐，包括大小写',
      '附件在子目录里就要把子目录写进路径，别用绝对路径'
    ]
  },
  KeyError: {
    type: 'KeyError',
    line: '表里没有这个列名或键。',
    checks: ['print(df.columns.tolist()) 看真实列名（常带空格或单位后缀）', '分组聚合后列名会变，先 print(df.head()) 看结构'],
  },
  IndexError: {
    type: 'IndexError',
    line: '下标越界了。',
    checks: ['先 print(len(x)) 对齐长度与循环范围', '从 0 还是从 1 开始数，跟数学下标区分开'],
  },
  ValueError: {
    type: 'ValueError',
    line: '形状或取值对不上。',
    checks: [
      '把参与运算的每个数组都 print(... .shape)，逐个对齐',
      '解包个数与右边返回的个数是否一致',
      '优化/拟合的初值与边界是否落在约束域内'
    ]
  },
  TypeError: {
    type: 'TypeError',
    line: '传进去的类型不对。',
    checks: ['读表后数字常常还是字符串，先 print(df.dtypes)', '函数的参数名与顺序照文档再看一遍'],
  },
  ZeroDivisionError: {
    type: 'ZeroDivisionError',
    line: '除以零了。',
    checks: ['多半是某个指标一列全同值，归一化时极差为 0', '先 print 分母那一列的 max-min 确认'],
  },
  SyntaxError: {
    type: 'SyntaxError',
    line: '这一行 Python 自己就没读懂，跟模型对不对无关。',
    checks: ['看回溯给的行号，检查括号与引号是否成对', '同一行里别混用中文逗号与英文逗号', '缩进要么全空格要么全 Tab，别混'],
  },
  IndentationError: {
    type: 'IndentationError',
    line: '缩进不合法，Python 靠缩进分层。',
    checks: ['看回溯给的行号上下各一行，缩进格数是否一致', '从别处粘过来的代码常带 Tab'],
  },
  ImportError: {
    type: 'ImportError',
    line: '这个包没装上或者名字写错了。',
    checks: ['沙箱里没有网络，装不了新包，先确认包名拼写', '这个包不在你选的思路上吗？在就换一条不依赖它的写法'],
  },
  ModuleNotFoundError: {
    type: 'ModuleNotFoundError',
    line: '这个包没装上或者名字写错了。',
    checks: ['沙箱里没有网络，装不了新包，先确认包名拼写', '换一条不依赖这个包的思路，或把方法换掉'],
  },
  MemoryError: {
    type: 'MemoryError',
    line: '内存不够用了。',
    checks: ['先 print(df.shape) 看数据规模，能不能只读需要的列', '别一次复制多份大数组，能就地处理就就地'],
  },
  Crashed: {
    type: 'Crashed',
    line: '进程被系统收掉了，通常是内存超限。',
    checks: ['先在小样本上跑通，再看全量', '图一次别存太多张、dpi 别开到 600 以上'],
  },
  Timeout: {
    type: 'Timeout',
    line: '超过 60 秒没跑完，被强制终止。',
    checks: ['先 print 循环计数，看是数据量还是死循环', '把规模砍到十分之一跑一遍，估算量级再放大', '随机算法没设种子也可能一直不收敛'],
  }
}

/** 同类报错连着到第二次才升级：第一次只看清单，第二次才摊开来问 */
export const ERROR_ESCALATE_STREAK = 2

export function errorGuide(err: SandboxError | null, streak: number): ErrorGuide | null {
  if (!err) return null
  const g = GUIDES[err.type]
  if (!g) return null
  return { type: g.type, line: g.line, checks: g.checks.slice(0, streak >= ERROR_ESCALATE_STREAK ? 3 : 2) }
}

/** listRuns 是升序的，从最后一次往前数同类报错 */
export function sameErrorStreak(runs: { error: SandboxError | null }[], type: string): number {
  let n = 0
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i]?.error?.type !== type) break
    n++
  }
  return n
}

/** 把报错变成一条学生自己署名的消息，交给教练去问 */
export function errorAsksText(err: SandboxError, g: ErrorGuide, streak: number): string {
  return [
    `我在 Python 沙箱里第 ${String(streak)} 次报 ${g.type}：${err.message.slice(0, 200)}`,
    `本地排查清单我看了这几条：${g.checks.join('；')}`,
    '请你只针对我这条提问，别替我改代码。'
  ].join('\n')
}
