import type { CandidateModelInfo } from './guidedQuiz'

/**
 * 赛题各小问数学模型池与第一性原理深度教学解析引擎
 * 针对每个小问，剖析主力推荐模型、基准对照模型 (Baseline) 与高阶对冲稳健模型，
 * 提供适用场景判断法则、完整 KaTeX 数学公式、附件数据落地映射与评委避坑指南。
 */

export function buildMicrogridCandidateModels(
  questionIdx: number,
  briefText: string
): CandidateModelInfo[] {
  const isQ2 = questionIdx === 2 || /紧急购电|5\s*倍|波动|result2/i.test(briefText)
  const isQ3 = questionIdx === 3 || /滚动|更新|未来\s*24\s*小时/i.test(briefText)

  if (isQ2) {
    return [
      {
        id: 'tsp-q2',
        name: '两阶段随机规划模型 (Two-Stage Stochastic Programming - TSP)',
        aka: '两阶段随机规划 / 计划购电与 5 倍缺电惩罚期望折中模型',
        role: 'primary',
        roleBadge: '⭐ 主力推荐模型 (契合度 98%)',
        suitabilityScore: 98,
        fitReason:
          '严格契合“事前 0:00 决策确定性日前计划，事后实时针对光伏负荷随机波动承担 5 倍高额紧急购电惩罚”的因果时间序',
        applicableScenarios: {
          problemTypes: [
            '含不确定性扰动与非对称惩罚的多时段资源调度',
            '第一阶段决策不可推翻、第二阶段具备实时纠偏或惩罚补偿机制',
            '具有概率情景分布 (Scenarios) 的风险决策规划'
          ],
          whenToUse:
            '题面明确将决策分为事前确定性申报（日前计划）和事后随机波动场景下的追加采购/惩罚，且惩罚代价高昂（如 5 倍电价）时，两阶段随机规划是国际公认的黄金标准模型。',
          whenNotToUse:
            '当不确定性变量没有任何概率分布或历史样本支持，完全处于“未知之未知”时，或者场景数过大导致求解矩阵不可接受时，需转用鲁棒优化或采样近似 (SAA)。',
          prosAndCons: {
            pros: [
              '理论体系完备，能够精确刻画期望成本最低的风险中性决策',
              '可直观量化信息价值 (EVPI) 与随机解的价值 (VSS)',
              '能直接转化并利用成熟的商业规划求解器 (CBC / HiGHS / Gurobi) 快速求解'
            ],
            cons: [
              '场景数量过多时约束规模按场景数倍增，需采用 Benders 分解或场景削减技术',
              '对概率分布假设较为依赖，在极端小概率灾害场景下可能面临尾部风险'
            ]
          }
        },
        mathFormulation: {
          overview:
            '第一阶段在 0:00 决策确定性的全天计划购电向量 P_plan(t)；第二阶段在随机场景 ω 显现后，根据光伏和负荷的真实观测，调度蓄电池并计算 5 倍电价紧急购电量 P_emer^ω(t)。',
          variables: [
            {
              symbol: 'P_{plan}(t)',
              name: '第一阶段决策：时段 t 计划购电功率 (kW)',
              physicalMeaning: '日前向外部电网申报的确定性购电基线，按正常分时电价结算',
              domain: 'P_{plan}(t) \\ge 0, \\; t \\in \\{1, \\dots, 24\\}'
            },
            {
              symbol: 'P_{emer}^{\\omega}(t)',
              name: '第二阶段决策：场景 ω 下时段 t 紧急购电功率 (kW)',
              physicalMeaning: '实时供电不足时被迫采购的高价电量，承担 5 倍正常电价惩罚',
              domain: 'P_{emer}^{\\omega}(t) \\ge 0'
            },
            {
              symbol: 'P_{ch}^{\\omega}(t), P_{dis}^{\\omega}(t)',
              name: '场景 ω 下蓄电池充放电功率 (kW)',
              physicalMeaning: '应对场景 ω 实时能量波动而调整的储能动作',
              domain: '0 \\le P_{ch}^{\\omega}(t), P_{dis}^{\\omega}(t) \\le 5000'
            },
            {
              symbol: 'E^{\\omega}(t)',
              name: '场景 ω 下蓄电池荷电状态 (kWh)',
              physicalMeaning: '储能系统内部能量演化轨迹',
              domain: '0 \\le E^{\\omega}(t) \\le 12000'
            }
          ],
          objectiveLatex:
            '\\min_{P_{plan}} \\quad \\sum_{t=1}^{24} C_{grid}(t) P_{plan}(t) \\Delta t + \\sum_{\\omega \\in \\Omega} \\pi_\\omega \\left[ \\sum_{t=1}^{24} 5 C_{grid}(t) P_{emer}^{\\omega}(t) \\Delta t \\right]',
          objectiveDesc:
            '目标函数第一项为确定性计划购电成本；第二项为所有随机场景下 5 倍高额紧急购电惩罚代价的数学期望（π_ω 为场景 ω 的发生概率）。',
          constraints: [
            {
              name: '场景能量平衡与紧急购电触发',
              latex:
                'P_{plan}(t) + P_{emer}^{\\omega}(t) + P_{pv}^{\\omega}(t) + P_{dis}^{\\omega}(t) = P_{load}^{\\omega}(t) + P_{ch}^{\\omega}(t), \\quad \\forall t, \\omega',
              physicalMeaning:
                '当计划购电加光伏与储能不足以覆盖负荷时，必须通过紧急购电补齐缺额，严禁出现供电缺口'
            },
            {
              name: '场景下储能动态演化与闭环',
              latex:
                'E^{\\omega}(t) = E^{\\omega}(t-1) + \\left( 0.9 P_{ch}^{\\omega}(t) - \\frac{P_{dis}^{\\omega}(t)}{0.9} \\right) \\Delta t, \\quad E^{\\omega}(0) = E^{\\omega}(24), \\quad \\forall \\omega',
              physicalMeaning:
                '在每个场景下，电池都必须严格遵循 90% 充放电损耗与 0:00 与 24:00 始末能量闭环'
            },
            {
              name: '计划购电非负性与设备容量界限',
              latex:
                '0 \\le P_{ch}^{\\omega}(t) \\le 5000 u_{ch}^{\\omega}(t), \\quad 0 \\le P_{dis}^{\\omega}(t) \\le 5000 u_{dis}^{\\omega}(t), \\quad u_{ch}^{\\omega}(t) + u_{dis}^{\\omega}(t) \\le 1',
              physicalMeaning: '每个场景下均不可同时充放电，功率不超 5000 kW 上限'
            }
          ],
          matrixForm:
            '\\min \\mathbf{c}^T \\mathbf{x} + \\sum_{\\omega} \\pi_\\omega \\mathbf{q}^T \\mathbf{y}_\\omega \\quad \\text{s.t.} \\quad \\mathbf{T}_\\omega \\mathbf{x} + \\mathbf{W} \\mathbf{y}_\\omega = \\mathbf{h}_\\omega'
        },
        practicalMapping: {
          dataInputs: [
            '附件 1 分时电价表 C_grid(t)',
            '附录 1/附件 2 历史负荷与光伏数据：利用 K-Means 聚类或 Monte Carlo 采样生成代表性场景集 Ω',
            '题目规定的 4 个测试日数据：带入模型直接输出四个日期的紧急购电量并填入 result2.xlsx 表 3'
          ],
          solverRecommendation:
            'Python PuLP 或 SciPy MILP。对于 5~10 个典型日场景，决策变量约几百个，HiGHS 求解器在 1 秒内即可完成全局求解。',
          pythonSnippet: `# 两阶段随机规划核心结构
import pulp

prob = pulp.LpProblem("TwoStage_Microgrid_Q2", pulp.LpMinimize)
T = 24
scenarios = load_representative_scenarios() # 历史波动代表场景
P_plan = [pulp.LpVariable(f"P_plan_{t}", lowBound=0) for t in range(T)]

obj = pulp.lpSum([C_grid[t] * P_plan[t] for t in range(T)])
for s_idx, s in enumerate(scenarios):
    prob_s = s['prob']
    for t in range(T):
        P_emer = pulp.LpVariable(f"P_emer_s{s_idx}_{t}", lowBound=0)
        # 5 倍紧急购电惩罚期望项
        obj += prob_s * 5.0 * C_grid[t] * P_emer
        # 添加能量平衡约束...
prob += obj`
        },
        pitfallsAndTips: [
          '【严重失分】直接拿均值当确定性数据跑问题 1 的简单模型，完全忽视 5 倍电价惩罚对极端时刻的毁灭性打击',
          '【格式规范】计算完成后务必按照赛题表 3 的规范格式导出 4 个指定日期的紧急购电量至 result2.xlsx',
          '【加分项】在论文中计算随机解价值 (VSS = EEV - RP)，用数字证明两阶段随机规划比简单均值规划节省了多少万元'
        ]
      },
      {
        id: 'cvar-q2',
        name: '条件风险价值模型 (CVaR - Conditional Value at Risk)',
        aka: 'CVaR 风险度量优化 / 极端损失尾部风险控制模型',
        role: 'defense',
        roleBadge: '🛡️ 稳健对冲拓展 (特等奖拔高项)',
        suitabilityScore: 95,
        fitReason:
          '5 倍紧急购电惩罚具有强烈的“长尾极端损失”特性，CVaR 能够有效控制最恶劣 α 分位数的尾部损失',
        applicableScenarios: {
          problemTypes: [
            '对极端灾害天气或巨额惩罚具有强烈风险厌恶特征的资产/能源配置',
            '带有单向不对称巨大违约金或惩罚成本的工程决策',
            '多目标权衡：预期成本最小 vs 极端尾部风险最小'
          ],
          whenToUse:
            '当决策者不仅关心平均购电费用，更担心在某些极端阴雨或负荷突增日发生巨额 5 倍罚款导致微网运营破产时，引入 Rockafellar-Uryasev 线性化 CVaR 模型是数模竞赛顶级论文的标配。',
          whenNotToUse:
            '如果赛题出题人只要求统计平均期望最低且明确为风险中性，则标准随机规划足矣；CVaR 适合作为对冲稳健性章节加分呈现。',
          prosAndCons: {
            pros: [
              '一致性风险度量 (Coherent Risk Measure)，满足凸性与次可加性，数学性质极佳',
              '通过 Rockafellar 辅助变量技巧可严格线性化为 LP/MILP，计算复杂度极低',
              '可通过调节风险偏好系数 β 绘制出精美的帕累托有效前沿面 (Pareto Frontier)'
            ],
            cons: [
              '置信度参数 α（如 0.95）与风险厌恶权重 β 属于超参数，需要做灵敏度分析'
            ]
          }
        },
        mathFormulation: {
          overview:
            '在总费用期望值的基础上，叠加置信水平 α 下的条件风险价值 CVaR_α，以辅助变量 γ 与各场景尾部超额损失 d_ω 将其线性化。',
          variables: [
            {
              symbol: '\\gamma',
              name: '在险价值 VaR 阈值辅助变量',
              physicalMeaning: '损失分布在置信度 α 下的分位数边界',
              domain: '\\gamma \\in \\mathbb{R}'
            },
            {
              symbol: 'd_\\omega',
              name: '场景 ω 超过 VaR 的尾部超额损失',
              physicalMeaning: '刻画极端恶劣场景下的高额罚款溢出量',
              domain: 'd_\\omega \\ge 0'
            },
            {
              symbol: '\\beta',
              name: '决策者风险厌恶权重系数',
              physicalMeaning: '权衡期望成本与尾部风险的偏好因子',
              domain: '\\beta \\in [0, 1]'
            }
          ],
          objectiveLatex:
            '\\min \\quad (1 - \\beta) \\mathbb{E}[\\text{Cost}] + \\beta \\left( \\gamma + \\frac{1}{1 - \\alpha} \\sum_{\\omega \\in \\Omega} \\pi_\\omega d_\\omega \\right)',
          objectiveDesc:
            '第一部分为综合购电费用期望；第二部分为 Rockafellar-Uryasev 线性化的 CVaR 风险损失表达式。',
          constraints: [
            {
              name: '尾部超额损失非负线性约束',
              latex: 'd_\\omega \\ge \\text{Cost}_\\omega - \\gamma, \\quad d_\\omega \\ge 0, \\quad \\forall \\omega',
              physicalMeaning:
                '当场景 ω 的实际购电成本超过分位数 γ 时，d_ω 记录其溢出差额，否则为 0'
            }
          ]
        },
        practicalMapping: {
          dataInputs: ['结合问题 2 四个指定日期的真实波动场景进行风险前沿拟合'],
          solverRecommendation: 'SciPy / PuLP 线性规划求解器',
          pythonSnippet: `# CVaR 线性化构造
alpha = 0.95
beta = 0.3 # 风险厌恶程度
gamma = pulp.LpVariable("gamma")
d = [pulp.LpVariable(f"d_{i}", lowBound=0) for i in range(n_scenarios)]
# 约束：d_i >= Cost_i - gamma
for i in range(n_scenarios):
    prob += d[i] >= cost_scenario[i] - gamma
cvar = gamma + (1.0 / (1.0 - alpha)) * pulp.lpSum([p[i] * d[i] for i in range(n_scenarios)])
prob += (1 - beta) * expected_cost + beta * cvar`
        },
        pitfallsAndTips: [
          '【高分亮点】在论文中改变 β 从 0 逐步增加到 1，绘制“期望费用 - 极端风险”帕累托权衡曲线，评委极为赏识'
        ]
      },
      {
        id: 'margin-q2',
        name: '确定性安全裕度备用规划 (Deterministic Margin Reserve)',
        aka: '比例安全裕度模型 / 启发式冗余备用 Baseline',
        role: 'baseline',
        roleBadge: '📊 基准对照模型 (Baseline)',
        suitabilityScore: 84,
        fitReason: '工业界最常用的工程兜底经验策略，作为与两阶段随机规划对比的标准基准组',
        applicableScenarios: {
          problemTypes: ['基准对照实验设计', '工程无优化器条件下的经验调控'],
          whenToUse:
            '在日前计划中人工将预测负荷上浮 15%~25% 作为安全裕度采购，以防止突发缺电被罚。将其写入论文作为对照组。',
          whenNotToUse: '不可作为主力推荐方案，因为人为设定的固定比例裕度缺乏动态自适应能力。',
          prosAndCons: {
            pros: ['无需场景抽样，直接沿用确定性 MILP 即可求解，计算极简'],
            cons: ['容易产生“晴天严重过度购电、阴天依然缺电被罚”的双重失误，综合费用偏高']
          }
        },
        mathFormulation: {
          overview: '将日前输入负荷修正为 P_load_safe(t) = (1 + k) P_load(t)，求解确定性计划。',
          variables: [
            {
              symbol: 'k',
              name: '人工安全裕度系数',
              physicalMeaning: '为应对不确定性而预先增加的计划冗余比例',
              domain: 'k \\in [0.10, 0.25]'
            }
          ],
          objectiveLatex:
            '\\min \\sum_{t=1}^{24} C_{grid}(t) P_{plan}^{margin}(t) \\Delta t \\quad \\text{s.t.} \\quad P_{plan} + P_{pv} + P_{dis} \\ge (1+k) P_{load} + P_{ch}',
          objectiveDesc: '在放大后的负荷曲线上运行标准 MILP。',
          constraints: [
            {
              name: '虚增负荷平衡',
              latex: 'P_{plan}(t) \\ge (1+k) P_{load}(t) - P_{pv}(t) - P_{dis}(t) + P_{ch}(t)',
              physicalMeaning: '强行垫高计划基准线以减少事后紧急购电概率'
            }
          ]
        },
        practicalMapping: {
          dataInputs: ['附件 1、附录 1 负荷数据'],
          solverRecommendation: '标准 MILP 求解器'
        },
        pitfallsAndTips: [
          '对比说明：论文中展示虽然安全裕度模型降低了紧急购电次数，但全天正常计划购电费用大幅虚高，总体经济效益显著劣于两阶段随机规划。'
        ]
      }
    ]
  }

  if (isQ3) {
    return [
      {
        id: 'mpc-q3',
        name: '模型预测控制 / 滚动时域规划 (Model Predictive Control - MPC / RH-MILP)',
        aka: '滚动时域优化 / 动态预报闭环反馈控制模型',
        role: 'primary',
        roleBadge: '⭐ 主力推荐模型 (契合度 98%)',
        suitabilityScore: 98,
        fitReason:
          '完美对应题目在 0:00、6:00、12:00、18:00 动态更新光伏预测的设定，基于最新预报进行有限时域滚动优化与闭环校正',
        applicableScenarios: {
          problemTypes: [
            '预测信息随时间推进多频次刷新（如短临气象/负荷预报）的时序动态控制',
            '带有前馈预测与后向状态反馈闭环的复杂时变物理系统',
            '在扰动环境下仍需严格维持能量平衡与物理守恒的连续调度'
          ],
          whenToUse:
            '当题目给出了多个时间节点的动态刷新预报（如 6:00、12:00 等），出题人意图是考察参赛者是否具备“滚动时域反馈控制”思维，而不是一次性死板开环求解。',
          whenNotToUse:
            '当系统没有任何后续信息更新（纯静态开环）、或时变更新延迟极长（大于决策周期）时不需要滚动。',
          prosAndCons: {
            pros: [
              '动态吸收最新光伏预测信息，逐步收窄长周期预测误差带来的负面影响',
              '闭环反馈机制：每次重新优化时以当前时刻电池真实剩余电量 E(τ) 为初始状态，天然具备自纠偏能力',
              '算法结构清晰，每个滚动步本质上都是一个缩短时域的 MILP，求解难度可控'
            ],
            cons: [
              '需要按刷新时段分步迭代求解 4 次，代码需要妥善处理时序数据拼接与状态传递',
              '必须处理终点时界对齐问题，确保 24:00 时蓄电池依然能回到始发储电量 E(0)'
            ]
          }
        },
        mathFormulation: {
          overview:
            '在更新时刻 τ ∈ {0, 6, 12, 18}，以当前实测储电量 E_real(τ) 为初始条件，将剩余时间窗口 [τ, 24] 内的最优调度建立为一个时域长度为 24-τ 的 MILP，求解后仅将 [τ, τ+6] 的决策作为实际执行量。',
          variables: [
            {
              symbol: '\\tau',
              name: '动态更新时间节点',
              physicalMeaning: '光伏预测刷新的时刻',
              domain: '\\tau \\in \\{0, 6, 12, 18\\}'
            },
            {
              symbol: 'P_{buy}^{\\tau}(t)',
              name: '在时刻 τ 规划的未来时段 t 购电功率',
              physicalMeaning: '基于时刻 τ 最新预报求解出的计划值',
              domain: 't \\in \\{\\tau, \\dots, 24\\}'
            },
            {
              symbol: 'E_{init}(\\tau)',
              name: '时刻 τ 的初始荷电状态反馈值',
              physicalMeaning: '前一时段实际执行结束后的真实电池留存量',
              domain: '0 \\le E_{init}(\\tau) \\le 12000'
            }
          ],
          objectiveLatex:
            '\\min \\quad \\sum_{t=\\tau}^{24} C_{grid}(t) P_{buy}^{\\tau}(t) \\Delta t',
          objectiveDesc:
            '在每个滚动控制步长内，仅针对剩余时域 [τ, 24] 进行购电成本最小化优化。',
          constraints: [
            {
              name: '实时状态初始值锚定（闭环反馈）',
              latex: 'E^{\\tau}(\\tau) = E_{real}(\\tau)',
              physicalMeaning: '用真实物理状态替换开环推算值，彻底消灭前 6 小时的累计偏差'
            },
            {
              name: '未来时段功率平衡与演化',
              latex:
                'P_{buy}^{\\tau}(t) + P_{pv}^{forecast,\\tau}(t) + P_{dis}^{\\tau}(t) = P_{load}(t) + P_{ch}^{\\tau}(t), \\quad \\forall t \\ge \\tau',
              physicalMeaning: '采用时刻 τ 最新给出的高精度光伏预测数据序列进行供需平衡'
            },
            {
              name: '终点时界 24:00 守恒闭环硬约束',
              latex: 'E^{\\tau}(24) = E(0)',
              physicalMeaning:
                '无论何时滚动更新，24:00 时刻的最终储电量都必须强制回归到全天起点 E(0)'
            }
          ]
        },
        practicalMapping: {
          dataInputs: [
            '附件中给出的 4 次更新光伏预测时序文件（0:00、6:00、12:00、18:00 各自对应的最新预测曲线）',
            '将前一个 6 小时步长的模拟执行结果作为下一个步长的输入'
          ],
          solverRecommendation:
            '在 Python 脚本中使用循环依次调用 4 次 MILP 求解器，状态顺次传递',
          pythonSnippet: `# MPC 滚动时域优化框架
E_current = E_0 # 初始储能量
execution_log = []

for tau in [0, 6, 12, 18]:
    # 提取时刻 tau 刷新的未来光伏预测序列
    pv_forecast = get_forecast_at(tau)
    horizon_hours = range(tau, 24)
    
    # 建立剩余时间窗的优化模型，初始状态设为 E_current
    sub_prob = build_sub_milp(horizon_hours, init_E=E_current, pv=pv_forecast, end_E=E_0)
    sub_prob.solve()
    
    # 仅执行未来 6 小时动作，更新真实状态 E_current
    E_current = simulate_next_6h(sub_prob, tau)`
        },
        pitfallsAndTips: [
          '【致命错误】在滚动优化时忘记约束 24:00 回到 E(0)，导致后面步长电池乱放电',
          '【对比论证】在论文中对比“开环静态调度（不更新）”与“闭环滚动调度（更新）”的费用差异，用折线图证明预报刷新带来的显著经济节约效益'
        ]
      },
      {
        id: 'openloop-baseline-q3',
        name: '开环静态基准调度 (Open-Loop Static Baseline)',
        aka: '单次静态规划 / 无刷新对照基线',
        role: 'baseline',
        roleBadge: '📊 基准对照模型 (Baseline)',
        suitabilityScore: 80,
        fitReason: '用于量化证明“滚动时域动态更新”到底降低了多少购电成本与弃光率',
        applicableScenarios: {
          problemTypes: ['对照实验设计'],
          whenToUse:
            '全天仅在 0:00 依据初始粗糙预报做一次规划，后续即使气象刷新也绝不修改。作为对照组写入论文。',
          whenNotToUse: '不可作为主力提交方案。',
          prosAndCons: {
            pros: ['只需计算一次，无滚动迭代机制'],
            cons: ['光伏出现剧烈预报偏差时，系统无法纠偏，被迫产生大量弃光或紧急缺电惩罚']
          }
        },
        mathFormulation: {
          overview: '直接沿用问题 1 的静态单次求解方案。',
          variables: [],
          objectiveLatex: '\\min \\sum_{t=1}^{24} C_{grid}(t) P_{buy}^{static}(t) \\Delta t',
          objectiveDesc: '只用 0:00 初始数据做一次性开环推演。',
          constraints: []
        },
        practicalMapping: {
          dataInputs: ['0:00 初始预测数据'],
          solverRecommendation: '标准 MILP 求解器'
        },
        pitfallsAndTips: [
          '用于在论文成果表中对比：展示开环基准调度因预报偏差导致的弃光量与额外开销'
        ]
      }
    ]
  }

  // 问题 1 (默认情况)
  return [
    {
      id: 'milp-q1',
      name: '混合整数线性规划模型 (MILP)',
      aka: 'Mixed-Integer Linear Programming / 状态互斥与能量连续调度',
      role: 'primary',
      roleBadge: '⭐ 主力推荐模型 (契合度 98%)',
      suitabilityScore: 98,
      fitReason:
        '24 小时各时段购电量与储能状态连续变化，0-1 状态变量严格封杀充放同发违例，商业求解器秒级求得全局最优解',
      applicableScenarios: {
        problemTypes: [
          '多时段能量连续流动与分时电价调度优化',
          '含设备互斥运行状态 (0-1 变量) 的最优化配置',
          '具有严格容量与始末守恒硬约束的线性规划'
        ],
        whenToUse:
          '题干给出分时电价、已知负荷与光伏出力，目标函数与物理约束皆可表征为线性方程，且电池具有“不能同时充放电”等离散逻辑约束时，MILP 是数模国赛与美赛的绝对第一主力模型。',
        whenNotToUse:
          '当目标函数存在不可线性化的强非线性项（如高阶非线性电池内阻发热损失方程）或黑盒仿真模拟器时不能直接使用，需先做分段线性化近似。',
        prosAndCons: {
          pros: [
            '保证数学上的全局最优解，不存在启发式算法的局部极值陷阱',
            '求解速度极快（通常 < 0.2 秒），支持输出对偶边际价格进行灵敏度分析',
            '国赛评委认可度最高，公式推导严谨规范，易获一等奖'
          ],
          cons: [
            '充放电效率需设定为恒定常数（如 90%），难以精确刻画变功率非线性损耗曲线',
            '若时段划分过细（如按分钟离散），0-1 变量激增可能导致分支定界耗时上升'
          ]
        }
      },
      mathFormulation: {
        overview:
          '以全天 24 小时总购电费用最小为目标函数，联立实时供需能量平衡、储能荷电状态动态演化方程、充放电互斥约束与始末闭环守恒条件。',
        variables: [
          {
            symbol: 'P_{buy}(t)',
            name: '时段 t 外部电网计划购电功率',
            physicalMeaning: '微网向主电网采购的电功率，决定直接购电成本',
            domain: 'P_{buy}(t) \\ge 0, \\; t \\in \\{1, \\dots, 24\\}'
          },
          {
            symbol: 'P_{ch}(t)',
            name: '时段 t 蓄电池充电功率',
            physicalMeaning: '流入储能系统的充入电功率',
            domain: '0 \\le P_{ch}(t) \\le 5000\\text{ kW}'
          },
          {
            symbol: 'P_{dis}(t)',
            name: '时段 t 蓄电池放电功率',
            physicalMeaning: '储能系统流出的向负荷供电功率',
            domain: '0 \\le P_{dis}(t) \\le 5000\\text{ kW}'
          },
          {
            symbol: 'E(t)',
            name: '时段 t 结束时蓄电池储电量',
            physicalMeaning: '蓄电池系统内部实时留存的电能 (kWh)',
            domain: '0 \\le E(t) \\le 12000\\text{ kWh}'
          },
          {
            symbol: 'u_{ch}(t), u_{dis}(t)',
            name: '充放电状态指示 0-1 变量',
            physicalMeaning: '防止电池在同一时段一边充电一边放电导致物理短路或虚假损耗',
            domain: 'u_{ch}(t), u_{dis}(t) \\in \\{0, 1\\}'
          }
        ],
        objectiveLatex:
          '\\min_{P_{buy}, P_{ch}, P_{dis}} \\quad Z = \\sum_{t=1}^{24} C_{grid}(t) \\cdot P_{buy}(t) \\cdot \\Delta t',
        objectiveDesc:
          '式中 C_{grid}(t) 为附件 1 规定的分时购电单价（谷时 0.25 元/kWh、平时 0.53 元/kWh、峰时 0.82 元/kWh 等），\\Delta t = 1\\text{ h}。',
        constraints: [
          {
            name: '实时供需平衡约束',
            latex:
              'P_{buy}(t) + P_{pv}(t) + P_{dis}(t) = P_{load}(t) + P_{ch}(t), \\quad \\forall t',
            physicalMeaning:
              '在任意时刻 t，微网输入总功率（购电+光伏+放电）必须严格等于输出总需求（负荷+充电），杜绝供电不足或电能凭空湮灭'
          },
          {
            name: '储能荷电状态动态演化方程',
            latex:
              'E(t) = E(t-1) + \\left( \\eta_{ch} P_{ch}(t) - \\frac{P_{dis}(t)}{\\eta_{dis}} \\right) \\Delta t, \\quad \\forall t',
            physicalMeaning:
              '严格遵循物理充放电损耗（η=90%）：充电时仅有 90% 能量存入电池；放电供负荷时电池内部需消耗 1/90% 能量'
          },
          {
            name: '充放电互斥与设备出力上下限',
            latex:
              '0 \\le P_{ch}(t) \\le u_{ch}(t) P_{\\max}, \\quad 0 \\le P_{dis}(t) \\le u_{dis}(t) P_{\\max}, \\quad u_{ch}(t) + u_{dis}(t) \\le 1',
            physicalMeaning:
              '二元互斥约束保证系统在任意时段只能处于【充电】、【放电】或【待机】三种物理合法状态之一'
          },
          {
            name: '首尾能量循环闭环约束',
            latex: 'E(0) = E(24)',
            physicalMeaning:
              '题目硬性规定：0:00 与 24:00 蓄电池储电量必须严格相等，防止系统透支电池原有库存电量进行虚假套利'
          },
          {
            name: '储能容量安全物理边界',
            latex: '0 \\le E(t) \\le E_{\\max} = 12000\\text{ kWh}, \\quad \\forall t',
            physicalMeaning: '严防储能系统过充导致安全事故或过放损坏电池'
          }
        ],
        matrixForm:
          '\\min \\mathbf{c}^T \\mathbf{x} \\quad \\text{s.t.} \\quad \\mathbf{A}_{eq} \\mathbf{x} = \\mathbf{b}_{eq}, \\quad \\mathbf{A} \\mathbf{x} \\le \\mathbf{b}, \\quad \\mathbf{x}_{bin} \\in \\{0, 1\\}'
      },
      practicalMapping: {
        dataInputs: [
          '附件 1 分时电价表：提取 24 小时单价向量 C_grid',
          '附录 1 / 附件 2 时序数据：提取负荷向量 P_load 与光伏出力 P_pv',
          '储能额定参数：E_max = 12000 kWh, P_max = 5000 kW, η = 0.90'
        ],
        solverRecommendation:
          'Python PuLP 库（自带 CBC 求解器）或 SciPy 1.9+ scipy.optimize.milp（基于 HiGHS 求解器），均可在 0.1 秒内输出最优解',
        pythonSnippet: `import pulp

prob = pulp.LpProblem("Microgrid_Dispatch_Q1", pulp.LpMinimize)
T = 24
# 决策变量
P_buy = [pulp.LpVariable(f"P_buy_{t}", lowBound=0) for t in range(T)]
P_ch = [pulp.LpVariable(f"P_ch_{t}", 0, 5000) for t in range(T)]
P_dis = [pulp.LpVariable(f"P_dis_{t}", 0, 5000) for t in range(T)]
u_ch = [pulp.LpVariable(f"u_ch_{t}", cat="Binary") for t in range(T)]
u_dis = [pulp.LpVariable(f"u_dis_{t}", cat="Binary") for t in range(T)]
E = [pulp.LpVariable(f"E_{t}", 0, 12000) for t in range(T + 1)]

# 目标函数：总购电费用最小
prob += pulp.lpSum([C_grid[t] * P_buy[t] for t in range(T)])

# 约束方程
prob += (E[0] == E[T]) # 0:00 与 24:00 闭环
for t in range(T):
    prob += (P_buy[t] + P_pv[t] + P_dis[t] == P_load[t] + P_ch[t])
    prob += (E[t+1] == E[t] + 0.9 * P_ch[t] - P_dis[t] / 0.9)
    prob += (P_ch[t] <= 5000 * u_ch[t])
    prob += (P_dis[t] <= 5000 * u_dis[t])
    prob += (u_ch[t] + u_dis[t] <= 1)
prob.solve()
print("最小购电费用:", pulp.value(prob.objective))`
      },
      pitfallsAndTips: [
        '【致命硬伤】遗漏 E(0) = E(24) 约束，会被评委直接判定为结果不可行并扣除大分',
        '【常见符号错误】放电项损耗写成了乘以 η 而非除以 η（放电时负荷端获得 1 单位电能，电池内部必须扣减 1/0.9 ≈ 1.111 单位）',
        '【论文拔高建议】在论文第四节附上 Baseline 对比表，证明 MILP 调度比无储能经验调度节省费用 20% 以上'
      ]
    },
    {
      id: 'greedy-baseline-q1',
      name: '分时电价启发式贪心规则模型 (Greedy Heuristic Baseline)',
      aka: 'Rule-Based Peak-Valley Greedy Baseline / 经验调度基线',
      role: 'baseline',
      roleBadge: '📊 基准对照模型 (Baseline)',
      suitabilityScore: 82,
      fitReason:
        '用于在论文第 4 节提供可量化的对照组，证明主力 MILP 模型相较于传统经验调度到底为小区省了多少钱',
      applicableScenarios: {
        problemTypes: [
          '基准对照实验设计',
          '算力受限或无数学规划库环境下的快速近似求解'
        ],
        whenToUse:
          '谷时段强行全功率充电至满仓，峰时段全力放电至空仓，平时段维持待机。作为基准组写入论文，衬托主力算法的先进性。',
        whenNotToUse:
          '不能作为最终递交给评委的主力模型，因为贪心算法缺乏时序前瞻性，总购电费用显著高于理论全局最优解。',
        prosAndCons: {
          pros: [
            '无需任何第三方优化器，逻辑直观，计算耗时仅为几毫秒',
            '能够作为稳固的底线基准（Lower Baseline），为论文提供充分的对比数据'
          ],
          cons: [
            '缺乏全局时空协同，经常导致电池在谷电价还没结束时就充满，或者在峰电价尚未达到最高点时就提前放空',
            '全天总购电费用比 MILP 高出 15%~25%'
          ]
        }
      },
      mathFormulation: {
        overview:
          '按时段电价分级设定充放电优先级状态机，非全局优化，属于分段逻辑判定。',
        variables: [
          {
            symbol: 'P_{ch}^{rule}(t)',
            name: '规则充电功率',
            physicalMeaning: '当电价处于全天谷值时设为最大充电能力',
            domain: 'P_{ch}^{rule}(t) \\in \\{0, 5000\\}'
          },
          {
            symbol: 'P_{dis}^{rule}(t)',
            name: '规则放电功率',
            physicalMeaning: '当电价处于全天峰值时设为最大放电能力',
            domain: 'P_{dis}^{rule}(t) \\in \\{0, 5000\\}'
          }
        ],
        objectiveLatex:
          '\\text{Cost}_{baseline} = \\sum_{t=1}^{24} C_{grid}(t) \\cdot \\max(0, P_{load}(t) + P_{ch}^{rule}(t) - P_{pv}(t) - P_{dis}^{rule}(t))',
        objectiveDesc: '被动计算各时段能量缺额并全额购电，目标为事后核算指标。',
        constraints: [
          {
            name: '状态机逻辑判定',
            latex:
              'P_{ch}^{rule}(t) = \\begin{cases} 5000, & C_{grid}(t) = \\min(C_{grid}) \\\\ 0, & \\text{otherwise} \\end{cases}',
            physicalMeaning: '纯经验式电价驱动，无视后序时段负荷动态'
          }
        ]
      },
      practicalMapping: {
        dataInputs: ['附件 1 分时电价、附录 1 负荷与光伏数据'],
        solverRecommendation: 'Python 原生循环判定'
      },
      pitfallsAndTips: [
        '在论文中呈现时务必指出：启发式贪心因未考虑后续时段的高峰持续时长，造成了电池电量的盲目透支'
      ]
    },
    {
      id: 'dp-q1',
      name: '动态规划模型 (Dynamic Programming - DP)',
      aka: 'Bellman 逆向时序递推模型',
      role: 'defense',
      roleBadge: '🛡️ 拓展对冲模型 (机理验证)',
      suitabilityScore: 90,
      fitReason:
        '微网能量调度在数学上具有天然的马尔可夫决策过程 (MDP) 结构，DP 可作为验证全局最优性的对冲工具',
      applicableScenarios: {
        problemTypes: [
          '离散多阶段顺序决策',
          '非凸或非线性电池老化损耗折旧模型求解'
        ],
        whenToUse:
          '用于在灵敏度与算法稳健性章节中，横向印证 MILP 与 DP 输出的最优费用一致性。',
        whenNotToUse:
          '如果离散步长过细（如每 1 kWh 离散一次），状态空间爆炸，求解时间呈指数级上升。',
        prosAndCons: {
          pros: [
            '能够轻松接纳任意非线性、非凸的电池循环寿命老化惩罚函数',
            'Bellman 最优性原理天然保证子阶段无后效性'
          ],
          cons: [
            '面临“维度灾难” (Curse of Dimensionality)，网格离散化精度与计算时间存在剧烈冲突'
          ]
        }
      },
      mathFormulation: {
        overview:
          '将 24 小时视为 24 个决策阶段，以蓄电池储电量 E(t) 为系统状态变量，反向递推求解值函数。',
        variables: [
          {
            symbol: 'E_t',
            name: '阶段 t 电池能量状态',
            physicalMeaning: '系统状态空间状态变量',
            domain: 'E_t \\in \\{0, \\Delta E, 2\\Delta E, \\dots, 12000\\}'
          },
          {
            symbol: 'u_t = (P_{ch}, P_{dis})',
            name: '阶段 t 控制动作',
            physicalMeaning: '充放电决策动作',
            domain: 'u_t \\in \\mathcal{U}(E_t)'
          }
        ],
        objectiveLatex:
          'V_t(E_t) = \\min_{u_t \\in \\mathcal{U}(E_t)} \\Big\\{ C_{grid}(t) P_{buy}(t) \\Delta t + V_{t+1}(E_{t+1}(E_t, u_t)) \\Big\\}',
        objectiveDesc:
          '从终端阶段 t=24 逆向递推至阶段 t=0，最后以 E(0)=E(24) 闭环选取最优轨迹。',
        constraints: [
          {
            name: '状态转移方程',
            latex: 'E_{t+1} = E_t + (0.9 P_{ch} - P_{dis}/0.9)\\Delta t',
            physicalMeaning: '阶段状态演化遵循电池物理机理'
          }
        ]
      },
      practicalMapping: {
        dataInputs: ['附件 1、附录 1 数据'],
        solverRecommendation: 'Python NumPy 向量化网格递推'
      },
      pitfallsAndTips: [
        '离散步长建议取 50 kWh，兼顾计算耗时（约 3 秒）与解的精度'
      ]
    }
  ]
}

