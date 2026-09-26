import assert from 'node:assert/strict'
import {
  GUIDED_STEPS,
  detectProblemCategory,
  extractProblemElements,
  buildDefaultGuidedQuestions,
  synthesizeGuidedDraft
} from '../.tmp/guidedQuiz.mjs'

console.log('— 引导式解题引擎 (Guided Quiz Engine) 单元测试 —')

// 1. 题型识别测试
assert.equal(detectProblemCategory('针对不同配送中心进行最优化调度与路径规划，使总成本最低'), 'optimization')
assert.equal(detectProblemCategory('对各企业进行综合评价打分与排名优选'), 'evaluation')
assert.equal(detectProblemCategory('根据过去三年历史数据预测未来三个月的用电负荷变化走势'), 'prediction')
console.log('PASS  题目类型自动识别 (运筹规划 / 综合评价 / 时序预测)')

// 2. 4 阶梯结构与梯度由浅入深校验
const { knowledge, questions, candidateModels } = buildDefaultGuidedQuestions(1, '建立最优化调度模型使得总成本最小')
assert.equal(GUIDED_STEPS.length, 4)
assert.equal(questions.intuition.stepIndex, 1)
assert.equal(questions.model_select.stepIndex, 2)
assert.equal(questions.formulation.stepIndex, 3)
assert.equal(questions.visualization.stepIndex, 4)

assert.ok(Array.isArray(candidateModels) && candidateModels.length >= 2, '缺少候选模型')
assert.ok(candidateModels[0].mathFormulation.objectiveLatex, '候选模型缺少目标函数公式')
assert.ok(candidateModels[0].applicableScenarios.whenToUse, '候选模型缺少适用场景')
console.log('PASS  候选模型库完备：包含适用场景、LaTeX数学公式、数据映射与避坑指南')
console.log('PASS  4 阶梯步进完整：从简单读题感知 -> 宏观选型 -> 机理推导 -> 绘图与结论')

// 3. 选项与 AI 导师建议校验 (先给选项，设置问AI环节)
for (const step of ['intuition', 'model_select', 'formulation', 'visualization']) {
  const q = questions[step]
  assert.ok(q.options.length >= 2, `${step} 选项不足`)
  for (const opt of q.options) {
    assert.ok(opt.key, '选项缺少 key')
    assert.ok(opt.text, '选项缺少 text')
    assert.ok(opt.means, '选项缺少 means')
  }
  assert.ok(q.aiAdvice.recommended, `${step} 缺少 AI 推荐选项`)
  assert.ok(q.aiAdvice.reason, `${step} 缺少 AI 推荐理由`)
  assert.ok(Object.keys(q.aiAdvice.pitfalls).length >= 2, `${step} 缺少选项避坑指南`)
}
console.log('PASS  每道选择题具备完整选项与结构化 AI 导师建议卡 (推荐+理由+避坑)')

// 4. 科研数据可视化与结论专项目标校验
const vis = questions.visualization.visualization
assert.ok(vis, '缺少第4阶梯的可视化详情')
assert.ok(vis.plotType, '缺少图表类型说明')
assert.ok(vis.xLabel, '缺少横轴与量纲说明')
assert.ok(vis.yLabel, '缺少纵轴与量纲说明')
assert.ok(vis.expectedFinding, '缺少图表揭示现象说明')
assert.ok(vis.paperConclusion.includes('待'), '结论必须保留待计算占位符')
assert.ok(vis.pythonCode.includes('不会创建随机数或示例数组'), '默认代码必须是安全占位符')
assert.equal(vis.pythonCode.includes('np.random'), false, '默认代码不得生成随机数据')
console.log('PASS  第4阶梯数据可视化专项完备，默认代码不再包含模拟数组')

