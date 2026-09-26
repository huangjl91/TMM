import { buildGeneralCandidateModels, getCandidateModelsForQuestion } from './candidateModels'
export { getCandidateModelsForQuestion } from './candidateModels'

export type GuidedStep = 'intuition' | 'model_select' | 'formulation' | 'visualization'
export type GuidedCategory = 'prediction' | 'optimization' | 'evaluation'

export interface CategoryAssessment {
  detected: GuidedCategory
  active: GuidedCategory
  overridden: boolean
  reasons: string[]
}

export interface GuidedStepMeta {
  key: GuidedStep
  index: number
  title: string
  subTitle: string
  icon: string
}

export const GUIDED_STEPS: GuidedStepMeta[] = [
  { key: 'intuition', index: 1, title: '读题感知', subTitle: '理解题意与核心矛盾', icon: '🔍' },
  { key: 'model_select', index: 2, title: '宏观选型', subTitle: '确定数学建模大方向', icon: '🧭' },
  { key: 'formulation', index: 3, title: '机理推导', subTitle: '明确变量、目标与约束', icon: '📐' },
  { key: 'visualization', index: 4, title: '绘图与结论', subTitle: '数据可视化与论文核心结论', icon: '📊' }
]

export interface GuidedOption {
  key: string // 'A', 'B', 'C', 'D'
  text: string
  means: string
  tag?: string // e.g. '推荐方向', '基准保底', '容易踩坑'
}

export interface AiAdvice {
  recommended: string // e.g. 'B'
  reason: string // 为什么推荐，结合题目背景
  pitfalls: Record<string, string> // key -> 选项解析或陷阱分析
  mathNote?: string // 数学要点或物理意义
}

export interface VisualizationSpec {
  plotType: string // 推荐学术图表类型，例如：双Panel图（趋势分解线图 + 残差QQ图）
  xLabel: string // 横轴名称与物理单位
  yLabel: string // 纵轴名称与物理单位
  dataOrigin: string // 数据来源字段
  expectedFinding: string // 图表揭示的数据规律/物理现象
  paperConclusion: string // 论文正文中应填写的学术结论段落
  pythonCode: string // 可直接在沙箱运行的绘图代码模板
}

export interface GuidedQuestion {
  step: GuidedStep
  stepIndex: number
  stepTitle: string
  ask: string
  description?: string
  options: GuidedOption[]
  aiAdvice: AiAdvice
  visualization?: VisualizationSpec
}

export interface ProblemKnowledge {
  topic: string // e.g. '多元时序预测与周期分解'
  category: 'prediction' | 'optimization' | 'evaluation' | 'differential' | 'machine_learning' | 'network'
  summary: string // 核心考察意图
  mathEssence: string // 数学本质映射
  keyPrinciples: string[] // 关键机理考点
  commonPitfalls: string[] // 历年常见失分误区
}

export interface StepChoice {
  pickedKey: string
  pickedText: string
  pickedMeans: string
  userNote?: string
  timestamp: number
}

export interface ModelVariable {
  symbol: string
  name: string
  physicalMeaning: string
  domain: string
}

export interface ModelConstraint {
  name: string
  latex: string
  physicalMeaning: string
}

export interface CandidateModelInfo {
  id: string
  name: string
  aka: string
  role: 'primary' | 'baseline' | 'defense'
  roleBadge: string
  suitabilityScore: number
  fitReason: string
  applicableScenarios: {
    problemTypes: string[]
    whenToUse: string
    whenNotToUse: string
    prosAndCons: { pros: string[]; cons: string[] }
  }
  mathFormulation: {
    overview: string
    variables: ModelVariable[]
    objectiveLatex: string
    objectiveDesc: string
    constraints: ModelConstraint[]
    matrixForm?: string
  }
  practicalMapping: {
    dataInputs: string[]
    solverRecommendation: string
    pythonSnippet?: string
  }
  pitfallsAndTips: string[]
}

export interface ProblemElements {
  coreTarget: string
  inputData: string[]
  physicsConstraints: string[]
  deliverables: string[]
}

export interface GuidedSessionState {
  questionIdx: number
  questionLabel: string
  questionBrief: string
  /** 是否已有真实题目文本；false 时不得生成候选模型、代码或结论。 */
  sourceReady: boolean
  categoryAssessment: CategoryAssessment
  currentStep: GuidedStep
  completed: boolean
  knowledge: ProblemKnowledge
  elements?: ProblemElements
  candidateModels?: CandidateModelInfo[]
  questions?: Record<GuidedStep, GuidedQuestion>
  choices: Partial<Record<GuidedStep, StepChoice>>
  generatedDraft?: {
    problemRestatement: string
    modelFormulation: string
    visualizationPlan: string
    paperSnippet: string
  }
}

export const REAL_DATA_CODE_PLACEHOLDER = `# 请先导入 CSV/TSV/XLSX 数据附件。
# 系统随后会生成显式读取“附件/文件名”的基础检查代码；不会创建随机数或示例数组。`

/** 历史缓存和在线模型输出都经过这里，避免把演示数组当作学生的真实结果运行。 */
export function enforceEvidenceSafeQuestions(
  questions: Record<GuidedStep, GuidedQuestion>
): Record<GuidedStep, GuidedQuestion> {
  const visualization = questions.visualization?.visualization
  if (visualization) visualization.pythonCode = REAL_DATA_CODE_PLACEHOLDER
  return questions
}

/** 从题干与全文中抽取关键要素（核心目标、输入数据、硬性物理约束、规定交付物） */
export function extractProblemElements(questionText: string, fullProblemText = ''): ProblemElements {
  const combined = `${questionText}\n${fullProblemText}`
  const isMicrogrid = /微网|外部电网|储能|光伏|电池|充放电|电量|购电|小区负载|分时电价|soc/i.test(combined)

  if (isMicrogrid) {
    const isQ2 = /问题\s*2|紧急购电|5\s*倍|result2/i.test(questionText)
    const isQ3 = /问题\s*3|滚动|更新|未来\s*24\s*小时/i.test(questionText)

    let target = '制定微网计划购电与储能充放电协同策略，在满足小区负载前提下使全天购电总费用最小'
    if (isQ2) {
      target = '针对光伏与负荷随机波动，在 5 倍紧急购电惩罚代价下制定风险最优的计划购电与备用储能调控策略'
    } else if (isQ3) {
      target = '利用 0:00、6:00、12:00、18:00 动态刷新的光伏预报，进行滚动时域修正与闭环调度优化'
    }

    return {
      coreTarget: target,
      inputData: [
        '附件 1 分时电价表（峰谷平时段与度电单价）',
        '附录 1 / 附件 2 小区 24 小时用电负荷数据与光伏发电功率预测序列',
        '储能蓄电池系统参数（最大容量 12000 kWh，最大充放电功率 5000 kW，充放电效率 90%）',
        '附件 5 提交模板（表 1 购电量、表 2 充放电量、表 3 紧急购电量）'
      ],
      physicsConstraints: [
        '实时能量供需守恒：微网供电不可低于小区负载（缺额按 5 倍交易时刻电价紧急购电）',
        '储能动态能量演化：E(t) = E(t-1) + [η·P_ch(t) - P_dis(t)/η]·Δt (η=90%)',
        '蓄电池循环闭环：0:00 与 24:00 的储电量必须严格相等（E(0) = E(24)）',
        '储能荷电边界与充放互斥：0 ≤ E(t) ≤ 12000 kWh，充放电功率 ≤ 5000 kW，且不可同时充放电'
      ],
      deliverables: [
        '论文正文中以表 1 格式给出指定时段购电量及全天总购电量（kWh）与总购电费（元）',
        '论文正文中以表 2 格式给出储能设备指定时段充放电量及 0:00 与 24:00 储电量（kWh）',
        isQ2
          ? '按表 3 格式给出四个指定日期的紧急购电量，完整策略保存至 result2.xlsx'
          : '完整计划购电策略与充放电明细数据保存至文件 result1.xlsx'
      ]
    }
  }

  // 1. 通用核心目标提取
  const targetMatches = combined.match(
    /(?:使得|让|求|使|以|目的|制定).*?(?:最小|最大|最高|最低|最优|预测|评价|费用|成本|策略|指标)/gi
  )
  const coreTarget = targetMatches?.[0]
    ? targetMatches[0].replace(/\s+/g, ' ').trim().slice(0, 150)
    : questionText.slice(0, 100) || '针对赛题要求建立数学模型并求解最优决策方案'

  // 2. 输入数据与附件
  const inputMatches =
    combined.match(
      /(?:附件\s*[0-9一二三四五六七八九十]|附录\s*[0-9一二三四五六七八九十]|数据|表\s*[0-9一二三四五六七八九十]).*?[。；，\n]/gi
    ) ?? []
  const inputData = Array.from(new Set(inputMatches.map((m) => m.replace(/\s+/g, ' ').trim()))).slice(0, 4)
  if (inputData.length === 0) {
    inputData.push('赛题提供的数据集及观测序列', '题目给定的初始物理参数与时空范围')
  }

  // 3. 物理机理与硬性约束
  const constraintMatches =
    combined.match(
      /(?:不可低于|必须保持在|最大容量为|最大充放电功率为|储电量相同|充放电效率为|低于负载|高于计划|违约电价|超出部分|上限|下限|守恒|不能超过|满足).*?[。，；\n]/gi
    ) ?? []
  const physicsConstraints = Array.from(
    new Set(constraintMatches.map((m) => m.replace(/\s+/g, ' ').trim()))
  ).slice(0, 5)
  if (physicsConstraints.length === 0) {
    physicsConstraints.push('系统供需守恒与连续性约束', '变量上下界与非负性物理边界')
  }

  // 4. 交付物与表格规范
  const deliverableMatches =
    combined.match(
      /(?:以表\s*[0-9一二三四五六七八九十]|保存到文件\s*[a-zA-Z0-9_\-\.]+\.xlsx|在论文中.*?给出).*?[。；\n]/gi
    ) ?? []
  const deliverables = Array.from(
    new Set(deliverableMatches.map((m) => m.replace(/\s+/g, ' ').trim()))
  ).slice(0, 4)
  if (deliverables.length === 0) {
    deliverables.push('论文中规范呈现数值求解结果与对比表', '导出规定格式的计算结果支撑材料')
  }

  return {
    coreTarget,
    inputData,
    physicsConstraints,
    deliverables
  }
}

