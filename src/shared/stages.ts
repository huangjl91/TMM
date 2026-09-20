export interface CardField {
  key: string
  label: string
  /** 卡片上告诉学生这一格要写到什么程度 */
  hint: string
}

export interface Rubric {
  /** 评分点：教练只能围绕这些反馈 */
  points: string[]
  /** 历年常见失分项 */
  pitfalls: string[]
}

export interface StageDef {
  id: number
  key: string
  title: string
  /** 一句话说明本阶段学生要交出的东西 */
  output: string
  /** 教练在本阶段的提问方向 */
  focus: string
  fields: CardField[]
  rubric: Rubric
  /**
   * 强制项：没做到 done 就不许推进。
   * 灵敏度检验是多数队伍的失分点，历史上被跳过的最多，所以钉死。
   */
  blocking: boolean
}

/** 分级提示：防挫败，同时把「给了多少帮助」如实记进合规日志 */
export const HINT_LEVELS = ['提问', '方向性提示', '半成品脚手架', '完整示例'] as const

/** 同一阶段连续这么多次没过检查点，提示强度自动升一级 */
export const ESCALATE_AFTER_ATTEMPTS = 3

export const STAGES: StageDef[] = [
  {
    id: 1,
    key: 'parse',
    title: '读题与问题拆解',
    output: '每问的输入/输出/评价对象清单',
    focus: '让学生逐问复述题目给了什么、要什么、评价谁，不许笼统概括',
    blocking: true,
    fields: [
      { key: 'problems', label: '逐问拆解', hint: '问题 1/2/3… 各一行：已知条件、要求的结果、评价对象' },
      { key: 'data', label: '附件与数据', hint: '每个文件是什么、字段含义、时间范围、缺失情况' },
      { key: 'deliverables', label: '交付物清单', hint: '论文正文、图表、附录各要交什么' }
    ],
    rubric: {
      points: ['每问的输入输出明确', '评价对象与指标口径写清', '附件字段含义核对过'],
      pitfalls: ['把多问合并成一问', '没读附件说明就建模', '把"求解"当成目标而没写评价指标']
    }
  },
  {
    id: 2,
    key: 'explore',
    title: '数据探索与预处理',
    output: '缺失值与异常处理说明 + 关键分布图',
    focus: '追问学生为什么这样处理缺失与异常，处理完的数据分布是否支撑后续模型选择',
    blocking: true,
    fields: [
      { key: 'clean', label: '清洗规则', hint: '缺失/异常怎么判定、怎么处理，为什么' },
      { key: 'findings', label: '探索结论', hint: '分布、量纲、相关性里与建模有关的 2-3 条事实' }
    ],
    rubric: {
      points: ['处理规则可复现', '图有坐标轴名称与单位', '结论来自数据而非印象'],
      pitfalls: ['只删缺失不说明', '图无标题无单位', '用被污染的数据直接拟合']
    }
  },
  {
    id: 3,
    key: 'assumption',
    title: '假设与符号表',
    output: '可核验的假设列表 + 符号定义',
    focus: '检查每条假设是否可核验、是否真的被模型用到，符号是否全栈一致',
    blocking: true,
    fields: [
      { key: 'assumptions', label: '假设列表', hint: '每条假设一行，并写"若不为真会怎样"' },
      { key: 'symbols', label: '符号表', hint: '符号、含义、单位，一行一个' }
    ],
    rubric: {
      points: ['假设与模型一一对应', '符号带单位且全文唯一', '假设可核验不空泛'],
      pitfalls: ['写"假设数据真实可靠"这类空话', '同一符号两个含义', '漏掉单位']
    }
  },
  {
    id: 4,
    key: 'select',
    title: '模型选型',
    output: '候选方法权衡与选择理由',
    focus: '让学生自己比较候选方法并说明选择理由，教练只指出比较维度缺哪一项',
    blocking: false,
    fields: [
      { key: 'candidates', label: '候选方法', hint: '至少两个，各写适用前提与代价' },
      { key: 'choice', label: '选择与理由', hint: '为什么选它、放弃了什么、依据是数据的哪条特征' }
    ],
    rubric: {
      points: ['比较维度一致（精度/可解释/数据量/求解成本）', '理由落到本题数据特征', '说明适用前提'],
      pitfalls: ['只写一个方法没有比较', '为炫技选复杂模型', '没说为什么不选更简单的']
    }
  },
  {
    id: 5,
    key: 'derive',
    title: '模型推导',
    output: '目标函数、约束、求解域',
    focus: '核对目标函数、约束、决策变量与符号表是否自洽，量纲是否平衡',
    blocking: true,
    fields: [
      { key: 'objective', label: '目标函数', hint: '用符号表里的符号写，逐项解释含义' },
      { key: 'constraints', label: '约束条件', hint: '逐条约束，标明来源（题目给定/假设引入）' },
      { key: 'domain', label: '决策变量与求解域', hint: '变量取值范围、整数性、边界' }
    ],
    rubric: {
      points: ['符号与假设表一致', '约束完整无遗漏', '量纲平衡'],
      pitfalls: ['约束写一半', '目标函数与问题不符', '变量定义含糊']
    }
  },
  {
    id: 6,
    key: 'solve',
    title: '求解实现',
    output: '可运行代码与求解结果',
    focus: '学生自己补关键行，教练只问实现思路与结果合理性，不代写整段',
    blocking: true,
    fields: [
      { key: 'approach', label: '求解思路', hint: '算法/库、为什么可行、预期规模与耗时' },
      { key: 'result', label: '结果解读', hint: '最优值、耗时、结果是否合题意，异常值怎么解释' }
    ],
    rubric: {
      points: ['代码可复现', '结果有量纲解释', '与常识或上界做对照'],
      pitfalls: ['只贴代码不解读', '收敛未验证就报结果', '随机种子不固定']
    }
  },
  {
    id: 7,
    key: 'sensitivity',
    title: '灵敏度与稳健性检验',
    output: '参数扰动表与结论',
    focus: '追问扰动幅度怎么选、结论会不会翻转，这是评分表里的稳健性项',
    blocking: true,
    fields: [
      { key: 'design', label: '检验设计', hint: '扰动哪些参数、幅度、为什么这么取' },
      { key: 'table', label: '扰动结果', hint: '参数-结果对照表，或图' },
      { key: 'conclusion', label: '稳健性结论', hint: '结论在多大范围内不变，哪里会翻转' }
    ],
    rubric: {
      points: ['扰动有依据', '结论随参数的变化被量化', '指出模型失效边界'],
      pitfalls: ['只扰动一个参数', '幅度随手取 10%', '把"结果变化不大"当结论不给数据']
    }
  },
  {
    id: 8,
    key: 'analyze',
    title: '结果分析与图表',
    output: '图表规范且被正文引用',
    focus: '检查每张图是否被正文引用、是否回答了问题，而不是装饰',
    blocking: false,
    fields: [
      { key: 'figures', label: '图表清单', hint: '图/表编号 + 它回答哪个小问' },
      { key: 'insight', label: '结果解释', hint: '业务含义、与直觉是否冲突、冲突怎么解释' }
    ],
    rubric: {
      points: ['图表编号且被正文引用', '结论回扣问题', '有对比基准'],
      pitfalls: ['图堆在正文没有引用', '只描述图形不解释含义', '坐标轴无单位']
    }
  },
  {
    id: 9,
    key: 'abstract',
    title: '摘要训练',
    output: '三段式摘要（问题-方法-结论）',
    focus: '国赛评奖第一道门槛是摘要，教练逐句追问"方法具体到什么、结论有没有数值"',
    blocking: true,
    fields: [
      { key: 'abstract', label: '摘要正文', hint: '问题、方法（含关键模型名与求解器）、结论（含具体数值）' },
      { key: 'keywords', label: '关键词', hint: '3-5 个，与正文模型对应' }
    ],
    rubric: {
      points: ['每问都覆盖', '方法写到具体模型名', '结论给数值不空泛'],
      pitfalls: ['摘要只写"本文建立了模型"没有结果', '关键词与正文无关', '超长或漏问']
    }
  },
  {
    id: 10,
    key: 'assemble',
    title: '全文组装与编译',
    output: '无 error 的 PDF',
    focus: '对照提交前清单逐项核对：页数、公式编号、图表引用、参考文献',
    blocking: true,
    fields: [
      { key: 'checklist', label: '提交前自查', hint: '页数/编号/图引用/参考文献/匿名要求逐项打勾说明' }
    ],
    rubric: {
      points: ['编译 0 error', '图表编号连续且被引用', '参考文献格式统一'],
      pitfalls: ['图溢出页边', '公式无编号', '参考文献有引无列或有列无引']
    }
  },
  {
    id: 11,
    key: 'disclosure',
    title: 'AI 使用详情导出',
    output: '《AI 工具使用详情.pdf》',
    focus: '核对使用记录是否覆盖每次提示升级与每次采纳示例，与正文实际情况一致',
    blocking: true,
    fields: [
      { key: 'review', label: '记录复核', hint: '有无遗漏的 AI 参与环节；哪些结论是自己核实过的' }
    ],
    rubric: {
      points: ['工具名称/版本/用途/交互过程齐全', '采纳示例的位置可追溯', '学生已核实结论'],
      pitfalls: ['漏记提示升级', '直接采用未核实的 AI 结果（按 2026 试行规定可取消评奖资格）']
    }
  }
]

export function stageById(id: number): StageDef | undefined {
  return STAGES.find((s) => s.id === id)
}

export function stageByKey(key: string): StageDef | undefined {
  return STAGES.find((s) => s.key === key)
}
