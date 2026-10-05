import type { PredictionEvidenceSummary } from './prediction'

export interface PredictionLabPlan {
  file: string
  sheet: string
  timeColumn: string
  targetColumn: string
  unit: string
  expectation: string
}
export interface PredictionLabState {
  plan: PredictionLabPlan
  experiment?: {
    runId: number
    createdAt: number
    sourceHash: string
    plotName: string
    plan: PredictionLabPlan
    summary: PredictionEvidenceSummary
  }
  reflection: { comparison: string; limitation: string; nextAction: string }
  reflectedAt?: number
  staleReason?: string
}
export const emptyLab = (): PredictionLabState => ({
  plan: { file: '', sheet: '', timeColumn: '', targetColumn: '', unit: '', expectation: '' },
  reflection: { comparison: '', limitation: '', nextAction: '' }
})
export function labInputKey(plan: PredictionLabPlan): string {
  return JSON.stringify([plan.file, plan.sheet, plan.timeColumn, plan.targetColumn, plan.unit])
}
export function planMissing(plan: PredictionLabPlan): string | null {
  if (!plan.file) return '请选择真实数据附件。'
  if (!plan.timeColumn || !plan.targetColumn) return '请选择时间列和预测目标。'
  if (plan.timeColumn === plan.targetColumn) return '时间列和预测目标不能是同一列。'
  if (!plan.unit.trim()) return '请写明目标单位；没有单位时写“无量纲”。'
  if (!plan.expectation.trim()) return '请先写下你预期哪种方法有效，以及准备怎样比较。'
  return null
}
export function labStatus(state: PredictionLabState): string {
  if (state.staleReason) return '数据已变化，需要重跑'
  if (!state.experiment) return '实验尚未运行'
  return state.reflectedAt ? '复盘已记录，仍需核对' : '实验已运行，结果待核对'
}
export function experimentQuestion(summary: PredictionEvidenceSummary): string {
  const baseline = summary.metrics.find((m) => m.model === 'walk-forward-naive-lag-1')
  const selected = summary.metrics.find((m) => m.model === summary.bestModel)
  if (!baseline || !selected) return '证据缺少基线或入选模型指标，请检查运行输出后再比较。'
  const values = `本次测试中，上一期数值基线 RMSE 为 ${baseline.rmse.toPrecision(5)}，入选方法为 ${selected.rmse.toPrecision(5)}。`
  return values + (selected.rmse < baseline.rmse
    ? '改进是否值得增加模型复杂度？请结合测试样本量和残差说明。'
    : '入选方法没有超过简单基线。你准备保留基线，还是检查数据划分或模型假设？')
}

/** 只核对是否出现可匹配的指标引用，不判定学生的结论正确。 */
export function reviewReflection(state: PredictionLabState): string[] {
  if (!state.experiment || state.staleReason) return ['请先运行当前数据的实验，再引用本次证据。']
  const text = state.reflection.comparison
  const feedback: string[] = []
  const numbers = [...text.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map((m) => Number(m[0]))
  const metrics = state.experiment.summary.metrics
  const mentioned = ['MAE', 'RMSE', 'MAPE'].filter((name) => new RegExp(`\\b${name}\\b`, 'i').test(text))
  if (!mentioned.length) feedback.push('你比较的是哪个指标？请写出 MAE、RMSE 或 MAPE 的名称。')
  if (!/基线|上一期|上一日|naive/i.test(text)) feedback.push('请说明与哪个简单基线比较，例如“上一期观测值”。')
  const values = metrics.flatMap((m) => mentioned.map((name) => m[name.toLowerCase() as 'mae' | 'rmse' | 'mape']).filter((v): v is number => v !== null))
  if (!numbers.length) feedback.push('请从本次表格引用具体数值，并注明对应的方法。')
  else if (mentioned.length && !values.some((v) => numbers.some((n) => Math.abs(n - v) <= Math.max(0.00001, Math.abs(v) * 0.005)))) feedback.push('暂未找到与本次指标相符的数值，请核对指标名称、小数位和百分号。此检查只能提示，不能判错。')
  else if (mentioned.length) feedback.push('发现与本次指标近似匹配的数值；请继续核对它对应的方法、单位及比较方向。')
  if (!state.reflection.limitation.trim()) feedback.push('这次测试有哪些局限？可从样本数量、时间范围或数据代表性思考。')
  if (!state.reflection.nextAction.trim()) feedback.push('下一步准备检查什么，或为什么保留当前方法？')
  feedback.push('这是本地引用检查，不验证因果关系、模型适用性或最终结论。')
  return feedback
}
