/**
 * 讲解语料库：学生问「这是什么」时给的东西。
 *
 * 定位是科普而不是答案：每一段只讲直觉、类比、一个跟题目无关的迷你例子里的数，
 * 公式只给骨架（符号含义列出来让学生自己填进符号表），绝不出现可直接粘进正文的句子。
 * 未命中方法卡时退回术语表；两边都没有就让教练用一句话解释（渲染层负责那一步）。
 */
import { METHOD_CARDS } from './methods'

export interface Explain {
  /** L0：一句话说清它在干什么 */
  intuition: string
  /** L1：生活类比 */
  analogy: string
  /** L1：一个跟学生赛题无关的小数字例子 */
  miniExample: string
  /** L2：公式骨架 */
  formula: string
  /** L2：符号含义，学生要自己核对后写进符号表 */
  symbols: string[]
}

export const EXPLAIN_LIMITS = { intuition: 48, analogy: 72, miniExample: 96, formula: 128, symbols: 44 }

export interface ExplainSource {
  kind: 'method' | 'term'
  /** 方法卡 id 或术语标题 */
  ref: string
  title: string
  category: string
  explain: Explain
}

export const METHOD_EXPLAIN: Record<string, Explain> = {
  normalization: {
    intuition: '把不同单位的数换成「在同一把尺子上的位置」，才谈得上相加与比较。',
    analogy: '百米成绩和体重不能直接相加，先各自换算成「在人群里排第几成」。',
    miniExample: '三个车间产量 120、300、900，极差变换后是 0、0.25、1；耗电量越少越好，先取 1-x 变成越大越好。',
    formula: 'x′ = (x − min)/(max − min)；逆向指标取 1 − x′；标准化用 (x − μ)/σ。',
    symbols: ['x 该指标的原始取值', 'min/max 样本里这项指标的最小与最大', 'x′ 变换后的取值', 'μ/σ 这项指标的均值与标准差']
  },
  interpolation: {
    intuition: '缺口按邻近点的走势补一个值；拟合是把一堆散点压成一条能算的曲线。',
    analogy: '尺子上少了一格刻度，用两边刻度的间距估出来；拟合像拿直尺盖住散点找最贴的那条线。',
    miniExample: '8:00 读数 12.1、9:00 读数 13.5，8:30 线性插值得 12.8；样条更光但端点可能甩出物理上不存在的值。',
    formula: '线性：x(t) = x₀ + (x₁ − x₀)(t − t₀)/(t₁ − t₀)；拟合取残差平方和最小。',
    symbols: ['x₀/x₁ 缺口两侧已知读数', 't₀/t₁ 两侧读数的时刻', 't 要补的时刻', '残差 拟合值与实测值之差']
  },
  'entropy-weight': {
    intuition: '哪个指标在方案之间拉得越开，它越有区分能力，就给越大的权重。',
    analogy: '全班数学都考 99 分时，数学成绩区分不出好坏，它的权重就该压低。',
    miniExample: '甲指标取值 0.1 与 0.9（差得开），乙指标 0.50 与 0.51（几乎一样），熵权会把权重压在甲上。',
    formula: 'p_ij = x_ij / Σᵢx_ij；e_j = −(1/ln n)Σᵢ p_ij ln p_ij；w_j = (1 − e_j)/Σ_j(1 − e_j)。',
    symbols: ['x_ij 第 i 个方案第 j 项指标的标准值', 'p_ij 第 j 项指标上的占比', 'e_j 第 j 项指标的信息熵', 'w_j 算出的权重']
  },
  topsis: {
    intuition: '造出「每列最好」和「每列最差」两个假想方案，看谁离前者近、离后者远。',
    analogy: '心里有一个理想型和一个最差典型，打分就是量你和两边的距离。',
    miniExample: '加权后理想解取各列最大值 (0.9, 0.8)，负理想解取最小值，某方案到两者距离 0.3 与 0.7，贴近度 0.7。',
    formula: 'Dᵢ⁺ = √Σ_j(v_ij − v_j⁺)²；Dᵢ⁻ 同理；Cᵢ = Dᵢ⁻/(Dᵢ⁺ + Dᵢ⁻)。',
    symbols: ['v_ij 加权规范矩阵元素', 'v_j⁺/v_j⁻ 第 j 项的正、负理想解', 'D⁺/D⁻ 到两个理想解的距离', 'Cᵢ 贴近度，越大排越前']
  },
  ahp: {
    intuition: '把「甲比乙重要多少」两两问清楚，再用一套算法把主观判断合成权重。',
    analogy: '不让人直接报百分比，只让他两两投票谁更强，最后统计出一套权重。',
    miniExample: '三指标两两打分得 3×3 判断矩阵；若甲比乙 3 倍、乙比丙 3 倍、甲却只比丙 1 倍，一致性检验就不过。',
    formula: 'Aw = λ_max·w；CI = (λ_max − n)/(n − 1)；CR = CI/RI，CR < 0.1 才算判断自洽。',
    symbols: ['A 两两比较得到的判断矩阵', 'λ_max A 的最大特征值', 'CI 一致性指标', 'RI 同阶随机一致性指标']
  },
  'fuzzy-eval': {
    intuition: '不硬判「合格/不合格」，而是给每个等级一点隶属度，再按权重合成。',
    analogy: '体检不说你有病，而是各项「偏高 0.4、正常 0.6」这样按比例给结论。',
    miniExample: '某方案对「好」隶属度 0.3、「中」0.5、「差」0.2，与权重向量合成后得到综合等级分布。',
    formula: 'B = A ∘ R，其中 b_k = max_i min(a_i, r_ik)，也可按加权平均取 Σᵢ a_i r_ik。',
    symbols: ['A 权重模糊向量', 'R 单指标评判矩阵', 'B 综合评判结果', '∘ 模糊合成算子']
  },
  'grey-relational': {
    intuition: '不看数值差多少，看两条曲线的形状像不像、涨跌是否同步。',
    analogy: '两支股票价格差一百倍，但 K 线形状像，关联度照样高。',
    miniExample: '参考列是产量序列、比较列是能耗序列，逐点算关联系数再取平均得关联度 0.87。',
    formula: 'ξᵢ(k) = (Δ_min + ρΔ_max)/(|x₀(k) − xᵢ(k)| + ρΔ_max)，ρ 常取 0.5。',
    symbols: ['x₀ 参考序列', 'xᵢ 第 i 个比较序列', 'Δ_min/Δ_max 全部绝对差的最小与最大', 'ρ 分辨系数']
  },
  pca: {
    intuition: '把一堆互相关联的指标压成少数综合方向，每个方向尽量多保留原来的信息。',
    analogy: '很多照片从不同角度拍同一件东西，主成分就是找出真正有区别的那两三个角度。',
    miniExample: '5 个高度相关的指标做主成分，前两个累计贡献率 85%，后续分析只用这两个得分。',
    formula: '对相关矩阵做特征分解 Ru = λu；第 k 个方向贡献率为 λ_k/Σλ；得分等于标准化数据乘 u_k。',
    symbols: ['R 标准化后的相关矩阵', 'λ 特征值，即该方向解释的方差', 'u 载荷向量', '贡献率 该主成分保留的信息份额']
  },
  dea: {
    intuition: '用投入产出比比较同类单元，谁踩在效率前沿上谁就得 1。',
    analogy: '不看谁赚得多，看同样多的人手和店面里谁把资源用得更足。',
    miniExample: '10 家门店里 A 店投入 3 产出 5 落在前沿上得 1；B 店产出要到 6.2 才够前沿，差的 1.2 就是改进量。',
    formula: 'max h_k = Σᵣu_r y_rk / Σᵢv_i x_ik，约束该比值对所有单元 ≤ 1，权重非负。',
    symbols: ['x_ik 第 k 个单元的第 i 项投入', 'y_rk 第 r 项产出', 'u/v 待优化的权重', 'h_k 该单元的效率值']
  },
  lp: {
    intuition: '目标和约束都是线性的时候，最优解一定落在可行域的某个角上。',
    analogy: '预算和货架都有限，把钱投向回报最高处，直到某条约束先绷紧为止。',
    miniExample: '两种产品利润 3 和 5，工时与原料围出可行四边形，两约束交点 (2,6) 处利润 36 最大。',
    formula: 'max cᵀx，满足 Ax ≤ b、x ≥ 0。',
    symbols: ['x 决策变量向量', 'c 单位收益系数', 'A/b 资源约束矩阵与上限', '可行域 满足全部约束的 x 集合']
  },
  milp: {
    intuition: '有些事只能整件做、或者只有做与不做，变量就得限制成整数或 0/1。',
    analogy: '出租车数量不能是 2.3 辆；「这条线路开不开」只有开与不开。',
    miniExample: '6 个候选站选 3 个：y_j ∈ {0,1} 且 Σy_j = 3；每个需求点写一条 Σy_j ≥ 1 保证被覆盖。',
    formula: '在线性规划上追加 x ∈ Zⁿ 或 y ∈ {0,1}；逻辑关系用大 M 写成 x ≤ M·y。',
    symbols: ['y 0-1 决策变量', 'Zⁿ 变量取整数的集合', 'M 足够大的常数', 'Σy_j = 3 选点数量约束']
  },
  'multi-objective': {
    intuition: '几个目标互相拉扯时没有唯一最优，只能给一族「谁也不比谁强」的解。',
    analogy: '又便宜又快又准，占住两样就得放弃第三样，取舍表本身就是一组方案。',
    miniExample: '成本与工期加权成单目标，权重从 0.2 扫到 0.8 得 5 个解，画出前沿后由决策者挑点。',
    formula: '线性加权 min Σₖw_k fₖ(x)；或 ε-约束法：只保一个目标，其余写成 fₖ(x) ≤ εₖ。',
    symbols: ['fₖ 第 k 个目标函数', 'w_k 目标权重', 'εₖ 该目标允许的上限', '帕累托前沿 互不支配的解集']
  },
  nlp: {
    intuition: '目标或约束带曲线时，最优解可能在中间而不是端点，要用导数条件去找。',
    analogy: '山谷最低点不是一眼看到的那处，得顺坡走到「再动就上升」的位置。',
    miniExample: '库存成本含 1/Q 项与线性项，对 Q 求导为 0 解出经济批量，二阶导为正才确认是最低点。',
    formula: '等式约束用拉格朗日函数 L = f(x) + Σ_j λ_j g_j(x)，驻点处 ∇L = 0。',
    symbols: ['f 目标函数', 'g_j 第 j 条等式约束', 'λ_j 拉格朗日乘子', '∇L 对变量的梯度']
  },
  dp: {
    intuition: '把多阶段决策拆成「每步只看当前状态」，靠递推把重复计算省掉。',
    analogy: '上楼梯时记住到第 5 级的最少步数，就不必把前面所有走法再走一遍。',
    miniExample: '5 站运输：f(k,s) = 本段费用 + 上一状态最优；倒推时要记下每段前驱，否则还原不出路径。',
    formula: 'f_k(s) = min_u { c_k(s,u) + f_{k+1}(s′) }，边界条件 f_{n+1}(·) = 0。',
    symbols: ['s 阶段 k 开始时的状态', 'u 该状态下可选的决策', 'c_k 走完本段的代价', 'f_k 从该状态往后的最优值']
  },
  metaheuristic: {
    intuition: '问题大到算不完时，用「随机试探 + 只留下好的」逼近一个还不错的解。',
    analogy: '摸黑下山，偶尔允许往上走几步，免得卡在局部的小坑里出不来。',
    miniExample: '排产用退火：随机交换两道工序，变好就接受，变差按 exp(−Δ/T) 接受，T 从高温降到 0.01。',
    formula: '接受概率 P = exp(−Δ/T)；遗传算法靠选择、交叉、变异三步反复迭代种群。',
    symbols: ['Δ 新解与当前解的目标差', 'T 退火温度，控制冒险程度', '种群 一组候选解', '变异概率 每次扰动的强度']
  },
  regression: {
    intuition: '用几条线性关系解释 y 随各因素平均怎么变，重点看系数的方向与大小有没有依据。',
    analogy: '气温、广告费、星期几各拉一把销量，回归就是量出每只手拉得多猛。',
    miniExample: '销量对价格与广告额回归，价格系数 −3.2 意味着单价涨一元日均少卖约 3 件；两个自变量高度相关时系数会乱跳。',
    formula: 'y = β₀ + Σ_jβ_jx_j + ε；最小二乘让残差平方和最小，R² 是解释份额。',
    symbols: ['β_j 第 j 个自变量的系数', 'ε 残差项', 'R² 拟合优度', 'VIF 多重共线性的度量']
  },
  logistic: {
    intuition: '预测的是「发生的概率」，把概率压进 0 到 1 之间，再由你定阈值分类。',
    analogy: '不直接说会不会逾期，而是给出逾期可能性 0.73，多少算逾期由你决定。',
    miniExample: '三个特征预测故障，某系数对应比值 4.1，表示该特征每增一单位，故障的发生比乘 4.1。',
    formula: 'P(y=1) = 1/(1 + exp(−z))，其中 z = β₀ + Σ_jβ_jx_j。',
    symbols: ['z 自变量的线性组合', 'P 事件发生的概率', '比值 发生概率与不发生概率之比', 'β_j 对数几率系数']
  },
  arima: {
    intuition: '用序列自己的过去和过去的误差外推下一步，前提是变换后的序列平稳。',
    analogy: '今天的气温主要看昨天偏多少，再叠一点前天的影响和前面的预报误差。',
    miniExample: '月销量先做一阶差分变平稳，判 p=1、q=1，残差图看不出规律后才预测下一月并给置信带。',
    formula: '(1 − ΣᵢφᵢBⁱ)(1 − B)^d y_t = c + (1 + Σ_jθ_jB^j)ε_t。',
    symbols: ['d 让序列平稳所需的差分阶数', 'p 自回归阶数', 'q 移动平均阶数', 'B 后移算子', 'ε_t 白噪声残差']
  },
  'grey-gm': {
    intuition: '只有四五个数据也能建模：先累加把杂乱序列变得有趋势，再拟合曲线。',
    analogy: '几个散点看不出规律，把它们累加成一条上升折线，趋势就露出来了。',
    miniExample: '4 年产量做一次累加后拟合指数曲线，还原后预测第 5 年，并报告后验差比值与小误差概率。',
    formula: 'x⁽¹⁾(k+1) = (x⁽⁰⁾(1) − u/a)e^{−ak} + u/a。',
    symbols: ['x⁽⁰⁾ 原始序列', 'x⁽¹⁾ 一次累加序列', 'a 发展系数', 'u 灰作用量', 'C 后验差比值']
  },
  correlation: {
    intuition: '量出两个变量同涨同跌的紧密程度，但它不说明谁引起谁。',
    analogy: '冰淇淋销量和溺水人数很相关，真正的原因是两者背后都有夏天。',
    miniExample: '报告 r = 0.82 且 p < 0.05 才谈显著；若关系是 U 形，线性相关系数会假装什么都没发生。',
    formula: 'r = Σ(x_i − x̄)(y_i − ȳ) / √[Σ(x_i − x̄)²·Σ(y_i − ȳ)²]。',
    symbols: ['r 皮尔逊相关系数', 'x̄/ȳ 两个变量的均值', 'p 值 出现该强度或更强的概率']
  },
  anova: {
    intuition: '先假设各组其实没差别，再看数据把「没差别」逼到什么程度，用 p 值表达。',
    analogy: '称东西前先把天平归零；偏离超过归零误差范围，才敢说真的不一样。',
    miniExample: '三种装配顺序的完工时间做单因素方差分析，F 检验显著后再两两比较，不要直接宣布哪种最好。',
    formula: 'F = 组间均方/组内均方；判据是 p < α（常取 0.05）时拒绝原假设。',
    symbols: ['H₀ 原假设：各组均值相等', 'F 组间与组内方差之比', 'α 显著性水平', 'p 值 原假设为真时看到这种差异的概率']
  },
  kmeans: {
    intuition: '先随手放 k 个中心，反复「按就近归类—重算中心」，直到分组不再变化。',
    analogy: '把一群人分成 k 堆，每堆派个代表站中间，大家不断走向最近的代表直到没人动。',
    miniExample: '标准化后的两个指标分 3 类，肘部法看组内平方和在 k=3 处拐弯；初值随机，要重复跑 20 次取最稳结果。',
    formula: 'min Σ_c Σ_{i∈c}‖x_i − μ_c‖²，重复「分配—更新」两步到目标不再下降。',
    symbols: ['k 预先给定的类别数', 'μ_c 第 c 类的中心', 'SSE 组内平方和', '标准化 不先做就没法比距离']
  },
  'ml-ensemble': {
    intuition: '一棵树容易把数据记死，把许多棵各看一部分数据的树合起来投票就更稳。',
    analogy: '一个专家会看走眼，二十个专家各看不重叠的线索再合议，结论稳得多。',
    miniExample: '10 折交叉验证里训练集近乎满分、验证集明显掉下来，就是过拟合；论文要报的是验证集指标。',
    formula: '预测取各树输出之和 f(x) = Σ_m f_m(x)，第 m 轮去拟合前一轮的残差。',
    symbols: ['f_m 第 m 棵树的输出', '残差 当前预测与真值之差', '学习率 每棵树的影响权重', '袋外误差 用没参与训练的样本估泛化']
  },
  lstm: {
    intuition: '让网络自己学「哪些历史留着、哪些忘掉」，用来处理有长短期依赖的序列。',
    analogy: '记笔记时有人专门决定这段抄、那段丢，而不是把整本流水账背下来。',
    miniExample: '30 天负荷序列用滑窗 7 天预测次日；数据切成训练、验证、测试三段，测试段一次都不许参与调参。',
    formula: 'h_t 由遗忘门、输入门、输出门三组 0 到 1 的门控系数递推组合得到。',
    symbols: ['滑窗长度 用多少历史预测下一步', '门控 决定保留与丢弃的比例', 'h_t 第 t 步的隐藏状态', '测试集 只用于最后评估']
  },
  'shortest-path': {
    intuition: '在网络上找花费最少的走法，或者在容量限制下让流量尽量大。',
    analogy: '导航找的不是直线最短，而是把每段路的代价加起来总额最小的那条。',
    miniExample: '12 节点配送网络用 Dijkstra 得最短时间 47 分钟；再查容量约束是否被打破，冲突就转成最小费用流。',
    formula: 'dist(v) = min over edges { dist(u) + w(u,v) }，每次取未定节点里最小者扩展。',
    symbols: ['w(u,v) 从 u 到 v 的边权', 'dist(v) 起点到 v 的最短代价', '松弛 用新路径更新旧代价', '容量 一条边能通过的上限']
  },
  'monte-carlo': {
    intuition: '解析式算不出来时，按随机规律造几万组数据，用出现的频率当作概率。',
    analogy: '往正方形里随机撒豆子，落在内切圆里的比例就能约出 π。',
    miniExample: '故障率按给定分布抽样，模拟 10000 条生产线路径，报告总完工时间的 5% 与 95% 分位数，而不只报均值。',
    formula: 'E[f(X)] ≈ (1/N)Σᵢ f(xᵢ)，估计误差大致随 1/√N 收缩。',
    symbols: ['N 模拟重复次数', 'xᵢ 第 i 次随机抽样', 'f(xᵢ) 这次抽样对应的目标值', '分位数 用来说明波动范围']
  }
}