/** 识别题目类型的关键词匹配 */
export function detectProblemCategory(text: string): ProblemKnowledge['category'] {
  const t = text.toLowerCase()
  if (
    /微网|电力|规划|调度|路径|分配|最大化|最小化|成本最低|效益最高|最优化|背包|排班|指派|milp|lp|optimiz/i.test(
      t
    )
  ) {
    return 'optimization'
  }
  if (/预测|趋势|未来|走势|时序|时间序列|外推|arima|lstm|回归|拟合|残差/i.test(t)) {
    return 'prediction'
  }
  if (/评价|综合评价|打分|排序|优选|权重|topsis|熵权|层次分析|ahp|模糊综合/i.test(t)) {
    return 'evaluation'
  }
  if (/微分方程|动态|动力学|传热|运动|扩散|常微分|偏微分|ode|pde/i.test(t)) {
    return 'differential'
  }
  if (/分类|聚类|异常检测|识别|支持向量机|随机森林|降维|pca|kmeans/i.test(t)) {
    return 'machine_learning'
  }
  return 'prediction'
}

export function explainProblemCategory(text: string): Omit<CategoryAssessment, 'active' | 'overridden'> {
  const detectedRaw = detectProblemCategory(text)
  const detected: GuidedCategory =
    detectedRaw === 'optimization' || detectedRaw === 'evaluation' ? detectedRaw : 'prediction'
  const patterns: Record<GuidedCategory, RegExp> = {
    optimization: /微网|调度|路径|分配|最大化|最小化|成本|效益|约束|规划|指派/gi,
    prediction: /预测|趋势|未来|走势|时序|时间序列|外推|回归|拟合|残差|动态|微分/gi,
    evaluation: /评价|打分|排序|优选|权重|指标|topsis|熵权|层次分析|ahp/gi
  }
  const hits = Array.from(new Set(text.match(patterns[detected]) ?? [])).slice(0, 6)
  return {
    detected,
    reasons: hits.length ? hits.map((word) => `题目出现“${word}”`) : ['未命中强特征词，暂按通用数据预测方向处理']
  }
}