/** 通用最优化类题目候选模型池 */
export function buildOptimizationCandidateModels(questionIdx: number): CandidateModelInfo[] {
  return [
    {
      id: `opt-milp-q${questionIdx}`,
      name: '混合整数线性规划 (MILP) 优化模型',
      aka: 'Mixed-Integer Linear Programming / 运筹规划求解器',
      role: 'primary',
      roleBadge: '⭐ 主力推荐模型 (契合度 98%)',
      suitabilityScore: 98,
      fitReason: '运筹学标准标杆，具备全局最优解理论证明，数学逻辑最严密',
      applicableScenarios: {
        problemTypes: ['资源优化调配', '路径/机位/排班指派', '带容量约束的组合最优化'],
        whenToUse: '目标函数和约束可表征为线性形式，决策变量含连续量与离散指示变量。',
        whenNotToUse: '目标函数高度非凸且无法做分段线性近似时。',
        prosAndCons: {
          pros: ['全局最优解保证', '秒级求解', '能直接输出影子价格与对偶灵敏度'],
          cons: ['需要将非线性逻辑通过大M法转化为线性不等式']
        }
      },
      mathFormulation: {
        overview: '定义决策变量 x，构建线性收益/成本目标函数，联立资源约束与逻辑互斥矩阵。',
        variables: [
          { symbol: 'x_i', name: '连续决策变量', physicalMeaning: '各环节资源分配数量', domain: 'x_i \\ge 0' },
          { symbol: 'y_{ij}', name: '0-1 离散指派变量', physicalMeaning: '任务与机位间的关联开关', domain: 'y_{ij} \\in \\{0, 1\\}' }
        ],
        objectiveLatex: '\\min \\quad Z = \\mathbf{c}^T \\mathbf{x} + \\mathbf{d}^T \\mathbf{y}',
        objectiveDesc: '使系统总运营成本或延误损失最小。',
        constraints: [
          { name: '资源容量守恒', latex: '\\mathbf{A} \\mathbf{x} + \\mathbf{B} \\mathbf{y} \\le \\mathbf{b}', physicalMeaning: '不突破可用物理资源上限' },
          { name: '唯一性指派', latex: '\\sum_j y_{ij} = 1, \\quad \\forall i', physicalMeaning: '每个任务必须且仅能指派给一个主体' }
        ]
      },
      practicalMapping: {
        dataInputs: ['题目给定的成本参数矩阵与任务需求量'],
        solverRecommendation: 'Python PuLP (CBC) 或 SciPy milp (HiGHS)'
      },
      pitfallsAndTips: ['大 M 法的 M 值不要设得过大（如 1e12），防止数值病态与浮点下溢']
    },
    {
      id: `opt-ga-q${questionIdx}`,
      name: '遗传算法 / 粒子群算法 (GA / PSO 启发式元启发算法)',
      aka: '智能启发式算法 / 进化计算对冲基线',
      role: 'defense',
      roleBadge: '🛡️ 稳健对冲拓展 (算法对比验证)',
      suitabilityScore: 88,
      fitReason: '用于与主力规划求解器进行收敛曲线对比，检验解的稳健性',
      applicableScenarios: {
        problemTypes: ['复杂组合寻优', '非线性约束优化', '黑盒目标函数'],
        whenToUse: '作为对冲模型写入论文第 6 节，对比启发式与数学规划的计算耗时与收敛解。',
        whenNotToUse: '不建议单独作为主力唯一模型，国赛评委更倾向于理论严密的严格数学规划。',
        prosAndCons: {
          pros: ['不要求目标函数连续或可微，适应性强'],
          cons: ['容易陷入局部最优，存在随机性，需多次独立运行取平均']
        }
      },
      mathFormulation: {
        overview: '将候选解编码为染色体，通过选择、交叉、变异算子迭代进化适应度。',
        variables: [{ symbol: 'G_k', name: '第 k 代种群基因型', physicalMeaning: '候选方案集合', domain: 'G_k \\in \\mathcal{S}^N' }],
        objectiveLatex: '\\text{Fitness}(x) = \\frac{1}{Z(x) + \\lambda \\sum \\text{Penalty}}',
        objectiveDesc: '适应度函数包含目标函数倒数与违约罚项。',
        constraints: []
      },
      practicalMapping: {
        dataInputs: ['赛题参数'],
        solverRecommendation: 'Python Geatpy 或 DEAP 库'
      },
      pitfallsAndTips: ['种群规模与交叉率必须做敏感性测试']
    },
    {
      id: `opt-baseline-q${questionIdx}`,
      name: '经验规则贪婪调度 (Greedy Baseline)',
      aka: '人工经验先到先得基线 (FCFS / Priority Rule)',
      role: 'baseline',
      roleBadge: '📊 基准对照模型 (Baseline)',
      suitabilityScore: 82,
      fitReason: '论文中必须具备的未优化基线，用于量化主力模型产生的降本效益百分比',
      applicableScenarios: {
        problemTypes: ['对比基准实验'],
        whenToUse: '人工调度经验（先来先服务、最高单价优先），作为对照基线。',
        whenNotToUse: '不可作为主力求解方案。',
        prosAndCons: {
          pros: ['极速输出，无门槛'],
          cons: ['成本高，无法达到全局最优']
        }
      },
      mathFormulation: {
        overview: '按优先级队列逐个分配资源。',
        variables: [],
        objectiveLatex: 'Z_{baseline} = \\sum \\text{Cost}(i)',
        objectiveDesc: '经验核算指标。',
        constraints: []
      },
      practicalMapping: {
        dataInputs: ['赛题基础数据'],
        solverRecommendation: 'Python 原生排序与循环'
      },
      pitfallsAndTips: ['必须给出 Baseline 与主力模型的量化对比柱状图']
    }
  ]
}

