
import type { GuidedStep, StepChoice } from './guidedQuiz'

// 教学数据与界面分开：同一套规则供后台、界面和测试使用。
export interface LearningNote {
  version: 1
  answers: string[]
  hintLevel: number
  submitted: boolean
  helpTopic?: keyof typeof LEARNING_HELP
  helpLevel?: number
}

export const LEARNING_HELP = {
  understand: { label: '没读懂题目', hints: [
    '先找题目要求你完成的动作，再找对象。哪句话最不确定？',
    '把条件分成已知信息、目标、限制。暂时不考虑公式，给每项标出题目或附件来源。',
    '类比例子：安排两辆车运货，已知载重和货量，目标可能是减少费用，限制是不能超载。你的题目分别对应什么？'
  ] },
  model: { label: '不知道怎样选模型', hints: [
    '先描述要完成的任务和数据特点，再找能处理这些特点的方法。',
    '选两种候选，分别核对需要哪些数据、依赖哪些假设，以及能输出什么。缺少的信息先记下来。',
    '类比例子：预测每日用电，可先比较“沿用上一日数值”和趋势法。哪种更合适仍要用留出的数据检验，不能只凭模型名称决定。'
  ] },
  validate: { label: '不知道怎样验证', hints: [
    '什么证据会让你放弃当前方法？先写出一个可以检查的现象。',
    '说明比较对象、评价指标、检验数据和失败后如何调整。时间序列要避免用未来信息帮助预测过去。',
    '类比例子：用训练段建立用电预测，再在同一测试段比较候选与简单基线的误差。误差改善后，还要检查样本量和异常点。'
  ] },
  explain: { label: '不知道怎样解释结果', hints: [
    '先分开写“实际观察到什么”和“你如何解释”，不要把猜测写成事实。',
    '引用一项指标或图表现象，再说明比较对象、范围和不能推出的结论。',
    '类比例子：某次测试误差下降，只支持该测试范围内的比较，不能直接证明未来都有效。你的结果有哪些类似边界？'
  ] }
} as const

export interface LearningFeedback {
  status: 'needs_work' | 'ready'
  message: string
  nextQuestion?: string
}

export const LEARNING_TASKS = {
  intuition: {
    goal: '用自己的话说清楚这问要解决什么。',
    fields: ['要解决的问题', '已知条件与数据来源', '需要交付的结果'],
    placeholders: ['描述对象、目标或时间范围。', '指出题目中的条件或附件字段；缺少的数据也可以写明。', '要交预测值、排序、方案还是其他结果？写清单位或形式。'],
    hints: [
      '先圈出题目里的动作词：预测、评价、安排、比较。它要求你交什么？',
      '按“给定什么 → 要求什么 → 受什么限制”写三句话，再标出信息来源。',
      '类似小例子：已知过去一周每日客流，要预测明天客流。输入是历史客流，输出是明天人数。请回到原题重新表述。'
    ]
  },
  model_select: {
    goal: '说明模型为什么适合，并想好怎样检验。',
    fields: ['选择依据', '比较的简单方法', '适用前提与验证计划'],
    placeholders: ['结合本题数据或约束，解释为什么选这个模型。', '再写一种方法，并说明与当前选择的区别。', '哪些条件需要成立？准备通过什么实验或指标核对？'],
    hints: [
      '先看数据与任务：是预测数值、安排资源，还是比较对象？方法要与目标对应。',
      '比较数据需求、可解释性和计算成本。再想一想：有没有更简单的基准方案？',
      '类似小例子：预测客流时，可以把复杂模型与“沿用上一天人数”比较，用未参与训练的数据检验。请为原题设计自己的比较。'
    ]
  }
} as const

export function isLearningStep(step: GuidedStep): step is keyof typeof LEARNING_TASKS {
  return step === 'intuition' || step === 'model_select'
}

// 复用已有 userNote 字段保存结构化回答；旧版本的一句话理由也保留。
export function readLearningNote(raw = ''): LearningNote {
  try {
    const value = JSON.parse(raw) as Partial<LearningNote> | null
    if (value?.version === 1 && Array.isArray(value.answers)) {
      return {
        version: 1,
        answers: Array.from({ length: 3 }, (_, i) =>
          typeof value.answers?.[i] === 'string' ? value.answers[i].slice(0, 4000) : ''),
        hintLevel: Number.isFinite(value.hintLevel) ? Math.max(0, Math.min(3, Math.floor(value.hintLevel!))) : 0,
        submitted: value.submitted === true,
        ...(value.helpTopic && Object.prototype.hasOwnProperty.call(LEARNING_HELP, value.helpTopic) ? {
          helpTopic: value.helpTopic,
          helpLevel: Number.isFinite(value.helpLevel) ? Math.max(0, Math.min(3, Math.floor(value.helpLevel!))) : 0
        } : {})
      }
    }
  } catch { /* 普通文字是旧版本的理由，不丢弃。 */ }
  return { version: 1, answers: [raw.slice(0, 4000), '', ''], hintLevel: 0, submitted: false }
}

export function reviewLearning(step: GuidedStep, note: LearningNote, pickedKey: string): LearningFeedback {
  if (!isLearningStep(step)) return { status: 'ready', message: '选择已记录。' }
  if (!pickedKey) return { status: 'needs_work', message: '请先选择一个方向，再说明依据。' }
  const missing = LEARNING_TASKS[step].fields.findIndex((_, i) => !note.answers[i]?.trim())
  if (missing >= 0) return {
    status: 'needs_work',
    message: '回答已保存，还需要补充“' + LEARNING_TASKS[step].fields[missing] + '”。',
    nextQuestion: LEARNING_TASKS[step].placeholders[missing]
  }
  return {
    status: 'ready',
    message: '三项说明已填写，可以继续核对。这里只检查填写完整性，不代表模型或结论已经正确。'
  }
}

export function learningStepReady(step: GuidedStep, choice?: StepChoice): boolean {
  if (!choice?.pickedKey) return false
  if (!isLearningStep(step)) return true
  const note = readLearningNote(choice.userNote)
  return note.submitted && reviewLearning(step, note, choice.pickedKey).status === 'ready'
}