// 5. 解题成果综合草稿生成校验
const choices = {
  intuition: { pickedKey: 'B', pickedText: '在有限资源约束下求成本最低', pickedMeans: '锁定最优化', timestamp: Date.now() },
  model_select: { pickedKey: 'A', pickedText: '混合整数线性规划 MILP', pickedMeans: '机理严密', timestamp: Date.now() },
  formulation: { pickedKey: 'A', pickedText: '设 0-1 变量表示任务指派', pickedMeans: '标准指派', timestamp: Date.now() },
  visualization: { pickedKey: 'A', pickedText: '甘特图 + 成本对比柱状图', pickedMeans: '满分图组', timestamp: Date.now() }
}

const draft = synthesizeGuidedDraft(1, '调度总成本最小化', knowledge, choices, vis)
assert.ok(draft.problemRestatement.includes('混合整数线性规划') === false) // 重述不混杂推导
assert.ok(draft.problemRestatement.includes('核心矛盾识别'))
assert.ok(draft.modelFormulation.includes('混合整数线性规划 MILP'))
assert.ok(draft.visualizationPlan.includes('甘特图'))
assert.ok(draft.paperSnippet.includes('学生写作提纲'))
assert.ok(draft.paperSnippet.includes('【待计算】'))
assert.equal(/MAPE\s*(?:为|=)\s*\d/i.test(draft.paperSnippet), false)
console.log('PASS  4 步决策自动拼装为解题重述、数学推导、验证清单与学生写作提纲')

// 6. 微网赛题真实要素抽取与针对性问题生成校验
const cProblemText = `
2026 年高教社杯全国大学生数学建模竞赛题目 C 题 微网与外部电网电力调控策略
利用小区负载、光伏发电量和储能设备的当前储电量等数据，尽可能精准地给出微网的购电量和储能设备的充放电量，
使得微网提供的电力既能满足小区的负载，又尽可能节省微网的购电费用。
问题 1 若每天的电价和小区负载相同，同时给出光伏发电功率一天的预测数据，要求微网提供的电能不可低于小区负载，
且储能设备在 0:00 和 24:00 的储电量相同。请在每天 0:00 制定微网当天的计划购电策略的数学模型。
根据附件 1 和附录 1 中的数据，在论文中以表 1 格式给出指定时间段的购电量，以表 2 格式给出储能充放电量，
并将完整的计划购电策略保存到文件 result1.xlsx 中。
储能设备最大容量为 12000 kWh，最大充放电功率为 5000 kW，充放电效率为 90%。
`

const elements = extractProblemElements('问题 1 制定微网计划购电策略', cProblemText)
assert.ok(elements.coreTarget.includes('购电') && elements.coreTarget.includes('费用'))
assert.ok(elements.inputData.some((d) => d.includes('分时电价') || d.includes('附件 1')))
assert.ok(elements.physicsConstraints.some((c) => c.includes('不可低于') || c.includes('供需')))
assert.ok(elements.deliverables.some((res) => res.includes('result1.xlsx')))
console.log('PASS  赛题深度解构：精准抽取核心目标、输入数据、物理机理约束与规定交付物')

const { knowledge: mgKnowledge, questions: mgQuestions } = buildDefaultGuidedQuestions(
  1,
  '制定微网计划购电策略并保存到 result1.xlsx',
  cProblemText
)
assert.ok(mgKnowledge.topic.includes('微网') || mgKnowledge.topic.includes('电力'))
assert.ok(mgQuestions.intuition.options.some((o) => o.text.includes('0:00 与 24:00') || o.text.includes('购电总费用')))
assert.ok(mgQuestions.model_select.options.some((o) => o.text.includes('MILP') || o.text.includes('混合整数线性规划')))
assert.ok(mgQuestions.formulation.options.some((o) => o.text.includes('η=90%') || o.text.includes('90%')))
assert.equal(mgQuestions.visualization.visualization.pythonCode.includes('p_buy'), false)
assert.ok(mgQuestions.visualization.visualization.pythonCode.includes('不会创建随机数或示例数组'))
console.log('PASS  赛题深度定制引导：生成贴合 C 题的选择题，且不注入虚构求解数组')

console.log('\nAll guided smoke tests passed!')