/** 通用时序预测类题目候选模型池 */
export function buildPredictionCandidateModels(questionIdx: number): CandidateModelInfo[] {
  return [
    {
      id: `pred-sarimax-q${questionIdx}`,
      name: '季节性差分自回归滑动平均模型 (SARIMAX)',
      aka: 'Seasonal ARIMA with eXogenous factors / 统计时序模型',
      role: 'primary',
      roleBadge: '⭐ 主力推荐模型 (契合度 98%)',
      suitabilityScore: 98,
      fitReason: '统计学基础扎实，能精确分解周期性、趋势性并吸纳外部气象/协变量影响',
      applicableScenarios: {
        problemTypes: ['平稳与非平稳时间序列', '具有明显昼夜/季节周期的物理负荷预测', '含外生解释变量的回归预测'],
        whenToUse: '数据具有明显时间依赖与周期节律，且希望输出置信区间 (Confidence Interval)。',
        whenNotToUse: '样本极度稀疏（少于 30 个时间步）或数据之间完全独立无自相关。',
        prosAndCons: {
          pros: ['具备严格的统计检验（ADF平稳性检验、白噪声残差检验）', '输出均值伴随 95% 置信上下界', '论文理论推导充实'],
          cons: ['对高阶非线性动力学拟合能力不及深度神经网络']
        }
      },
      mathFormulation: {
        overview: '通过 d 阶差分实现平稳化，结合自回归项 AR(p)、移动平均项 MA(q) 与季节项 (P,D,Q)_s。',
        variables: [
          { symbol: 'y_t', name: '目标预测变量', physicalMeaning: '时段 t 的被测物理量', domain: 'y_t \\in \\mathbb{R}' },
          { symbol: '\\epsilon_t', name: '白噪声残差', physicalMeaning: '零均值独立同分布随机误差', domain: '\\epsilon_t \\sim \\mathcal{N}(0, \\sigma^2)' }
        ],
        objectiveLatex: '\\Phi_P(B^s) \\phi_p(B) (1-B)^d (1-B^s)^D y_t = \\Theta_Q(B^s) \\theta_q(B) \\epsilon_t + \\beta X_t',
        objectiveDesc: 'B 为后移算子，X_t 为外生协变量矩阵。',
        constraints: [
          { name: '残差白噪声假设', latex: '\\text{Cov}(\\epsilon_t, \\epsilon_{t-k}) = 0, \\quad k \\ne 0', physicalMeaning: '模型必须彻底提取出序列中的有效信息' }
        ]
      },
      practicalMapping: {
        dataInputs: ['历史时序观测值与同期外部影响因子'],
        solverRecommendation: 'Python statsmodels.tsa.statespace.sarimax'
      },
      pitfallsAndTips: ['差分阶数切忌超过 2 阶（避免过差分）；建模后必须绘制残差自相关 ACF/PACF 图']
    },
    {
      id: `pred-lstm-q${questionIdx}`,
      name: '长短期记忆网络 (LSTM) 深度时序模型',
      aka: 'Long Short-Term Memory / 循环神经网络对冲',
      role: 'defense',
      roleBadge: '🛡️ 稳健对冲拓展 (非线性拟合对比)',
      suitabilityScore: 92,
      fitReason: '能有效捕捉长期时间依赖与高阶非线性波动特征',
      applicableScenarios: {
        problemTypes: ['大样本非线性时序预测', '多变量特征深度交叉融合'],
        whenToUse: '作为对冲模型与 SARIMAX 展开横向指标（RMSE、MAE、MAPE、R²）对比。',
        whenNotToUse: '样本量少于 200 条时极易过拟合。',
        prosAndCons: {
          pros: ['强大的非线性表征能力，无需手动差分'],
          cons: ['黑盒缺乏统计解释性，缺少严密的置信区间数学证明']
        }
      },
      mathFormulation: {
        overview: '通过遗忘门、输入门、细胞状态更新与输出门控制时序信息流。',
        variables: [
          { symbol: 'f_t', name: '遗忘门激活值', physicalMeaning: '丢弃历史无关信息比例', domain: 'f_t \\in [0, 1]' },
          { symbol: 'C_t', name: '细胞内部状态', physicalMeaning: '长程记忆载体', domain: 'C_t \\in \\mathbb{R}^d' }
        ],
        objectiveLatex: 'f_t = \\sigma(W_f [h_{t-1}, x_t] + b_f), \\quad C_t = f_t \\odot C_{t-1} + i_t \\odot \\tilde{C}_t',
        objectiveDesc: 'LSTM 门控时序演化方程。',
        constraints: []
      },
      practicalMapping: {
        dataInputs: ['归一化后的多维时序矩阵'],
        solverRecommendation: 'PyTorch 或 TensorFlow/Keras'
      },
      pitfallsAndTips: ['必须在测试集上独立评估，严禁把测试集混入归一化参数中造成数据泄漏']
    },
    {
      id: `pred-prophet-q${questionIdx}`,
      name: '可加性趋势分解模型 (Prophet / STL 基线)',
      aka: 'Additive Trend and Seasonality Decomposition / 经验基线',
      role: 'baseline',
      roleBadge: '📊 基准对照模型 (Baseline)',
      suitabilityScore: 85,
      fitReason: '能够快速分离趋势项、周期项与节假日项，提供清晰直观的直觉基准',
      applicableScenarios: {
        problemTypes: ['具有明显多重周期性的业务数据'],
        whenToUse: '作为基准模型在论文第 3 节提供直观的趋势可视化对照。',
        whenNotToUse: '不能应对突发物理断点或强外部扰动。',
        prosAndCons: {
          pros: ['抗缺失值与异常点能力强，参数可解释性高'],
          cons: ['对短期突发尖峰预测钝化']
        }
      },
      mathFormulation: {
        overview: '将序列解构为趋势函数 g(t)、季节周期函数 s(t) 与突发残差项 h(t)。',
        variables: [],
        objectiveLatex: 'y(t) = g(t) + s(t) + h(t) + \\epsilon_t',
        objectiveDesc: '可加性广义时序回归公式。',
        constraints: []
      },
      practicalMapping: {
        dataInputs: ['时序两列 (ds, y)'],
        solverRecommendation: 'prophet 库'
      },
      pitfallsAndTips: ['在论文中将趋势分量与周期分量拆成多 Panel 图展示']
    }
  ]
}