/** 为微网电力调控赛题构建高度贴合第一性原理与赛题要求的专属引导 */
function buildMicrogridGuidedQuestions(
  questionIdx: number,
  briefText: string,
  fullProblemText = ''
): {
  knowledge: ProblemKnowledge
  questions: Record<GuidedStep, GuidedQuestion>
  candidateModels: CandidateModelInfo[]
} {
  const candidateModels = getCandidateModelsForQuestion(questionIdx, briefText, fullProblemText)
  const isQ2 = questionIdx === 2 || /紧急购电|5\s*倍|波动|result2/i.test(briefText)

  if (isQ2) {
    const knowledge: ProblemKnowledge = {
      topic: '含光伏负荷随机波动与 5 倍紧急购电惩罚的微网鲁棒优化',
      category: 'optimization',
      summary: '本问核心考察在负荷与光伏出力不确定性下，如何权衡事前计划购电量与事后 5 倍紧急购电高昂罚款风险。',
      mathEssence: '两阶段随机规划 (Two-Stage Stochastic Programming) 或 条件风险价值 (CVaR) 风险对冲模型。',
      keyPrinciples: [
        '第一阶段（0:00决策）：确定当天的确定性计划购电基准曲线 P_plan(t)',
        '第二阶段（实时运行）：光伏负荷随机扰动，若电量不足，按 5 倍时刻电价触发紧急购电 P_emer(t)',
        '储能备用容量（Spinning Reserve）：蓄电池不可过早放空，需保留应急放电裕度以缓冲突发负荷高峰'
      ],
      commonPitfalls: [
        '盲目按平均值制定计划，忽视了极端负荷时刻 5 倍电价惩罚对总成本的毁灭性打击',
        '没有在论文中对比不同风险厌恶系数或置信水平下的购电费用敏感性',
        '紧急购电量未按表 3 要求的四个指定日期格式整理并导出 result2.xlsx'
      ]
    }

    const questions: Record<GuidedStep, GuidedQuestion> = {
      intuition: {
        step: 'intuition',
        stepIndex: 1,
        stepTitle: '读题感知 · 核心矛盾辨识',
        ask: '面对「问题 2」中小区负载和光伏发电随时间剧烈波动，微网购电决策的核心权衡是什么？',
        description: '请注意题设严苛规则：微网供电不可低于小区负荷，低于部分需按实时电价的 5 倍紧急购电！',
        options: [
          {
            key: 'A',
            text: '直接按光伏与负载的历史均值制定计划，完全不考虑 5 倍惩罚电价',
            means: '典型侥幸心理，一旦负荷激增或光伏骤降，高昂的 5 倍罚款将导致全天购电费用暴增',
            tag: '严重失分'
          },
          {
            key: 'B',
            text: '在事前计划购电成本与事后 5 倍紧急购电惩罚期望之间寻求最优平衡，并利用储能作为缓冲屏障',
            means: '精准锁定不确定性风险决策本质，既不盲目多买造成浪费，也不少买导致巨额罚款',
            tag: '推荐首选'
          },
          {
            key: 'C',
            text: '为了绝对不触发紧急购电，全天始终按最大可能负荷顶格购电',
            means: '极度保守，产生海量多余购电成本，经济效益极差',
            tag: '过于保守'
          }
        ],
        aiAdvice: {
          recommended: 'B',
          reason: '问题 2 引入了 5 倍惩罚电价的强不对称损失函数（缺电罚款成本是正常购电的 5 倍）。最优解必然是一个鲁棒或随机折中方案：在计划购电中留出合理安全裕量，并调度储能电池保留动态旋转备用。',
          pitfalls: {
            A: '数模大忌！线性规划忽视极值波动会导致在测试集上遭遇巨额 5 倍惩罚。',
            B: '正解。直接契合现代智能电网鲁棒调度与随机优化前沿思想。',
            C: '违背了“尽可能节省微网购电费用”的基本宗旨。'
          }
        }
      },
      model_select: {
        step: 'model_select',
        stepIndex: 2,
        stepTitle: '宏观选型 · 防御矩阵建立',
        ask: '针对负荷与光伏的双重波动不确定性，你计划采用什么主力模型架构？',
        description: '建议构建“确定性 Baseline + 两阶段随机规划/鲁棒优化 + Monte Carlo 扰动对冲”的三维防御。',
        options: [
          {
            key: 'A',
            text: '两阶段随机规划 (Two-stage Stochastic Programming) / CVaR 风险约束 MILP 模型',
            means: '第一阶段决策基准计划，第二阶段针对多场景抽样进行补偿校正，机理严谨无懈可击',
            tag: '主力首选'
          },
          {
            key: 'B',
            text: '忽略随机性，直接沿用问题 1 的简单确定性 MILP 模型',
            means: '未体现问题 2 的核心考点升级，评委会认为队伍没有理解“波动不确定性”要求',
            tag: '答非所问'
          },
          {
            key: 'C',
            text: '箱型不确定集区间鲁棒优化 (Robust Optimization) 与最劣场景对冲',
            means: '保证在最不利极端天气下系统依然可行，数学推导高深，论文加分项',
            tag: '高分对冲'
          },
          {
            key: 'D',
            text: '历史均值计划保底 (Baseline)：以问题 1 计划直接投入问题 2 检验惩罚支出',
            means: '必须写入论文作为对比基准，用于量化你的鲁棒模型减少了多少紧急购电罚款',
            tag: '基准对标'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '两阶段随机规划与 CVaR 是电力系统应对新能源不确定性的金牌经典模型。它能直接利用附件 2 的历史波动数据生成典型场景集，把 5 倍惩罚期望显式写入目标函数，兼顾求解精度与计算速度。',
          pitfalls: {
            A: '完美主力模型。公式层次清晰，与国赛一等奖论文水准完全对齐。',
            B: '直接降档！出题人设 5 倍罚款就是为了考查不确定性建模。',
            C: '可作为稳健性分析章节的强力支撑，与 A 互为印证。',
            D: '非常关键的对比基准！论文中展示 Baseline 遭遇多少次 5 倍罚款，能极大突出主模型的价值。'
          }
        }
      },
      formulation: {
        step: 'formulation',
        stepIndex: 3,
        stepTitle: '机理推导 · 惩罚项与备用约束',
        ask: '在构建问题 2 的数学方程时，如何严密表达 5 倍紧急购电费用与储能备用平衡？',
        description: '推导必须区分计划购电量与紧急购电量，且紧急购电量具备单向非负截断性。',
        options: [
          {
            key: 'A',
            text: '设决策变量 P_plan(t)，引入紧急购电 P_emer(t) ≥ max(0, P_load(t) - P_pv(t) - P_dis(t) - P_plan(t))，以 5·c(t) 加权计入目标函数',
            means: '严密刻画缺额惩罚的凸松弛表达，保持了线性规划的全局可求解性',
            tag: '标准规范'
          },
          {
            key: 'B',
            text: '允许紧急购电量为负数（反向向外网高价卖电套利）',
            means: '严重错误！题目明确规定仅在低于负荷时向外网紧急购电，外网不接受紧急倒送套利',
            tag: '荒谬漏洞'
          },
          {
            key: 'C',
            text: '为蓄电池强制设定最低备用荷电状态（SOC_reserve ≥ 15%），预留应急放电容量',
            means: '机理微创新：避免电池为了谷充峰放而在极端时刻放空导致无力缓冲负荷浪涌',
            tag: '高分微创新'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '紧急购电是单向非负的，数学上写作 P_emer(t) ≥ 0 且 P_emer(t) ≥ P_load(t) - [P_plan(t) + P_pv(t) + P_dis(t) - P_ch(t)]。结合 C 的备用容量约束，可在保证理论严谨的同时展现极高工程素养。',
          pitfalls: {
            A: '推导标准完备，便于调用 PuLP / SciPy 快速求解。',
            B: '致命违背现实业务常识，评委会直接扣减机理分。',
            C: '强力加分点，体现对电力系统“旋转备用”概念的深刻理解。'
          },
          mathNote: '目标函数：\\min \\mathbb{E} \\left[ \\sum_{t=1}^{T} \\left( c(t) P_{plan}(t) + 5 c(t) P_{emer}(t) \\right) \\Delta t \\right]'
        }
      },
      visualization: {
        step: 'visualization',
        stepIndex: 4,
        stepTitle: '科研绘图与结论 · 论文决胜',
        ask: '为了向评委直观展现鲁棒调度模型在对抗 5 倍高额惩罚中的优越性，你想绘制什么图表？',
        description: '必须包含负荷波动置信区间、紧急购电触发频次对比以及指定日期结果。',
        options: [
          {
            key: 'A',
            text: '计划购电与实际负荷波动区间置信带对比图 (Panel a) + 紧急购电发生频次与罚款金额方案对比柱状图 (Panel b)',
            means: '顶刊双Panel标准组合：Panel a 清晰展现计划曲线如何贴合波动上界，Panel b 量化对比罚款压降效果',
            tag: '满分图组'
          },
          {
            key: 'B',
            text: '随意画一张迭代曲线，不标出紧急购电时段与 5 倍罚款数额',
            means: '缺乏针对性，评委完全看不到关于“5倍紧急电价”这一核心要求的论证依据',
            tag: '缺乏说服力'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '问题 2 最关键的数据支撑是“避免了多少次 5 倍紧急购电”与“节省了多少罚款”。双 Panel 图可同时检查风险时段与方案差异，但具体改善比例必须由真实求解结果计算。',
          pitfalls: {
            A: '完全契合国赛评奖对“直观证据链”的要求。',
            B: '未能回答问题 2 的核心考查指标。'
          }
        },
        visualization: {
          plotType: '负荷波动置信区间与鲁棒计划曲线图 (Panel a) + 5倍紧急购电罚款方案对比图 (Panel b)',
          xLabel: 'Panel a 横轴：时刻 t (00:00 ~ 24:00, 小时 / h) ； Panel b 横轴：调度方案策略',
          yLabel: 'Panel a 纵轴：功率 (kW) ； Panel b 纵轴：全天购电与罚款总额 (元)',
          dataOrigin: '附件 2 历史负荷波动统计、求解器输出计划购电矩阵与表 3 指定日期紧急购电记录',
          expectedFinding: '检验晚高峰是否更易触发紧急购电，以及鲁棒方案是否降低紧急购电次数和罚款；次数、比例与保障率均由求解输出填写。',
          paperConclusion:
            '【待学生填写】基准方案与鲁棒方案的紧急购电量、罚款和供电约束满足率均为【待计算】；填写时注明数据日期、求解器状态与输出文件。',
          pythonCode: `# -*- coding: utf-8 -*-
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5), dpi=300)

hours = np.arange(24)
base_load = 4000 + 2500 * np.sin((hours - 6) * np.pi / 12)**2
upper_bound = base_load + 800 + 300 * np.random.rand(24)
lower_bound = base_load - 600 - 200 * np.random.rand(24)
plan_robust = upper_bound * 0.85

# Panel a: 负荷波动区间与计划购电曲线
ax1.plot(hours, base_load, 'b-', label='基准负荷预测均值', linewidth=1.8)
ax1.fill_between(hours, lower_bound, upper_bound, color='#a6bddb', alpha=0.45, label='95% 负荷波动置信区间')
ax1.step(hours, plan_robust, 'r--', where='mid', label='本文鲁棒计划购电曲线 $P_{plan}(t)$', linewidth=2.0)
ax1.set_xlabel('调度时间周期 (小时 / h)', fontsize=11)
ax1.set_ylabel('功率 (kW)', fontsize=11)
ax1.set_title('(a) 负荷波动区间与鲁棒计划购电决策', fontsize=12, fontweight='bold')
ax1.grid(True, linestyle='--', alpha=0.5)
ax1.legend(loc='upper left', fontsize=9)

# Panel b: 方案经济性与 5 倍罚款对比
schemes = ['确定性基准(Baseline)', '本文两阶段鲁棒优化']
regular_cost = [3200, 3450]
penalty_cost = [2850, 240]  # 5倍紧急购电惩罚

x = np.arange(len(schemes))
width = 0.4
ax2.bar(x, regular_cost, width, label='常规计划购电费用 (元)', color='#08519c', edgecolor='black')
ax2.bar(x, penalty_cost, width, bottom=regular_cost, label='5倍紧急购电罚款 (元)', color='#e41a1c', edgecolor='black')

for i in range(len(schemes)):
    total = regular_cost[i] + penalty_cost[i]
    ax2.text(x[i], total + 100, f'总计: {total} 元\\n(降幅 39.0%)' if i==1 else f'总计: {total} 元', ha='center', va='bottom', fontweight='bold', fontsize=10)

ax2.set_xticks(x)
ax2.set_xticklabels(schemes, fontsize=10)
ax2.set_ylabel('微网全天购电总支出 (元)', fontsize=11)
ax2.set_title('(b) 方案经济性与 5 倍罚款规避效果', fontsize=12, fontweight='bold')
ax2.set_ylim(0, 7500)
ax2.grid(axis='y', linestyle='--', alpha=0.5)
ax2.legend(loc='upper right', fontsize=9)

plt.tight_layout()
plt.savefig('microgrid_robust_dispatch_q2.png', dpi=300)
print('图表已成功生成并保存为 microgrid_robust_dispatch_q2.png')
plt.show()
`
        }
      }
    }

    return { knowledge, questions, candidateModels }
  }

  // 默认：微网问题 1（确定性分时电价与储能充放电协同）
  const knowledge: ProblemKnowledge = {
    topic: '微网能量供需平衡与蓄电池分时充放电最优调控',
    category: 'optimization',
    summary: '本问核心考察在已知光伏预测功率和小区负荷前提下，如何利用分时电价差和储能电池进行最优计划购电，使全天购电费用最小且能量守恒闭环。',
    mathEssence: '混合整数线性规划 (MILP) 动态调度模型（含时序能量守恒、损耗非线性转化与 0:00/24:00 循环边界）。',
    keyPrinciples: [
      '第一性原理构建 24 小时实时功率平衡方程：光伏 + 储能放电 + 电网购电 ≥ 小区用电负荷',
      '蓄电池时态能量连续守恒：引入 90% 充放电损耗非对称项，且不可同时充放电',
      '储能初始与终止状态精确闭环：0:00 与 24:00 储电量严格相同（E(0)=E(24)），防止虚假偷电套利'
    ],
    commonPitfalls: [
      '忽略充放电 10% 损耗，把蓄电池视为 100% 无损理想容器，违背物理现实被严重扣分',
      '遗漏“0:00 和 24:00 储电量相同”的刚性要求，导致解不可行',
      '未按表 1、表 2 规定格式给出指定时段购电量与充放电量，或未导出规范的 result1.xlsx 文件'
    ]
  }

  const questions: Record<GuidedStep, GuidedQuestion> = {
    intuition: {
      step: 'intuition',
      stepIndex: 1,
      stepTitle: '读题感知 · 简单切入',
      ask: '读完「问题 1」，在已知光伏预测功率和小区用电负荷的前提下，微网调控最核心的决策目标是什么？',
      description: '请仔细审题：光伏与负荷为已知输入，关键在于如何利用峰谷电价差与蓄电池调度达成全局最优。',
      options: [
        {
          key: 'A',
          text: '重新对未来的光伏发电功率进行高精度机器学习时序拟合',
          means: '审题偏差：题目第一句已明确说明“给出光伏发电功率一天的预测数据”，输入已确定，核心是调度决策而非重新做预测',
          tag: '审题偏差'
        },
        {
          key: 'B',
          text: '在满足小区负荷且 0:00 与 24:00 电池储量相等的前提下，通过电池充放电协同使得全天外网购电总费用最低',
          means: '精准锁定出题人意图：典型的微网运筹最优化（MILP）决策问题，紧扣削峰填谷与能量守恒闭环',
          tag: '推荐首选'
        },
        {
          key: 'C',
          text: '让储能设备始终保持在最大容量 12000 kWh 满电状态，不进行放电',
          means: '经济性极差：电池满电闲置无法发挥峰谷套利价值，浪费资产且增加购电费用',
          tag: '违背机理'
        },
        {
          key: 'D',
          text: '纯定性探讨微网分布式新能源消纳的绿色环保意义',
          means: '缺乏定量数学公式推导与算法求解，无法交付 result1.xlsx 所要求的数值解',
          tag: '缺乏定量'
        }
      ],
      aiAdvice: {
        recommended: 'B',
        reason: '问题 1 属于标准的“工业微电网日前经济调度”问题。由于光伏发电与负荷需求时间上不匹配，且电网存在分时电价（谷电价低、峰电价高），核心逻辑就是在谷电期或光伏富余期给电池充电，在峰电期放电顶替高价电网购电，从而最小化总电费。',
        pitfalls: {
          A: '不要把已给出的已知预测数据重复当成预测题，会彻底偏离出题人考察方向。',
          B: '正解。直接确立了决策变量（各时段购电量、充放电量）与最优化目标函数。',
          C: '储能的核心价值就是“低充高放”，死守满电等于没有储能系统。',
          D: '数学建模必须给出严谨的数学规划方程与代码计算结果。'
        }
      }
    },
    model_select: {
      step: 'model_select',
      stepIndex: 2,
      stepTitle: '宏观选型 · 建立防线',
      ask: '针对 24 小时微网经济调度与电池荷电状态 (SOC) 连续演化，应选用什么数学模型作为主力方案？',
      description: '国赛评委极其看重模型的机理严谨性与理论最优性证明。',
      options: [
        {
          key: 'A',
          text: '混合整数线性规划 (MILP) 动态调度模型 + 精确求解器 (PuLP / SciPy / Gurobi)',
          means: '机理最严密：目标函数线性、供需守恒线性，充放电互斥引入 0-1 变量，能在秒级保证全局理论最优解',
          tag: '主力推荐'
        },
        {
          key: 'B',
          text: '多层神经网络 (MLP) 或深度强化学习 (DQN/PPO)',
          means: '黑盒且缺乏约束保证机制，样本利用率低，极难保证 0:00 与 24:00 储电量精确守恒',
          tag: '不推荐'
        },
        {
          key: 'C',
          text: '遗传算法 (GA) / 粒子群优化 (PSO) 启发式元算法',
          means: '适合作为对冲稳健模型，用于比对求解耗时与启发式在离散约束下的收敛表现',
          tag: '备选对冲'
        },
        {
          key: 'D',
          text: '人工经验贪婪规则 (Baseline)：光伏自发自用，不足全网购，电池不动作',
          means: '必须写在论文第四节的对比基准！用于向评委量化展示本文 MILP 模型到底为小区省了多少钱',
          tag: '基准对标'
        }
      ],
      aiAdvice: {
        recommended: 'A',
        reason: '购电费是电价与购电量的线性求和，功率平衡与容量限制也是线性不等式。唯一需要处理的是“蓄电池不可同时充放电”，这只需要引入一个 0-1 二元状态变量 u(t) 即可转化为标准的 MILP。MILP 在主流优化器中绝对收敛且无随机误差，是评委最认可的最高分模型。',
        pitfalls: {
          A: '首选主力。公式推导优雅，约束逻辑完备，论文得分极高。',
          B: '大忌！数模竞赛非常忌讳把严格的混合整数规划问题强行套用黑盒深度学习。',
          C: '可作为稳健性与对冲算法放在第 6 节，证明 MILP 的求解速度与稳定性优势。',
          D: '必写 Baseline！没有基准对比，就无法证明你的模型到底为小区节省了多少购电费。'
        }
      }
    },
    formulation: {
      step: 'formulation',
      stepIndex: 3,
      stepTitle: '机理推导 · 符号系统与硬性约束',
      ask: '在构建微网调度的状态转移方程与物理约束时，如何严密刻画蓄电池的充放电损耗与守恒？',
      description: '推导必须做到物理量纲平衡，并严格包含 90% 充放电效率与始末守恒。',
      options: [
        {
          key: 'A',
          text: '引入充放电效率 η=90%，建立动态状态方程 E(t)=E(t-1)+(η·P_ch(t) - P_dis(t)/η)Δt，并设互斥约束 u_ch(t)+u_dis(t)≤1 与循环守恒 E(0)=E(24)',
          means: '规范完备闭环：损耗方向正确、充放互斥、时段末储量复原，完全满足全部物理定律',
          tag: '规范完备'
        },
        {
          key: 'B',
          text: '忽略充放电效率损耗（设 η=100%），且不约束 0:00 与 24:00 储电量相等',
          means: '严重失真漏洞：虚夸了储能系统的经济效益，且直接违背了题目“0:00和24:00储电量相同”的硬性规定',
          tag: '严重违规'
        },
        {
          key: 'C',
          text: '在目标函数中额外加入弃光惩罚项与蓄电池循环寿命折旧微创新',
          means: '机理微创新进阶：在最小化购电费用的基础上兼顾设备损耗与绿电消纳率',
          tag: '高分微创新'
        }
      ],
      aiAdvice: {
        recommended: 'A',
        reason: '储能电池的物理守恒有两大命门：① 损耗的不对称性（充电时只有 η 倍存入电池，放电供给负荷时电池内部需消耗 1/η 倍）；② 始末能量闭环（E(0)=E(24)，否则就相当于系统通过消耗电池原有的库存电量来凭空套利）。',
        pitfalls: {
          A: '标准机理推导，天衣无缝，与题设要求 100% 契合。',
          B: '致命扣分点！遗漏题干明确规定的“0:00与24:00储电量相同”，结果将被直接判定为不可行解。',
          C: '非常漂亮的机理微创新，在 A 扎实做好的基础上可作为亮点写入论文。'
        },
        mathNote: '目标函数：\\min \\sum_{t=1}^{T} c(t) P_{buy}(t) \\Delta t ；约束：P_{buy}(t) + P_{pv}(t) + P_{dis}(t) - P_{ch}(t) \\ge P_{load}(t)，0 \\le E(t) \\le 12000\\text{ kWh}，E(0)=E(24)'
      }
    },
    visualization: {
      step: 'visualization',
      stepIndex: 4,
      stepTitle: '科研绘图与结论 · 论文决胜',
      ask: '为了向评委直观展现微网购电调控方案的经济性与能量供需平衡，应该绘制怎样的顶刊学术图表？',
      description: '图表必须展示 24 小时实时功率堆叠平衡、储能削峰填谷动作与方案降本数值。',
      options: [
        {
          key: 'A',
          text: '24小时功率供需堆叠平衡图 (Panel a: 光伏+储能放电+电网购电 vs 小区负载) 结合 电池储电量 E(t) 演化与分时电价联动折线图 (Panel b)',
          means: '顶刊级双Panel标准组合：Panel a 清晰印证能量供需时刻平衡，Panel b 直观揭示谷充峰放套利机理与始末闭环',
          tag: '满分图组'
        },
        {
          key: 'B',
          text: '随便画一个全天电费支出的饼状占比图，不展现时间维度变化',
          means: '缺乏时序动态信息，评委无法核验充放电时段是否合规与是否发生了削峰填谷',
          tag: '表达薄弱'
        },
        {
          key: 'C',
          text: '蓄电池充放电功率箱线图与电价敏感性扰动热力图',
          means: '适合作为灵敏度与稳健性分析章节的有力补充配图',
          tag: '稳健支撑'
        }
      ],
      aiAdvice: {
        recommended: 'A',
        reason: '电力调度题评委最看重的就是“时空调度无冲突”与“削峰填谷可视化”。双 Panel 图中，左图展示实时功率平衡（光伏+放电+购电严丝合缝匹配负荷），右图展示电池在谷价时充至满格、峰价时放电归位，直接向评委证明了模型的可行性与最优性。',
        pitfalls: {
          A: '国赛最高分标准图组，具备极强视觉冲击力与严密的物理论证逻辑。',
          B: '缺乏关键动态时序信息，无法体现调度过程。',
          C: '非常优秀的灵敏度分析配图，可补充至论文第 6 节。'
        }
      },
      visualization: {
        plotType: '24小时微网功率供需平衡堆叠图 (Panel a) 与 储能电量-分时电价时序联动图 (Panel b)',
        xLabel: 'Panel a & b 横轴：调度时间周期 t (00:00 ~ 24:00 / 小时 h)',
        yLabel: 'Panel a 纵轴：实时功率 (kW) ； Panel b 纵轴：蓄电池储电量 E(t) (kWh) / 电价 (元/kWh)',
        dataOrigin: '附件 1 电价表、附录 1 负荷与光伏数据、优化求解器输出决策变量矩阵',
        expectedFinding: '检验储能是否呈现谷充峰放、供需是否逐时平衡，以及期末储量是否回到题设要求；具体时段和数值由求解输出填写。',
        paperConclusion:
          '【待学生填写】高价时段购电变化【待计算】、总成本变化【待计算】；同时引用供需平衡、期末储量与功率限额的校验输出。',
        pythonCode: `# -*- coding: utf-8 -*-
import matplotlib.pyplot as plt
import numpy as np

# 设置学术级字体与美化
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5), dpi=300)

hours = np.arange(24)

# 模拟 24 小时小区负荷与光伏出力 (kW)
load = 3500 + 2000 * np.sin((hours - 4) * np.pi / 12)**2
pv = np.maximum(0, 4800 * np.sin((hours - 6) * np.pi / 12))

# 储能充放电模拟 (kW) 与购电量计算
p_ch = np.zeros(24)
p_dis = np.zeros(24)
# 谷电期 (0-6点) 充电
p_ch[0:5] = 2400
# 峰电期 (10-14点, 18-21点) 放电
p_dis[10:14] = 2000
p_dis[18:21] = 1800

# 满足负载的购电量
p_buy = np.maximum(0, load - pv - p_dis + p_ch)

# Panel a: 功率堆叠图
ax1.plot(hours, load, 'k-', linewidth=2.2, label='小区负荷需求曲线 $P_{load}(t)$')
ax1.bar(hours, pv, width=0.6, label='光伏自发自用 $P_{pv}(t)$', color='#41b6c4', alpha=0.85)
ax1.bar(hours, p_dis, width=0.6, bottom=pv, label='储能放电功率 $P_{dis}(t)$', color='#7fbc41', alpha=0.85)
ax1.bar(hours, p_buy, width=0.6, bottom=pv + p_dis, label='电网购电功率 $P_{buy}(t)$', color='#2b5c8f', alpha=0.85)

ax1.set_xlabel('调度时间 (小时 / h)', fontsize=11)
ax1.set_ylabel('功率 (kW)', fontsize=11)
ax1.set_title('(a) 24小时微网功率供需平衡堆叠图', fontsize=12, fontweight='bold')
ax1.grid(axis='y', linestyle='--', alpha=0.5)
ax1.legend(loc='upper right', fontsize=9)

# Panel b: 储能容量演化与分时电价
eta = 0.90
e_soc = np.zeros(25)
e_soc[0] = 3000 # 初始储电量
for t in range(24):
    e_soc[t+1] = e_soc[t] + (p_ch[t] * eta - p_dis[t] / eta)

# 分时电价 (元/kWh)
price = np.array([0.35]*7 + [0.75]*3 + [1.25]*4 + [0.75]*4 + [1.25]*3 + [0.35]*3)

ax2_twin = ax2.twinx()
line1 = ax2.plot(np.arange(25), e_soc, 'g-o', markersize=4, linewidth=2, label='蓄电池储电量 $E(t)$ (kWh)')
ax2.axhline(12000, color='r', linestyle=':', label='最大容量上限 12000 kWh')
ax2.axhline(e_soc[0], color='gray', linestyle='--', alpha=0.7, label='0:00与24:00守恒参考线')

line2 = ax2_twin.step(hours, price, 'orange', where='post', linewidth=1.8, label='分时电价 (元/kWh)')

ax2.set_xlabel('调度时刻 t (0:00 ~ 24:00)', fontsize=11)
ax2.set_ylabel('储能设备当前储电量 (kWh)', color='green', fontsize=11)
ax2_twin.set_ylabel('分时购电单价 (元/kWh)', color='darkorange', fontsize=11)
ax2.set_title('(b) 蓄电池储能状态与分时电价联动演化', fontsize=12, fontweight='bold')
ax2.set_ylim(0, 14000)
ax2.grid(True, linestyle='--', alpha=0.5)

# 合并图例
lines = line1 + [line2[0]]
labels = [l.get_label() for l in lines]
ax2.legend(lines, labels, loc='lower right', fontsize=9)

plt.tight_layout()
plt.savefig('microgrid_power_balance_q1.png', dpi=300)
print('图表已成功生成并保存为 microgrid_power_balance_q1.png')
plt.show()
`
      }
    }
  }

  return { knowledge, questions, candidateModels }
}

/** 为指定小问生成标准的 4 阶梯选择题与知识讲解（支持赛题全文动态机理适配） */
export function buildDefaultGuidedQuestions(
  questionIdx: number,
  briefText: string,
  fullProblemText = '',
  categoryOverride?: GuidedCategory
): {
  knowledge: ProblemKnowledge
  questions: Record<GuidedStep, GuidedQuestion>
  candidateModels: CandidateModelInfo[]
} {
  const combined = `${briefText}\n${fullProblemText}`
  const detectedCategory = explainProblemCategory(combined).detected
  const activeCategory = categoryOverride ?? detectedCategory
  const isMicrogrid = /微网|外部电网|储能|光伏|电池|充放电|电量|购电|小区负载|分时电价|soc/i.test(combined)
  const candidateModels = !categoryOverride && isMicrogrid
    ? getCandidateModelsForQuestion(questionIdx, briefText, fullProblemText)
    : buildGeneralCandidateModels(questionIdx, activeCategory)

  // 1. 优先检测是否为微电网电力调控赛题
  if (!categoryOverride && isMicrogrid) {
    const built = buildMicrogridGuidedQuestions(questionIdx, briefText, fullProblemText)
    built.questions = enforceEvidenceSafeQuestions(built.questions)
    return built
  }

  const cat = activeCategory

  if (cat === 'optimization') {
    const knowledge: ProblemKnowledge = {
      topic: '运筹优化与资源调度模型',
      category: 'optimization',
      summary: '本问核心考察在有限资源和严苛业务规则约束下，如何实现系统成本最小化或整体效益最大化。',
      mathEssence: '运筹学最优化模型（规划建模：决策变量、目标函数、约束方程组）。',
      keyPrinciples: [
        '第一性原理确定决策主体与决策变量（连续型 vs 0-1 离散型）',
        '目标函数的综合权衡（如固定成本 + 变动成本 + 延误惩罚）',
        '不可逾越的物理守恒与时空边界（容量守恒、时序无回路、时间窗约束）'
      ],
      commonPitfalls: [
        '漏掉关键物理约束（如仓储容量超限、设备连续作业时限）',
        '盲目套用遗传算法等黑盒启发式，而未先尝试混合整数规划(MIP)精确求解器',
        '目标函数量纲不统一（如把时间秒与成本元直接相加）'
      ]
    }

    const questions: Record<GuidedStep, GuidedQuestion> = {
      intuition: {
        step: 'intuition',
        stepIndex: 1,
        stepTitle: '读题感知 · 简单切入',
        ask: `读完「问题 ${questionIdx}」，你觉得题目最核心想让你解决什么矛盾？`,
        description: '请凭第一直觉选择最贴近出题人初衷的描述，不确定可以点击下方“问 AI 建议”。',
        options: [
          {
            key: 'A',
            text: '仅对未来的业务需求量进行数值预测',
            means: '将重点放在数据时序拟合上，未抓住资源调度的核心冲突',
            tag: '偏离核心'
          },
          {
            key: 'B',
            text: '在有限资源/设备/时空容量约束下，寻求总成本最低或效率最高的分配方案',
            means: '精准锁定运筹最优化本质，把问题归结为决策变量与约束规划',
            tag: '推荐首选'
          },
          {
            key: 'C',
            text: '综合评估历年各个作业单元的历史绩效表现',
            means: '误把调度优化当成了静态综合评价打分',
            tag: '概念混淆'
          },
          {
            key: 'D',
            text: '纯定性分析可能存在的管理与运营风险',
            means: '缺乏数学定量建模，无法得出最优解',
            tag: '缺乏定量'
          }
        ],
        aiAdvice: {
          recommended: 'B',
          reason: `根据题意分析，问题 ${questionIdx} 明确给出了有限的资源配置条件与需要达成的工作指标。核心任务并非单纯预测或定性描述，而是做出“资源如何调配”的决策，因此属于典型的运筹最优化（Optimization）问题。`,
          pitfalls: {
            A: '虽然可能涉及数据输入，但出题人真正要求输出的是调度方案而非单纯预测曲线。',
            B: '正解。直接对齐数学建模中最核心的决策目标与物理边界。',
            C: '评价打分只能说明过去好坏，不能给出未来的最优决策分配矩阵。',
            D: '数学建模必须给出严谨的数学公式和定量数值，不能停留在口头建议。'
          }
        }
      },
      model_select: {
        step: 'model_select',
        stepIndex: 2,
        stepTitle: '宏观选型 · 建立防线',
        ask: '针对确定的最优化目标，你打算采用哪种数学模型作为主力方案？',
        description: '优秀论文通常采用“Baseline 基准模型 + 主力数学规划 + 对冲算法验证”的三维防御。',
        options: [
          {
            key: 'A',
            text: '混合整数线性规划模型 (MILP) + 精确求解器 (PuLP / Gurobi / SciPy)',
            means: '数学机理最严谨，能给出理论最优解或确切的上下界证明',
            tag: '主力推荐'
          },
          {
            key: 'B',
            text: '直接套用多层神经网络或深度强化学习',
            means: '黑盒模型，可解释性极差，且在离散约束下极难保证不越界违规',
            tag: '不推荐'
          },
          {
            key: 'C',
            text: '遗传算法 / 模拟退火等元启发式算法 (Meta-heuristics)',
            means: '适合解空间超大且非线性的复杂NP-Hard问题，但易陷入局部最优',
            tag: '备选对冲'
          },
          {
            key: 'D',
            text: '人工经验贪婪启发式规则 (Greedy Heuristic Baseline)',
            means: '快速跑通保底 baseline，作为对比其他高级算法提升幅度的基准',
            tag: '基准对标'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '国赛与美赛评委极其看重模型的数学机理性。混合整数线性规划(MILP)具备严密的数学表达，能明确列出变量和约束，求解速度快且答案具有唯一确定性；若问题规模极大，可将 C（遗传算法）作为稳健性对冲比较。',
          pitfalls: {
            A: '第一优选。公式推导优雅，约束逻辑清晰，在论文中加分极高。',
            B: '大忌！数模竞赛非常忌讳把能用运筹数学求解的问题强行套用黑盒深度学习。',
            C: '可以作为对冲模型使用，证明主模型的鲁棒性与收敛速度优势。',
            D: '非常适合写在论文第四节作为“Baseline 对比基准”，用以突出主模型的节约率。'
          }
        }
      },
      formulation: {
        step: 'formulation',
        stepIndex: 3,
        stepTitle: '机理推导 · 符号与约束',
        ask: '在构建该规划模型的数学表达时，核心决策变量与目标函数如何设定？',
        description: '推导必须做到量纲统一、符号定义清晰无歧义。',
        options: [
          {
            key: 'A',
            text: '设 0-1 变量 x_{ij} 表示任务 i 是否分配至资源 j，最小化综合调度与惩罚成本',
            means: '标准 0-1 指派与调度结构，约束线性化完备，量纲清晰（元）',
            tag: '标准规范'
          },
          {
            key: 'B',
            text: '连续变量 x_i，目标函数只求最短距离，忽略时间窗与容量限制',
            means: '过度简化，忽略现实约束，会导致模型不可行',
            tag: '漏洞严重'
          },
          {
            key: 'C',
            text: '构建双目标函数（同时最小化总成本与最小化最大完工时间 Makespan）',
            means: '微创新进阶：采用 Pareto 前沿或线性加权法权衡两大矛盾指标',
            tag: '高分微创新'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '清晰的 0-1 决策变量 x_{ij} \\in {0,1} 是离散运筹的基石。如果队伍能力充足，可以在 A 的基础上引入 C 的双目标加权，作为本问的机理微创新点。',
          pitfalls: {
            A: '极度稳妥扎实，易于转化为 Python/PuLP 求解代码。',
            B: '遗漏约束是运筹题被判“零分模型”的最大原因，必须加入容量与时间约束。',
            C: '微创新方案，适合冲刺国家一等奖队伍，需在论文中给出权重灵敏度分析。'
          },
          mathNote: '目标函数示例：\\min Z = \\sum_{i} \\sum_{j} c_{ij} x_{ij} + \\lambda \\sum_{i} \\max(0, T_i - D_i)，约束满足 \\sum_j x_{ij} = 1'
        }
      },
      visualization: {
        step: 'visualization',
        stepIndex: 4,
        stepTitle: '科研绘图与结论 · 论文决胜',
        ask: '为了在论文中直观有力地向评委证明该优化方案的优越性，你决定绘制什么图？',
        description: '学术图表不是插图装饰，每张图必须带有坐标量纲，并在论文正文中承载明确结论。',
        options: [
          {
            key: 'A',
            text: '调度甘特图 (Gantt Chart) + 优化前后成本对比柱状图 (Baseline vs MILP)',
            means: '顶刊标准学术表达：甘特图展现时空无冲突，对比图直观凸显效益提升数值',
            tag: '满分图组'
          },
          {
            key: 'B',
            text: '随意画一张迭代收敛折线图，不给基准方案对比',
            means: '缺少物理实际意义，评委无法判断最终方案到底比人工经验好在哪里',
            tag: '缺乏说服力'
          },
          {
            key: 'C',
            text: '各资源负荷率雷达图 (Radar Chart) + 关键参数敏感性箱线图',
            means: '展示系统资源利用率均衡性与在参数扰动下的稳健边界',
            tag: '稳健支撑'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '优化调度题评委最想看的就是两样东西：① 任务到底怎么排的（甘特图一眼看出有无冲突重叠）；② 你的算法到底省了多少钱（对比柱状图给出明确量化数值）。',
          pitfalls: {
            A: '最佳组合。图题明确，双 Panel 互补，完全解答题目核心要求。',
            B: '很多学生只贴迭代曲线，评委根本不在意你迭代了多少次，在意的是方案可行性与效果。',
            C: '可以作为补充图放在灵敏度分析章节中。'
          }
        },
        visualization: {
          plotType: '时空调度甘特图 (Panel A) 结合 成本效益对比柱状图 (Panel B)',
          xLabel: 'Panel A 横轴：调度时间周期 t (h) ； Panel B 横轴：方案类别 (Baseline vs 本文模型)',
          yLabel: 'Panel A 纵轴：资源/机位编号 ； Panel B 纵轴：综合运营总成本 (万元)',
          dataOrigin: '求解器输出的决策变量矩阵 X 与目标函数值计算明细',
          expectedFinding: '检查任务是否处于可用时间窗、是否存在交叠或容量超限，并比较各资源负荷；结论由求解输出填写。',
          paperConclusion:
            '【待学生填写】可行任务数【待计算】、冲突数【待计算】、基线与模型成本【待计算】；仅在求解状态可行且约束校验通过后下结论。',
          pythonCode: `# -*- coding: utf-8 -*-
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5), dpi=300)

tasks = ['任务A', '任务B', '任务C', '任务D', '任务E']
starts = [0, 2, 3, 5, 7]
durations = [3, 2, 4, 3, 2]
y_pos = np.arange(len(tasks))

colors = ['#2b5c8f', '#d95f02', '#7570b3', '#1b9e77', '#e7298a']
for i in range(len(tasks)):
    ax1.barh(y_pos[i], durations[i], left=starts[i], color=colors[i], edgecolor='black', alpha=0.85, height=0.55)
    ax1.text(starts[i] + durations[i]/2, y_pos[i], f'{durations[i]}h', ha='center', va='center', color='white', fontweight='bold', fontsize=9)

ax1.set_yticks(y_pos)
ax1.set_yticklabels(tasks, fontsize=10)
ax1.set_xlabel('时间轴 (小时 / h)', fontsize=11)
ax1.set_title('(a) 最优调度时空甘特图', fontsize=12, fontweight='bold')
ax1.grid(axis='x', linestyle='--', alpha=0.5)

schemes = ['人工经验(Baseline)', '本文优化模型']
costs = [48.62, 39.15]
bar_colors = ['#8c96c6', '#08519c']

bars = ax2.bar(schemes, costs, color=bar_colors, width=0.45, edgecolor='black', linewidth=1)
for b in bars:
    h = b.get_height()
    ax2.text(b.get_x() + b.get_width()/2, h + 0.8, f'{h:.2f} 万元', ha='center', va='bottom', fontweight='bold', fontsize=10)

ax2.set_ylabel('综合运营成本 (万元)', fontsize=11)
ax2.set_ylim(0, 60)
ax2.set_title('(b) 方案经济效益对比 (降幅 19.47%)', fontsize=12, fontweight='bold')
ax2.grid(axis='y', linestyle='--', alpha=0.5)

plt.tight_layout()
plt.savefig('optimization_gantt_result.png', dpi=300)
print('图表已成功生成并保存为 optimization_gantt_result.png')
plt.show()
`
        }
      }
    }

    return { knowledge, questions: enforceEvidenceSafeQuestions(questions), candidateModels }
  }

  if (cat === 'evaluation') {
    const knowledge: ProblemKnowledge = {
      topic: '综合评价与多指标决策体系',
      category: 'evaluation',
      summary: '本问核心考察如何建立系统完备的评价指标体系，消除量纲影响，并进行客观科学的打分优选。',
      mathEssence: '高维多准则决策（MCDM）与综合打分（客观赋权法 + 逼近理想解法）。',
      keyPrinciples: [
        '指标正向化与标准化（极差法/Z-score，彻底统一量纲）',
        '主客观结合赋权（熵权法/CRITIC法提取数据信息量，AHP反映机理偏好）',
        '排序得分模型（TOPSIS欧氏贴近度、灰色关联度、秩和比RSR）'
      ],
      commonPitfalls: [
        '未说明指标为何正向化，把成本型指标直接代入熵权',
        '直接套用 AHP 而主观判断矩阵未经一致性检验（CR < 0.1）',
        '只有排名数字，没有对排名前列对象的关键驱动指标进行归因解释'
      ]
    }

    const questions: Record<GuidedStep, GuidedQuestion> = {
      intuition: {
        step: 'intuition',
        stepIndex: 1,
        stepTitle: '读题感知 · 简单切入',
        ask: `读完「问题 ${questionIdx}」，你觉得题目主要要求你达成什么目的？`,
        description: '从直觉上判断本题的评价对象、评价指标与输出形式。',
        options: [
          {
            key: 'A',
            text: '对多个候选对象在多维度指标下进行科学打分、综合排序并给出优劣归因',
            means: '标准的多指标综合评价问题，需要打分体系支撑',
            tag: '推荐首选'
          },
          {
            key: 'B',
            text: '仅做未来时序预测，不进行横向对比',
            means: '方向走偏，无法回答“谁更好、谁更差”的核心命题',
            tag: '偏离题意'
          },
          {
            key: 'C',
            text: '不看多指标，只按单一指标直接由大到小排序',
            means: '缺乏系统性，无法体现多维综合评价的数学深度',
            tag: '过于简陋'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: `问题 ${questionIdx} 涉及多维度特征与多个候选对象，核心要求是“评价”、“选优”或“排序”，这需要构建指标体系和综合评价矩阵，因此属于综合评价模型范畴。`,
          pitfalls: {
            A: '正解。直接契合多准则决策分析流程。',
            B: '不可做纯时序，评价题的核心是对象间的优劣排序与差距量化。',
            C: '数模大忌，单指标排序没有任何数学建模工作量，会被评委判定为无模型。'
          }
        }
      },
      model_select: {
        step: 'model_select',
        stepIndex: 2,
        stepTitle: '宏观选型 · 建立防线',
        ask: '你打算采用哪套综合评价组合拳？',
        description: '国赛高分论文常采用“客观赋权（熵权/CRITIC）+ TOPSIS 逼近理想解 + 灰色关联对冲”组合。',
        options: [
          {
            key: 'A',
            text: '熵权法 (Entropy Weight) + TOPSIS (优劣解距离法) 主力组合',
            means: '经典黄金搭档：熵权消除主观偏见，TOPSIS量化与理想解的欧氏空间贴近度',
            tag: '主力首选'
          },
          {
            key: 'B',
            text: '纯主观 AHP 层次分析法，凭个人打分定权重',
            means: '主观性太强，容易被评委质疑权重的随意性',
            tag: '缺乏客观性'
          },
          {
            key: 'C',
            text: '变异系数法 + 灰色关联度 (GRA) 稳健对冲',
            means: '适合作为对冲验证模型，检验与 TOPSIS 排名的一致性（Spearman等级相关系数）',
            tag: '对冲验证'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '熵权-TOPSIS 是公认的综合评价标杆模型，逻辑完备、公式标准，且具有极高的客观说服力。同时可以搭配 C 进行等级相关系数检验（Spearman秩相关系数 > 0.85），构成坚实的三维防御。',
          pitfalls: {
            A: '最佳主力。计算透明，评委认可度高。',
            B: '若必须用 AHP，必须给出专家咨询矩阵并做一致性检验，但纯 AHP 容易被扣分。',
            C: '非常适合写在灵敏度与稳健性检验章节，证明排名结论不会随方法微调而颠覆。'
          }
        }
      },
      formulation: {
        step: 'formulation',
        stepIndex: 3,
        stepTitle: '机理推导 · 指标正向化与赋权',
        ask: '在数据进入 TOPSIS 距离计算前，必须完成的关键数学步骤是什么？',
        description: '严谨的预处理是综合评价的灵魂。',
        options: [
          {
            key: 'A',
            text: '极值/区间指标正向化 → 向量归一化消除量纲 → 信息熵计算权重 w_j',
            means: '规范完整的数学闭环，保证各维度在同一度量空间内计算欧氏距离',
            tag: '标准完备'
          },
          {
            key: 'B',
            text: '直接用原始带单位的数据相加求平均分',
            means: '犯了物理量纲不平衡的严重致命错误',
            tag: '致命错误'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '指标方向不同（成本型越小越好、效益型越大越好、居中型接近特定值最好），如果不做正向化和归一化，直接计算距离必然导致完全失真的荒谬结果。',
          pitfalls: {
            A: '每一步均有严格数学映射公式。',
            B: '量纲混乱直接判定不及格。'
          },
          mathNote: '正向化后归一化：z_{ij} = x_{ij} / \\sqrt{\\sum_{i} x_{ij}^2}；贴近度 C_i = D_i^- / (D_i^+ + D_i^-)'
        }
      },
      visualization: {
        step: 'visualization',
        stepIndex: 4,
        stepTitle: '科研绘图与结论 · 论文决胜',
        ask: '综合评价结果出来后，你打算画什么图来呈现对象的优劣对比与驱动因素？',
        description: '优秀的综合评价不仅展示排名，更要揭示“为什么得高分/低分”。',
        options: [
          {
            key: 'A',
            text: '综合贴近度水平排序横向柱状图 + TOP3 vs 后3名雷达图 (Radar Chart)',
            means: '柱状图展现总体排名差距，雷达图深度剖析各对象在各细分指标上的短板与优势',
            tag: '满分图组'
          },
          {
            key: 'B',
            text: '只贴一个表格，不画图',
            means: '缺乏视觉冲击力，评委很难迅速抓住核心落脚点',
            tag: '缺乏图元'
          }
        ],
        aiAdvice: {
          recommended: 'A',
          reason: '雷达图是多指标评价的核心亮点，能一眼看出第一名胜在哪些维度，最后一名受制于哪些短板，直接为后续的决策建议提供因果依据。',
          pitfalls: {
            A: '论文视觉效果极佳，论据充分。',
            B: '数模论文必须图文并茂，全篇应有 15+ 处科研配图，不可全靠纯表格。'
          }
        },
        visualization: {
          plotType: '综合贴近度排名横向柱状图 (Panel A) + 典型对象多维特征雷达图 (Panel B)',
          xLabel: 'Panel A 横轴：TOPSIS 综合相对贴近度 C_i (分值 0~1) ； Panel B：各归一化指标维度',
          yLabel: 'Panel A 纵轴：评价对象编号 / 样本标识',
          dataOrigin: 'TOPSIS 算法输出的相对贴近度向量 C 与标准化指标矩阵 Z',
          expectedFinding: '检查排名、得分差距与主要贡献指标，并通过权重敏感性分析判断排序是否稳定；所有得分由真实计算填写。',
          paperConclusion:
            '【待学生填写】排名第一对象【待计算】、相对贴近度【待计算】、主要优势指标【待核验】；补充权重扰动后的名次稳定性。',
          pythonCode: `# -*- coding: utf-8 -*-
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5), dpi=300)

labels = ['对象 A4', '对象 A1', '对象 A5', '对象 A3', '对象 A2']
scores = [0.842, 0.725, 0.613, 0.458, 0.312]
colors = ['#08519c', '#3182bd', '#6baed6', '#9ecae1', '#c6dbef']

y_pos = np.arange(len(labels))
bars = ax1.barh(y_pos, scores, color=colors, edgecolor='black', alpha=0.9, height=0.55)
for b in bars:
    w = b.get_width()
    ax1.text(w + 0.02, b.get_y() + b.get_height()/2, f'{w:.3f}', ha='left', va='center', fontweight='bold', fontsize=10)

ax1.set_yticks(y_pos)
ax1.set_yticklabels(labels, fontsize=10)
ax1.set_xlim(0, 1.0)
ax1.set_xlabel('TOPSIS 相对贴近度 $C_i$', fontsize=11)
ax1.set_title('(a) 候选对象综合贴近度排名', fontsize=12, fontweight='bold')
ax1.grid(axis='x', linestyle='--', alpha=0.5)

categories = ['经济效益', '运行稳定', '环境友好', '技术先进', '资源利用']
N = len(categories)
angles = [n / float(N) * 2 * np.pi for n in range(N)]
angles += angles[:1]

val_best = [0.88, 0.85, 0.75, 0.90, 0.82]
val_best += val_best[:1]
val_worst = [0.35, 0.42, 0.28, 0.30, 0.38]
val_worst += val_worst[:1]

ax2 = plt.subplot(1, 2, 2, polar=True)
ax2.set_theta_offset(np.pi / 2)
ax2.set_theta_direction(-1)
plt.xticks(angles[:-1], categories, fontsize=10)

ax2.plot(angles, val_best, linewidth=2, linestyle='solid', label='最佳对象 (A4)', color='#08519c')
ax2.fill(angles, val_best, '#08519c', alpha=0.25)

ax2.plot(angles, val_worst, linewidth=2, linestyle='dashed', label='落后对象 (A2)', color='#e41a1c')
ax2.fill(angles, val_worst, '#e41a1c', alpha=0.15)

ax2.set_title('(b) 极值对象多维能力雷达剖析', fontsize=12, fontweight='bold', pad=15)
ax2.legend(loc='upper right', bbox_to_anchor=(1.25, 1.1), fontsize=9)

plt.tight_layout()
plt.savefig('evaluation_topsis_radar.png', dpi=300)
print('图表已成功生成并保存为 evaluation_topsis_radar.png')
plt.show()
`
        }
      }
    }

    return { knowledge, questions: enforceEvidenceSafeQuestions(questions), candidateModels }
  }

  // 默认：时序预测与数据趋势类 (prediction)
  const knowledge: ProblemKnowledge = {
    topic: '时间序列建模与未来走势预测',
    category: 'prediction',
    summary: '本问核心考察对历史观测数据的时序规律（趋势、周期性、自相关性与白噪声残差）的识别与建模。',
    mathEssence: '随机过程与时序分解（平稳性检验、差分还原、参数辨识与外推区间预测）。',
    keyPrinciples: [
      '平稳性与纯随机性检验（ADF单位根检验 + 白噪声残差Ljung-Box检验）',
      '时序分解三要素（长期趋势 T + 季节周期 S + 随机扰动 I）',
      '置信区间与泛化稳健性（不能只给单点预测，必须附带 95% 置信带）'
    ],
    commonPitfalls: [
      '不进行平稳性检验，直接对非平稳数据强行拟合 ARMA 产生伪回归',
      '只看训练集拟合度 R^2，导致过拟合且在验证集上泛化崩塌',
      '只给出单一数值预测点，缺乏误差置信区间与灵敏度稳健性讨论'
    ]
  }

  const questions: Record<GuidedStep, GuidedQuestion> = {
    intuition: {
      step: 'intuition',
      stepIndex: 1,
      stepTitle: '读题感知 · 简单切入',
      ask: `读完「问题 ${questionIdx}」，你觉得题目最核心想考察你什么？`,
      description: '请凭阅读题干与附件说明的第一直觉进行判断。',
      options: [
        {
          key: 'A',
          text: '分析历史数据的演化规律，并对未来指定时间段的指标进行定量预测与误差评估',
          means: '准确捕捉到时间序列预测的本质，紧扣出题人的外推预测要求',
          tag: '推荐首选'
        },
        {
          key: 'B',
          text: '对历史数据里的各个年份进行好坏排名的综合打分',
          means: '把动态演化过程静态化为单纯的评价排序，丢失了时间维度的连续信息',
          tag: '理解偏差'
        },
        {
          key: 'C',
          text: '求解一个设备如何调配的极值规划方案',
          means: '本问并未给出调度约束与决策矩阵，不属于运筹优化',
          tag: '模型错配'
        }
      ],
      aiAdvice: {
        recommended: 'A',
        reason: `题干中通常包含“根据附录历史数据预测未来…”、“建立预测模型并说明精度”等明确关键词，核心考核的是时序挖掘与预测外推能力。`,
        pitfalls: {
          A: '正解。直接确立了数据预处理 → 模型拟合 → 未来外推的路线。',
          B: '年份之间具有强烈的时序自相关，不能拆成孤立的样本点进行静态评价。',
          C: '若后面小问有基于预测值的调度，那应在后文展开，本问首先要做扎实预测。'
        }
      }
    },
    model_select: {
      step: 'model_select',
      stepIndex: 2,
      stepTitle: '宏观选型 · 建立防线',
      ask: '你想选择什么数学模型来完成本问的预测任务？',
      description: '高分论文讲究“简单基准 Baseline + 主力时序机理 + 现代机器学习对冲”。',
      options: [
        {
          key: 'A',
          text: '平稳时序分解与 SARIMA / Prophet 季节性时序模型',
          means: '严密捕捉长期趋势与季节周期，数学可解释性极强，自带置信区间',
          tag: '主力首选'
        },
        {
          key: 'B',
          text: '灰色预测模型 GM(1,1)',
          means: '适合样本量少于 15 且具有指数单调性的极小样本，无法捕获复杂周期波动',
          tag: '局限较大'
        },
        {
          key: 'C',
          text: '多元一元多项式回归 (Polynomial Regression Baseline)',
          means: '作为 Baseline 基准对照组，用于在论文中突显高级模型的误差下降幅度',
          tag: '基准对标'
        },
        {
          key: 'D',
          text: 'LightGBM / XGBoost 或 LSTM 神经网络',
          means: '适合作为对冲稳健模型，进行背靠背的交叉验证与特征重要性分析',
          tag: '对冲验证'
        }
      ],
      aiAdvice: {
        recommended: 'A',
        reason: '数模竞赛中的时间序列多数伴随显著的季节性（按月、按季度、按日周期）或非平稳趋势。SARIMA 或 Prophet 能清晰分解趋势项与周期项，具有公认的数学统计学依据；同时配合 C（多项式回归）做 Baseline，D（LightGBM）做稳健交叉验证，形成完美防御。',
        pitfalls: {
          A: '非常符合学术规范，推导逻辑无懈可击。',
          B: '若样本量较大或有周期性，用 GM(1,1) 会被评委判定为“不看数据特征盲目套用”。',
          C: '只用回归太单薄，但作为对比基准不可或缺。',
          D: '单用深度学习缺乏公式可推导性，作为横向对冲对比则效果极佳。'
        }
      }
    },
    formulation: {
      step: 'formulation',
      stepIndex: 3,
      stepTitle: '机理推导 · 平稳性与参数估计',
      ask: '在构建时间序列数学方程时，如何确保模型不会发生“伪回归”并达到最优阶数？',
      description: '推导过程必须阐明自相关函数与模型阶数判别准则。',
      options: [
        {
          key: 'A',
          text: '进行 ADF 平稳性检验与差分运算 → 借助 AIC/BIC 信息准则与残差正态白噪声检验定阶',
          means: '国际公认的 Box-Jenkins 经典建模流程，理论严密无破绽',
          tag: '标准规范'
        },
        {
          key: 'B',
          text: '直接强行把参数阶数调到最大，直到训练集 R^2=1.0',
          means: '严重的过拟合与数据记忆，会导致未来外推彻底跑飞失真',
          tag: '严重错误'
        }
      ],
      aiAdvice: {
        recommended: 'A',
        reason: '时间序列建模的第一铁律是：只有平稳序列才能建立 ARMA 模型。差分使序列平稳，AIC/BIC 准则在模型复杂度与拟合优度之间寻求最优平衡，有效防御过拟合。',
        pitfalls: {
          A: '推导规范，体现扎实的统计学功底。',
          B: '典型大忌！数模评审标准明确规定“过拟合无泛化能力的模型不予评奖”。'
        },
        mathNote: '平稳差分算子 \\nabla^d X_t = (1-B)^d X_t；模型定阶目标 \\min \\text{AIC} = 2k - 2\\ln(L)'
      }
    },
    visualization: {
      step: 'visualization',
      stepIndex: 4,
      stepTitle: '科研绘图与结论 · 论文决胜',
      ask: '为了在论文中向评委证明你的预测结果扎实可靠，你想画什么图？能得出什么具体结论？',
      description: '图表必须包含历史拟合、未来外推、95% 置信区间与残差诊断。',
      options: [
        {
          key: 'A',
          text: '历史拟合与未来外推预测图（含 95% 置信区间阴影带）+ 残差正态分布与自相关诊断图',
          means: '顶刊级时序标准配图：置信带展现不确定性控制，残差诊断证明信息已被完全提取',
          tag: '满分图组'
        },
        {
          key: 'B',
          text: '仅画一条干巴巴的折线，没有历史对比，也不标误差带',
          means: '缺乏学术严谨性，评委无法判断预测精度的可靠范围',
          tag: '缺乏说服力'
        }
      ],
      aiAdvice: {
        recommended: 'A',
        reason: '没有任何外推预测是绝对无误差的。画出 95% 置信区间阴影带（Confidence Interval）是评委衡量队伍是否具备真正科研素养的关键分水岭；配上残差图更是直接证明模型收敛无偏。',
        pitfalls: {
          A: '无可挑剔的科研级配图，图题完整，信息密度极高。',
          B: '极其简陋，容易被评委打上“非专业数模”标签。'
        }
      },
      visualization: {
        plotType: '历史拟合与未来外推时序图 (含 95% 置信带, Panel A) + 残差正态分布直方图 (Panel B)',
        xLabel: 'Panel A 横轴：时间序列 (年份/月份) ； Panel B 横轴：标准化残差值 \\epsilon_t',
        yLabel: 'Panel A 纵轴：监测指标数值 (附物理量纲) ； Panel B 纵轴：频数密度 (Density)',
        dataOrigin: '附件历史时序数据与 SARIMA/Prophet 预测外推输出',
        expectedFinding: '检查拟合误差、未来趋势、预测区间覆盖与残差结构；MAPE、R²、区间和检验 p 值均由真实输出填写。',
        paperConclusion:
          '【待学生填写】MAPE【待计算】、R²【待计算】、预测区间【待计算】、残差检验 p 值【待计算】；依据检验结果说明模型是否可用于外推。',
        pythonCode: `# -*- coding: utf-8 -*-
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 4.8), dpi=300)

time_hist = np.arange(1, 25)
actual = 100 + 1.8 * time_hist + 12 * np.sin(time_hist * np.pi / 6) + np.random.normal(0, 2.5, len(time_hist))
fitted = 100 + 1.8 * time_hist + 12 * np.sin(time_hist * np.pi / 6)

time_future = np.arange(25, 31)
pred_future = 100 + 1.8 * time_future + 12 * np.sin(time_future * np.pi / 6)
lower_bound = pred_future - 6.5
upper_bound = pred_future + 6.5

ax1.plot(time_hist, actual, 'o', color='#252525', label='实际历史观测点', markersize=4.5)
ax1.plot(time_hist, fitted, '-', color='#08519c', label='模型历史拟合曲线 ($R^2=0.94$)', linewidth=1.8)
ax1.plot(time_future, pred_future, '--', color='#e41a1c', label='未来外推预测点', linewidth=2.0)
ax1.fill_between(time_future, lower_bound, upper_bound, color='#fb6a4a', alpha=0.25, label='95% 置信区间预测带')

ax1.set_xlabel('时间序列 (月份 / Month)', fontsize=11)
ax1.set_ylabel('监测物理量指标 (单位)', fontsize=11)
ax1.set_title('(a) 时序拟合与未来外推走势 (含置信区间)', fontsize=12, fontweight='bold')
ax1.grid(True, linestyle='--', alpha=0.5)
ax1.legend(loc='upper left', fontsize=9)

residuals = actual - fitted
ax2.hist(residuals, bins=10, density=True, color='#41b6c4', edgecolor='black', alpha=0.75, label='标准化残差直方图')

mu, std = np.mean(residuals), np.std(residuals)
x_norm = np.linspace(mu - 3*std, mu + 3*std, 100)
p_norm = (1 / (np.sqrt(2 * np.pi) * std)) * np.exp(-0.5 * ((x_norm - mu) / std) ** 2)
ax2.plot(x_norm, p_norm, 'r--', linewidth=1.8, label=f'理论正态拟合 (\\sigma={std:.2f})')

ax2.set_xlabel('残差数值 (Residuals)', fontsize=11)
ax2.set_ylabel('概率密度 (Density)', fontsize=11)
ax2.set_title('(b) 残差白噪声与正态性检验', fontsize=12, fontweight='bold')
ax2.grid(True, linestyle='--', alpha=0.5)
ax2.legend(loc='upper right', fontsize=9)

plt.tight_layout()
plt.savefig('timeseries_prediction_result.png', dpi=300)
print('图表已成功生成并保存为 timeseries_prediction_result.png')
plt.show()
`
      }
    }
  }

  return { knowledge, questions: enforceEvidenceSafeQuestions(questions), candidateModels }
}

/** 汇总统合学生的 4 步选择，生成该小问的综合解题方案与论文初稿片段 */
export function synthesizeGuidedDraft(
  questionIdx: number,
  brief: string,
  knowledge: ProblemKnowledge,
  choices: Partial<Record<GuidedStep, StepChoice>>,
  spec?: VisualizationSpec,
  elements?: ProblemElements
): {
  problemRestatement: string
  modelFormulation: string
  visualizationPlan: string
  paperSnippet: string
} {
  const c1 = choices.intuition
  const c2 = choices.model_select
  const c3 = choices.formulation
  const c4 = choices.visualization

  const constraintsList = elements?.physicsConstraints?.length
    ? elements.physicsConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : knowledge.keyPrinciples.map((k, i) => `${i + 1}. ${k}`).join('\n')

  const deliverablesList = elements?.deliverables?.length
    ? elements.deliverables.map((d, i) => `${i + 1}. ${d}`).join('\n')
    : '规范呈现数值求解结果与导出 Excel 支撑材料'

  const problemRestatement = `【问题 ${questionIdx} 题意分析与核心要素拆解】
🎯 核心攻关目标：${elements?.coreTarget || brief || '建立数学模型并求解最优决策方案'}
🔍 核心矛盾识别（出题人意图）：${c1 ? `${c1.pickedKey}. ${c1.pickedText}` : '尚未完成读题感知选择'}
📐 数学本质映射：${knowledge.mathEssence}
⚡ 关键物理约束与守恒边界：
${constraintsList}
📦 必交成果与规范表格：
${deliverablesList}`

  const modelFormulation = `【问题 ${questionIdx} 数学模型构建与求解方案】
主力模型架构：${c2 ? `${c2.pickedKey}. ${c2.pickedText}（意味：${c2.pickedMeans}）` : '尚未选择'}
机理推导与假设约束：${c3 ? `${c3.pickedKey}. ${c3.pickedText}` : '尚未细化'}
关键机理防线：
1. ${knowledge.keyPrinciples[0] ?? '第一性原理推导'}
2. ${knowledge.keyPrinciples[1] ?? '约束完整性检查'}
3. ${knowledge.keyPrinciples[2] ?? '灵敏度与稳健性对冲'}`

  const visualizationPlan = `【问题 ${questionIdx} 科研数据可视化与验证清单】
选定图表类型：${spec?.plotType ?? (c4 ? `${c4.pickedKey}. ${c4.pickedText}` : '尚未配置')}
坐标轴与物理量纲：
- 横轴：${spec?.xLabel ?? '待定'}
- 纵轴：${spec?.yLabel ?? '待定'}
待验证的问题：${spec?.expectedFinding ?? '运行真实数据后记录趋势、差异和异常点'}
结果填写要求：
- 数据来源与样本范围：【待填写】
- 实际指标与不确定性：【待计算】
- 图表支持或否定的判断：【待学生依据输出填写】`

  const paperSnippet = `【学生写作提纲（不代写正文）】
1. 用自己的话说明问题 ${questionIdx} 的目标、输入和约束。
2. 解释为何选择「${c2?.pickedText ?? '待选择模型'}」，并写出适用条件。
3. 填入真实运行结果：指标【待计算】、误差/区间【待计算】、基线对比【待计算】。
4. 根据图表逐项回答：出现了什么规律？证据是什么？局限在哪里？
5. 所有数字必须可追溯到导入数据和沙箱输出。`

  return {
    problemRestatement,
    modelFormulation,
    visualizationPlan,
    paperSnippet
  }
}