export interface TermEntry {
  title: string
  aka: string[]
  category: string
  explain: Explain
}

/** 术语表：不是方法，但学生卡在任务卡与教练追问里最常问的这些词 */
export const TERMS: TermEntry[] = [
  {
    title: '权重',
    aka: ['赋权', '定权重', '指标权重'],
    category: '评价',
    explain: {
      intuition: '权重是「这项指标在综合结果里说话的分量」，它本身不是数据，是你定的规则。',
      analogy: '期末成绩里平时分占 30%，那个 30% 就是权重。',
      miniExample: '两项指标权重 0.7 与 0.3 时甲方案胜出，改成 0.4 与 0.6 可能换位，所以权重要写清来源。',
      formula: '综合值 Sᵢ = Σ_j w_j x′_ij，且 Σ_j w_j = 1。',
      symbols: ['w_j 第 j 项指标的权重', 'x′_ij 标准化后的取值']
    }
  },
  {
    title: '主观赋权与客观赋权',
    aka: ['主客观赋权'],
    category: '评价',
    explain: {
      intuition: '主观赋权来自人的判断，客观赋权来自数据本身的分布，两者依据完全不同。',
      analogy: '请专家打分是主观，让数据的离散程度自己说话是客观。',
      miniExample: '层次分析法属于主观，熵权法、变异系数法属于客观；混用时要说清哪几项走哪条。',
      formula: '',
      symbols: []
    }
  },
  {
    title: '目标函数',
    aka: ['目标', '优化目标'],
    category: '优化',
    explain: {
      intuition: '你希望它最小或最大的那一个式子，模型的所有努力都只为它服务。',
      analogy: '导航里你选的「时间最短」还是「收费最少」，就是目标函数。',
      miniExample: '「总完工时间最小」是目标；「每台设备一次只做一道工序」是约束，不是目标。',
      formula: 'min f(x) 或 max f(x)。',
      symbols: ['f 目标函数', 'x 决策变量']
    }
  },
  {
    title: '决策变量',
    aka: ['未知量', '要求什么'],
    category: '优化',
    explain: {
      intuition: '模型最后要替你（其实是你自己）定下来的那几个数，先想清楚它们是什么再写约束。',
      analogy: '排班表上的空格就是决策变量，填进去的值就是解。',
      miniExample: '「第 i 道工序在第 j 台设备上的开工时刻」是一个决策变量；写成 0-1 表示「排或不排」则是另一种。',
      formula: '',
      symbols: ['连续变量 取值可以是小数', '0-1 变量 只有做与不做']
    }
  },
  {
    title: '约束',
    aka: ['约束条件', '可行域'],
    category: '优化',
    explain: {
      intuition: '不允许的事情用式子写出来，满足全部约束的解才有资格参与比较。',
      analogy: '高速限速、货架容量、每人每天 8 小时，都是约束。',
      miniExample: '「同一批订单不跨班拆分」写成不等式才是约束；只在正文里说一句不算，模型看不见它。',
      formula: 'g_i(x) ≤ 0（或 = 0）逐条列出，全部满足的 x 集合叫可行域。',
      symbols: ['g_i 第 i 条约束', '可行域 满足全部约束的解集合']
    }
  },
  {
    title: '帕累托最优',
    aka: ['非支配解', '帕累托前沿'],
    category: '优化',
    explain: {
      intuition: '一组解里，不动坏任何一个目标就没法让另一个目标变好，这些解互不支配。',
      analogy: '又便宜又快：从「更快更贵」挪到「更便宜更慢」不算谁赢，只有两样都输的才该被扔掉。',
      miniExample: '扫权重得 5 个解画成前沿，报告「想省成本就得牺牲 3 天工期」这样的取舍，而不是只报一个点。',
      formula: '',
      symbols: ['支配 各目标都不差且至少一个更好', '前沿 互不支配解的集合']
    }
  },
  {
    title: '灵敏度分析',
    aka: ['敏感性分析', '灵敏度检验'],
    category: '检验',
    explain: {
      intuition: '故意把参数动一动，看结论会不会跟着翻，翻在哪一步。',
      analogy: '调音量前你先试一下旋钮松不松；结论像松旋钮那样一碰就变，就不可信。',
      miniExample: '把权重从 0.5 扫到 0.9，前三名次序不变就说稳；若第 2 名换成另一个方案，要写出翻转点。',
      formula: '常用做法是 ±10%、±20% 扰动关键参数，或沿某一参数连续扫描。',
      symbols: ['扰动 参数改动的幅度', '翻转点 结论改变的临界取值']
    }
  },
  {
    title: '鲁棒性',
    aka: ['稳健性', '稳定性'],
    category: '检验',
    explain: {
      intuition: '数据有噪声、假设不成立时，方案还能不能用，这叫鲁棒；它比灵敏度更宽。',
      analogy: '六级风里还站得住，而不是只测无风时的姿势。',
      miniExample: '给产量序列叠上 5% 随机误差重跑 200 次，看方案达标率是不是仍然高于 90%。',
      formula: '',
      symbols: ['扰动分布 噪声怎么造', '达标率 多少次仍满足要求']
    }
  },
  {
    title: '拟合优度',
    aka: ['R²', '决定系数'],
    category: '统计',
    explain: {
      intuition: '模型解释了数据波动中的多大份额，剩下没解释的部分就是残差。',
      analogy: '天气预报说今天热是因为夏天，R² 就是「夏天」这一条解释了多少温差。',
      miniExample: 'R² = 0.86 表示波动的 86% 被模型接住；但若残差图呈弯曲，这个数再高也不能用。',
      formula: 'R² = 1 − 残差平方和/总平方和。',
      symbols: ['残差 实测与拟合之差', '总平方和 数据自身的波动大小']
    }
  },
  {
    title: '残差',
    aka: ['误差项'],
    category: '统计',
    explain: {
      intuition: '模型没解释掉的那部分，看它的分布比看拟合值本身更能暴露问题。',
      analogy: '预测与实际的差额清单，逐条摊开看有没有规律。',
      miniExample: '残差若随时段呈周期性起伏，说明漏了一个季节性变量；若越大的值残差越大，需要先做变换。',
      formula: 'e_i = y_i − ŷ_i。',
      symbols: ['y_i 实测值', 'ŷ_i 模型给出的值']
    }
  },
  {
    title: 'p 值与显著性水平',
    aka: ['显著性', 'alpha', 'p-value'],
    category: '统计',
    explain: {
      intuition: 'p 值是「假如其实没差别，纯靠随机也能看到这么大差异」的可能性。',
      analogy: '硬币连续 10 次正面，你会怀疑它不均匀；p 值就是这种怀疑的程度量化。',
      miniExample: 'p = 0.03、α = 0.05 时拒绝原假设；p = 0.06 只能说「没检出差别」，不能说两种方案相同。',
      formula: '',
      symbols: ['H₀ 原假设', 'α 事先约定的门槛']
    }
  },
  {
    title: '置信区间',
    aka: ['区间估计', '置信水平'],
    category: '统计',
    explain: {
      intuition: '报一个范围而不是一点，并说明这个范围的可靠程度有多大。',
      analogy: '与其说「到达要 47 分钟」，不如说「95% 的情况下落在 41 到 53 分钟」。',
      miniExample: '均值 12.4、95% 置信区间 [11.1, 13.7]，写结论时要把区间一起报出来才说明波动。',
      formula: '点估计 ± 临界值 × 标准误。',
      symbols: ['标准误 估计本身的抖动大小', '临界值 由置信水平决定']
    }
  },
  {
    title: '相关不等于因果',
    aka: ['虚假相关'],
    category: '统计',
    explain: {
      intuition: '两个量同涨同跌，可能是互相引起，也可能有一个共同幕后因素，或者纯属巧合。',
      analogy: '冰淇淋卖得多、溺水也多，幕后是夏天。',
      miniExample: '若「气温」同时推高两者，控制气温后再看相关，才谈得上一点因果线索。',
      formula: '',
      symbols: ['混杂因素 同时影响两者的第三方变量']
    }
  },
  {
    title: '过拟合',
    aka: ['背答案', '泛化差'],
    category: '机器学习',
    explain: {
      intuition: '模型把训练数据里的噪声也当规律记住了，换新数据就露馅。',
      analogy: '只刷做过的那套题考满分，换一套题就不会。',
      miniExample: '训练集准确率 0.99、验证集 0.72，就是过拟合；报告要写验证或测试集的那个数。',
      formula: '',
      symbols: ['训练集 用来拟合', '验证集 用来调参', '测试集 只评一次']
    }
  },
  {
    title: '交叉验证',
    aka: ['k 折', '留一法'],
    category: '机器学习',
    explain: {
      intuition: '把数据轮流当考题，让每条数据都被考过一次，得到的成绩更可信。',
      analogy: '十套模拟卷轮流做，只在一套上刷高分不算数。',
      miniExample: '10 折交叉验证取 10 个误差的平均与波动；时间序列要按时间切，不能随机打乱。',
      formula: '',
      symbols: ['折 每轮被留出来当考题的那份', '随机打乱 对时序数据会造成数据泄漏']
    }
  },
  {
    title: '缺失值处理',
    aka: ['缺失', '插补'],
    category: '预处理',
    explain: {
      intuition: '空着的格子要么用某种规则补上，要么单独标记，但一定要写清按什么规则补的。',
      analogy: '点名册少了几个人，可以按平均值估、也可以直接标注「未到」，但不能当没少。',
      miniExample: '缺失 3% 时按同班同工序中位数补，并把这条判断写进数据预处理一节；缺失 40% 的列考虑删掉。',
      formula: '',
      symbols: ['随机缺失 与别的因素无关', '整段缺失 往往有系统原因，要单独说']
    }
  },
  {
    title: '异常值',
    aka: ['离群点', '粗大误差'],
    category: '预处理',
    explain: {
      intuition: '明显不属于正常波动范围的点，剔不剔都要有依据，不能只因为它碍眼。',
      analogy: '一次考试满分作文不能因为写得太好就划掉，得先确认是不是抄的。',
      miniExample: '超出 3σ 的读数标记为可疑，回附件核对记录时间；确认为设备故障的才剔除，并在正文写明剔了几条。',
      formula: '常用判据：|x − μ| > 3σ，或用四分位距 x < Q1 − 1.5IQR、x > Q3 + 1.5IQR。',
      symbols: ['σ 标准差', 'Q1/Q3 第一、第三四分位数', 'IQR 四分位距']
    }
  },
  {
    title: '平稳性',
    aka: ['差分', '单位根'],
    category: '预测',
    explain: {
      intuition: '序列的均值和波动幅度不随时间漂移，才能用自回归那一类模型外推。',
      analogy: '秤的读数得先稳定下来，你才谈得上预测它下一步停在哪。',
      miniExample: '含明显上升趋势的销量序列要先做一阶差分，差分后看不出趋势与季节，再定 ARIMA 的阶。',
      formula: 'd 阶差分：Δᵈy_t = Δ^{d−1}y_t − Δ^{d−1}y_{t−1}。',
      symbols: ['趋势 均值随时间漂移', '季节性 固定周期起伏']
    }
  },
  {
    title: '信息熵',
    aka: ['熵', '混乱度'],
    category: '评价',
    explain: {
      intuition: '一个指标的取值越「平」，它提供的区分信息越少，熵就越大。',
      analogy: '所有人都是满分的那门课，几乎不提供「谁更强」的信息。',
      miniExample: '某指标所有方案取值相同，它的熵接近 1、权重接近 0，等于自动退出评价。',
      formula: 'e_j = −(1/ln n)Σᵢ p_ij ln p_ij。',
      symbols: ['p_ij 第 j 项指标上的占比', 'n 方案个数']
    }
  },
  {
    title: '一致性检验',
    aka: ['CR', '判断矩阵一致'],
    category: '评价',
    explain: {
      intuition: '两两比较时不能自相矛盾，一致性检验就是量一下你的判断有多矛盾。',
      analogy: '说甲比乙强、乙比丙强，却说丙比甲强很多，这就是不一致。',
      miniExample: '三阶判断矩阵算出 CI = 0.06、RI = 0.58，则 CR ≈ 0.10，刚好卡在门槛上，应回头修最离谱那一对比较。',
      formula: 'CR = CI/RI，CI = (λ_max − n)/(n − 1)，一般要求 CR < 0.1。',
      symbols: ['λ_max 判断矩阵最大特征值', 'n 指标个数', 'RI 同阶随机一致性指标']
    }
  }
]

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