/** 通用综合评价类题目候选模型池 */
export function buildEvaluationCandidateModels(questionIdx: number): CandidateModelInfo[] {
  return [
    {
      id: `eval-topsis-q${questionIdx}`,
      name: '熵权-TOPSIS 优劣解距离模型',
      aka: 'Entropy Weight + Technique for Order Preference by Similarity to Ideal Solution',
      role: 'primary',
      roleBadge: '⭐ 主力推荐模型 (契合度 98%)',
      suitabilityScore: 98,
      fitReason: '客观信息熵赋权消除主观偏见，欧氏几何贴近度量化优劣排序，国赛最权威组合',
      applicableScenarios: {
        problemTypes: ['多对象、多指标综合打分与优选', '绩效评估与排序决策', '兼具正向指标、逆向指标与适度指标'],
        whenToUse: '赛题包含多个候选对象且给出了多项特征指标，要求给出科学排名的场景。',
        whenNotToUse: '没有具体观测数据、完全依赖专家经验的定性场景。',
        prosAndCons: {
          pros: ['计算客观透明，公式标准规范', '几何直观性强（同时考虑与最优解和最劣解的距离）', '无指标数量限制'],
          cons: ['当各指标间存在极高共线性时，权重可能被过度放大，需配合相关性排查']
        }
      },
      mathFormulation: {
        overview: '先将原始指标矩阵进行正向化与极差归一化；再由信息熵计算各指标客观权重；最后计算与正负理想解的欧氏距离求贴近度。',
        variables: [
          { symbol: 'w_j', name: '指标 j 客观熵权', physicalMeaning: '由信息熵变异程度决定的权重', domain: '\\sum w_j = 1, \\; w_j \\ge 0' },
          { symbol: 'D_i^+, D_i^-', name: '对象 i 到正/负理想解的欧氏距离', physicalMeaning: '几何空间偏离度', domain: 'D_i^+, D_i^- \\ge 0' },
          { symbol: 'C_i', name: '对象 i 的相对贴近度得分', physicalMeaning: '最终综合评价分值', domain: 'C_i \\in [0, 1]' }
        ],
        objectiveLatex: 'C_i = \\frac{D_i^-}{D_i^+ + D_i^-}, \\quad D_i^+ = \\sqrt{\\sum_{j=1}^m w_j (z_{ij} - z_j^+)^2}',
        objectiveDesc: 'C_i 越接近 1，代表方案越接近正理想解且远离负理想解，综合表现越优。',
        constraints: [
          { name: '熵权非负归一', latex: 'e_j = -\\frac{1}{\\ln n} \\sum_{i=1}^n p_{ij} \\ln p_{ij}, \\quad w_j = \\frac{1-e_j}{\\sum (1-e_k)}', physicalMeaning: '信息效用价值越大，权重越高' }
        ]
      },
      practicalMapping: {
        dataInputs: ['对象指标矩阵 (n 行 m 列)'],
        solverRecommendation: 'Python NumPy / Pandas'
      },
      pitfallsAndTips: ['成本型指标（越小越好）必须先做正向化变换；p_ij 为 0 时需平滑处理避免 ln(0)']
    },
    {
      id: `eval-gra-q${questionIdx}`,
      name: '灰色关联度分析 (GRA) 稳健对冲模型',
      aka: 'Grey Relational Analysis / 曲线几何相似度对冲',
      role: 'defense',
      roleBadge: '🛡️ 稳健对冲拓展 (排序一致性验证)',
      suitabilityScore: 92,
      fitReason: '从曲线几何发展态势相似度评估优劣，与 TOPSIS 互为印证，构成坚固对冲防线',
      applicableScenarios: {
        problemTypes: ['小样本、信息不完全系统综合评价', '与 TOPSIS 展开 Spearman 秩相关系数检验'],
        whenToUse: '用于在模型评价与灵敏度章节中，检验 TOPSIS 评价排名的稳健性。',
        whenNotToUse: '不能完全取代 TOPSIS，二者结合最能体现深度。',
        prosAndCons: {
          pros: ['对样本量与分布无苛刻要求', '能够检验排序结论是否具有方法不变性'],
          cons: ['分辨系数 ρ (通常取 0.5) 具有一定经验主观性']
        }
      },
      mathFormulation: {
        overview: '计算评价对象与参考母序列在各指标上的关联系数，加权求得灰色综合关联度。',
        variables: [{ symbol: '\\xi_i(k)', name: '对象 i 在指标 k 上的关联系数', physicalMeaning: '局部相似程度', domain: '\\xi_i(k) \\in [0, 1]' }],
        objectiveLatex: '\\xi_i(k) = \\frac{\\min_s \\min_t |x_0(t) - x_s(t)| + \\rho \\max_s \\max_t |x_0(t) - x_s(t)|}{|x_0(k) - x_i(k)| + \\rho \\max_s \\max_t |x_0(t) - x_s(t)|}',
        objectiveDesc: 'ρ 为分辨系数，常取 0.5。',
        constraints: []
      },
      practicalMapping: {
        dataInputs: ['标准化后的指标矩阵'],
        solverRecommendation: 'Python 向量化计算'
      },
      pitfallsAndTips: ['必须报告 TOPSIS 与 GRA 的 Spearman 秩相关系数（通常 > 0.85 证明稳健）']
    },
    {
      id: `eval-ahp-q${questionIdx}`,
      name: '层次分析法 (AHP) 主观基准模型',
      aka: 'Analytic Hierarchy Process / 专家经验加权基准',
      role: 'baseline',
      roleBadge: '📊 基准对照模型 (Baseline)',
      suitabilityScore: 82,
      fitReason: '用于与客观熵权法形成主客观综合对照',
      applicableScenarios: {
        problemTypes: ['专家打分对比基线'],
        whenToUse: '作为主观权重参考，或者与熵权法构成乘法/线性组合赋权。',
        whenNotToUse: '数模国赛强烈反对纯 AHP 凭空拍脑袋定权重。',
        prosAndCons: {
          pros: ['反映决策专家对核心指标的业务偏好'],
          cons: ['主观性太强，必须通过一致性检验 (CR < 0.1)']
        }
      },
      mathFormulation: {
        overview: '构建两两判断矩阵 A，计算最大特征根与特征向量。',
        variables: [{ symbol: 'CR', name: '随机一致性比率', physicalMeaning: '判断逻辑自洽性检验', domain: 'CR < 0.1' }],
        objectiveLatex: 'A w = \\lambda_{\\max} w, \\quad CR = \\frac{CI}{RI} = \\frac{\\lambda_{\\max} - n}{(n - 1) RI}',
        objectiveDesc: '特征向量即为归一化权重。',
        constraints: []
      },
      practicalMapping: {
        dataInputs: ['Saaty 1-9 标度判断矩阵'],
        solverRecommendation: 'numpy.linalg.eig'
      },
      pitfallsAndTips: ['如果用 AHP，CR 检验表格必须完整附在论文正文中']
    }
  ]
}

/** 通用备选候选模型池（兜底） */
export function buildGeneralCandidateModels(questionIdx: number, cat: string): CandidateModelInfo[] {
  if (cat === 'optimization') return buildOptimizationCandidateModels(questionIdx)
  if (cat === 'prediction') return buildPredictionCandidateModels(questionIdx)
  if (cat === 'evaluation') return buildEvaluationCandidateModels(questionIdx)
  return buildOptimizationCandidateModels(questionIdx)
}

/** 统一获取指定小问的候选模型列表 */
export function getCandidateModelsForQuestion(
  questionIdx: number,
  briefText: string,
  fullProblemText = ''
): CandidateModelInfo[] {
  const combined = `${briefText}\n${fullProblemText}`
  if (/微网|外部电网|储能|光伏|电池|充放电|电量|购电|小区负载|分时电价|soc/i.test(combined)) {
    return buildMicrogridCandidateModels(questionIdx, briefText)
  }
  const cat = /预测|时序|趋势|外推/.test(combined)
    ? 'prediction'
    : /评价|打分|排序|优选|权重/.test(combined)
      ? 'evaluation'
      : 'optimization'
  return buildGeneralCandidateModels(questionIdx, cat)
}
