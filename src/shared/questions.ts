/**
 * 逐问轴的纯逻辑。
 *
 * 问题清单不另建表：它本来就是阶段 1「逐问拆解」那一格里学生自己写的东西，
 * 应用只是把它按行切开、认编号。所以清单跟着任务卡的版本走，学生改了拆解，问题条同步变。
 * 逐问填写的内容用 `q<N>:<fieldKey>` 作 key 存在同一张 stage_outputs 里，不动 stage_state 主键。
 */

export interface QuestionView {
  idx: number
  label: string
  /** 学生自己复述的那一句，用来在问题条上做提示 */
  brief: string
}

/** 渲染层一次拿全：有哪些问 + 现在盯着哪一问（0 = 不区分） */
export interface QuestionFocus {
  questions: QuestionView[]
  focus: number
}

const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

/** 国赛题最多四问，给到 12 已经够；上限同时挡住误识别出来的假问题 */
export const MAX_QUESTION_IDX = 12

/** 「问题 1：」「1.」「(二)」「Q3、」「第四问 」… 都算编号；分隔符后面紧跟数字的是小数，不是编号 */
const LEADING_IDX =
  /^\s*[\(（]?\s*(?:第\s*([0-9]{1,2}|[一二三四五六七八九十])\s*[问小]|[Qq]\s*([0-9]{1,2})|问题\s*([0-9]{1,2})|[（(]?\s*([0-9]{1,2}))\s*[\)）\.．、:：\s](?!\d)\s*(.*)$/

function toIdx(digits: string): number {
  return CN_DIGITS[digits] ?? Number.parseInt(digits, 10)
}

export function parseQuestionLine(line: string): { idx: number | null; text: string } {
  const m = LEADING_IDX.exec(line)
  if (!m) return { idx: null, text: line.trim() }
  const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
  const n = toIdx(raw)
  return { idx: n > 0 && n <= MAX_QUESTION_IDX ? n : null, text: (m[5] ?? '').trim() || line.trim() }
}

/** 短到看不出在说什么的行（漏了标点连写）不当一个问题；至少要有 6 个字 */
const MIN_BRIEF = 6

export function parseQuestionsFromStream(text: string): QuestionView[] {
  const re =
    /(?:^|[\n\r\s。；，、（(（])(?:(?:第\s*([0-9]{1,2}|[一二三四五六七八九十])\s*[问小])|(?:问题\s*([0-9]{1,2}|[一二三四五六七八九十]))|(?:Q\s*([0-9]{1,2})))\s*[:：、\.\s](?!\d)/gi

  let m: RegExpExecArray | null
  const found: { idx: number; pos: number; matchLen: number }[] = []
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3] ?? ''
    const num = toIdx(raw)
    if (num >= 1 && num <= MAX_QUESTION_IDX) {
      found.push({ idx: num, pos: m.index, matchLen: m[0].length })
    }
  }

  // 顺次捕获递增的小问序号：1, 2, 3...
  const seq: { idx: number; pos: number; matchLen: number }[] = []
  let expected = 1
  for (const item of found) {
    if (item.idx === expected) {
      seq.push(item)
      expected++
    }
  }

  if (seq.length < 2) return []

  const out: QuestionView[] = []
  for (let i = 0; i < seq.length; i++) {
    const cur = seq[i]!
    const nextPos = i < seq.length - 1 ? seq[i + 1]!.pos : Math.min(text.length, cur.pos + 1200)
    const start = cur.pos + cur.matchLen
    const rawChunk = text.slice(start, nextPos).replace(/\s+/g, ' ').trim()
    out.push({
      idx: cur.idx,
      label: `问题 ${String(cur.idx)}`,
      brief: rawChunk.slice(0, 120)
    })
  }
  return out
}

export function parseQuestions(problemsField: string): QuestionView[] {
  const lines = problemsField
    .split(/[\n\r]+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= MIN_BRIEF)

  const out: QuestionView[] = []
  const seen = new Set<number>()
  for (const line of lines) {
    const { idx, text } = parseQuestionLine(line)
    if (idx === null || seen.has(idx)) continue
    seen.add(idx)
    out.push({ idx, label: `问题 ${String(idx)}`, brief: text.slice(0, 120) })
  }
  if (out.length >= 2) {
    return out.sort((a, b) => a.idx - b.idx)
  }

  // 若按行切不出 2 问以上（如 PDF 抽出来的连贯文本流），尝试按全文正则流切分
  const streamResult = parseQuestionsFromStream(problemsField)
  return streamResult.length >= 2 ? streamResult : []
}

export const qPrefix = (idx: number): string => `q${String(idx)}:`
export function qKey(idx: number, fieldKey: string): string {
  return qPrefix(idx) + fieldKey
}

const Q_KEY = /^q(1[0-2]|[1-9]):(.+)$/

export function splitQKey(key: string): { idx: number; fieldKey: string } | null {
  const m = Q_KEY.exec(key)
  if (!m) return null
  return { idx: Number.parseInt(m[1] as string, 10), fieldKey: m[2] as string }
}

/** 没选定问题时用这一页，行为与逐问之前完全一致 */
export const NO_QUESTION = 0

export function questionBrief(questions: QuestionView[], idx: number): string {
  return questions.find((q) => q.idx === idx)?.brief ?? ''
}