interface IndexRow {
  key: string
  src: ExplainSource
}

/** 方法卡名称与别名在前、术语表在后；同一段文字按最长匹配优先命中 */
const INDEX: IndexRow[] = [
  ...METHOD_CARDS.flatMap((c): IndexRow[] => {
    const explain = METHOD_EXPLAIN[c.id]
    if (!explain) return []
    const src: ExplainSource = { kind: 'method', ref: c.id, title: c.name, category: c.category, explain }
    return [c.name, ...c.aka].map((key) => ({ key: norm(key), src }))
  }),
  ...TERMS.flatMap((t): IndexRow[] => {
    const src: ExplainSource = { kind: 'term', ref: t.title, title: t.title, category: t.category, explain: t.explain }
    return [t.title, ...t.aka].map((key) => ({ key: norm(key), src }))
  })
]

/** 方法卡展开时直接按 id 取讲解，不走名称匹配 */
export function methodExplainSource(id: string): ExplainSource | null {
  const card = METHOD_CARDS.find((c) => c.id === id)
  const explain = card ? METHOD_EXPLAIN[id] : undefined
  if (!card || !explain) return null
  return { kind: 'method', ref: card.id, title: card.name, category: card.category, explain }
}

export function explainLookup(query: string): ExplainSource | null {
  const q = norm(query)
  if (!q) return null
  const hits = INDEX.filter((r) => r.key.length >= 2 && (q.includes(r.key) || r.key.includes(q)))
  if (!hits.length) return null
  hits.sort((a, b) => b.key.length - a.key.length)
  return hits[0]?.src ?? null
}

/** 一段话里出现的所有可讲解名词（教练选项与追问都靠它挂「这是什么？」） */
export function explainHits(text: string): ExplainSource[] {
  const q = norm(text)
  const out: ExplainSource[] = []
  const seen = new Set<string>()
  for (const r of [...INDEX].sort((a, b) => b.key.length - a.key.length)) {
    if (r.key.length < 2) continue
    if (!q.includes(r.key) || seen.has(r.src.ref)) continue
    seen.add(r.src.ref)
    out.push(r.src)
  }
  return out
}

export const EXPLAIN_MISSING_HINT = '本地语料没有这一条，可以让教练用一句话解释（只讲直觉，不替你选）'
