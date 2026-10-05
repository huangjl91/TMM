import type { GuidedStep } from './guidedQuiz'
import { isLearningStep, LEARNING_TASKS, readLearningNote } from './learning'

export interface TeachingFeedback {
  source: 'local' | 'ai'
  quote: string
  observation: string
  gap: string
  question: string
  nextAction: string
  limitation: string
}

/** 本地反馈只引用学生原话并追问，不根据关键词判定答案正确。 */
export function localTeachingFeedback(step: GuidedStep, raw: string): TeachingFeedback {
  const note = readLearningNote(raw)
  const answers = note.answers.map((answer) => answer.trim())
  const missing = answers.findIndex((answer) => !answer)
  const quote = (answers.find(Boolean) ?? '').slice(0, 100)
  const fields = isLearningStep(step) ? LEARNING_TASKS[step].fields : ['思路', '依据', '验证']
  let question = step === 'intuition'
    ? '你描述的交付结果，分别对应题目中的哪一句要求？请核对对象、范围和单位。'
    : '你准备怎样用独立的结果比较所选模型与简单方法，什么表现会让你调整选择？'
  let gap = '目前只有思路描述，还需要回到题目或实验结果核对。'
  if (missing >= 0) {
    gap = `还没有说明“${fields[missing]}”。`
    question = isLearningStep(step) ? LEARNING_TASKS[step].placeholders[missing]! : '请补充具体依据。'
  } else if (step === 'model_select' && /简单|方便|容易/.test(answers[0] ?? '') && !/数据|约束|样本|附件|时间|变量/.test(answers[0] ?? '')) {
    gap = '你提到了使用成本，还没有在选择依据中明确本题的数据或约束。'
    question = '本题的哪项数据特征或约束支持这个选择？请指出具体字段或题目条件。'
  }
  return {
    source: 'local', quote,
    observation: quote ? '先从你已经写出的这条思路继续核对。' : '先用自己的话写下一条思路，不必一次写完整。',
    gap, question,
    nextAction: missing >= 0 ? `补充“${fields[missing]}”，再提交或请求追问。` : '补充一条可核对的依据或验证办法，再更新回答。',
    limitation: '这是本地规则追问，没有判断模型正确，也没有验证计算结果。'
  }
}

/** 拒绝缺字段、过长或虚构引文的模型回复，避免把泛泛而谈当作针对性反馈。 */
export function parseTeachingFeedback(value: unknown, raw: string): TeachingFeedback | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const keys = ['quote', 'observation', 'gap', 'question', 'nextAction', 'limitation'] as const
  if (keys.some((key) => typeof v[key] !== 'string' || !(v[key] as string).trim() || (v[key] as string).length > 600)) return null
  const quote = (v.quote as string).trim()
  if (quote.length > 160 || !readLearningNote(raw).answers.some((answer) => answer.includes(quote))) return null
  return {
    source: 'ai', quote, observation: (v.observation as string).trim(), gap: (v.gap as string).trim(),
    question: (v.question as string).trim(), nextAction: (v.nextAction as string).trim(), limitation: (v.limitation as string).trim()
  }
}
