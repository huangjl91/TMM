import { useState, type ReactNode } from 'react'
import katex from 'katex'
import {
  Brain, ChartBar, CheckCircle, Code, Gear, Lightbulb, Lightning, ListBullets,
  NotePencil, Prohibit, PushPin, RocketLaunch, Ruler, Target, Warning
} from '@phosphor-icons/react'
import type { CandidateModelInfo } from '@shared/guidedQuiz'

interface Props {
  models?: CandidateModelInfo[]
  questionIdx: number
  onStartQuiz?: () => void
  onSendToSandbox?: (code: string) => void
}

function MathDisplay({ math, block = false }: { math: string; block?: boolean }): ReactNode {
  try {
    const html = katex.renderToString(math, {
      displayMode: block,
      throwOnError: false
    })
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  } catch {
    return <code className="font-mono text-amber-300">{math}</code>
  }
}

export function CandidateModelLecture({
  models = [],
  questionIdx,
  onStartQuiz,
  onSendToSandbox
}: Props): ReactNode {
  // 默认展开第一个主力模型
  const [expandedId, setExpandedId] = useState<string | null>(models[0]?.id ?? null)
  const [activeTab, setActiveTab] = useState<'formulas' | 'scenarios' | 'mapping' | 'pitfalls'>('formulas')

  if (!models || models.length === 0) return null

  const currentModel = models.find((m) => m.id === expandedId) || models[0]

  return (
    <div className="space-y-4 rounded-xl border border-sky-500/25 bg-[#0f1420] p-4 text-xs shadow-xl">
      {/* 头部导航标题 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-600 text-sm shadow">
            <Brain size={16} weight="duotone" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">问题 {questionIdx} 候选数学模型深度剖析池</span>
              <span className="rounded bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 text-[10px] text-sky-300">
                出题人意图与机理推导
              </span>
            </div>
            <p className="text-[11px] text-white/60">
              点开下方模型可查看针对本小问的详细公式推导、适用场景判断、赛题数据映射与避坑指南
            </p>
          </div>
        </div>

        {onStartQuiz ? (
          <button
            onClick={onStartQuiz}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/25 shadow-sm"
          >
            <NotePencil size={14} />
            <span>进入本问 4 阶梯实操选择题</span>
            <span>↓</span>
          </button>
        ) : null}
      </div>

      {/* 候选模型卡片切换选择区 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {models.map((m) => {
          const isSelected = m.id === expandedId
          const isPrimary = m.role === 'primary'
          const isDefense = m.role === 'defense'

          const borderCls = isSelected
            ? isPrimary
              ? 'border-emerald-400 bg-emerald-950/30 ring-1 ring-emerald-400/50'
              : isDefense
                ? 'border-amber-400 bg-amber-950/30 ring-1 ring-amber-400/50'
                : 'border-sky-400 bg-sky-950/30 ring-1 ring-sky-400/50'
            : 'border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/[0.03]'

          const badgeCls = isPrimary
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            : isDefense
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-500/20 border-slate-500/40 text-slate-300'

          return (
            <div
              key={m.id}
              onClick={() => {
                setExpandedId(m.id)
              }}
              className={`cursor-pointer rounded-lg border p-3 transition-all space-y-2 relative flex flex-col justify-between ${borderCls}`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${badgeCls}`}>
                    {m.roleBadge}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-sky-400">
                    {m.suitabilityScore}% 契合
                  </span>
                </div>

                <div className="font-semibold text-white text-xs leading-snug">{m.name}</div>
                <div className="text-[10px] text-white/50 font-mono truncate">{m.aka}</div>
                <p className="text-[11px] text-white/75 leading-relaxed line-clamp-2">{m.fitReason}</p>
              </div>

              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                <span className="text-white/40">点击查看公式与解析</span>
                <span className={`font-semibold ${isSelected ? 'text-sky-300' : 'text-white/60'}`}>
                  {isSelected ? '正在研读 ▾' : '研读此模型 ▸'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 展开的深度讲解专栏 */}
      {currentModel ? (
        <div className="rounded-xl border border-sky-500/30 bg-[#0d121c] p-4 space-y-4 shadow-inner">
          {/* 模型名称与子标签栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-sky-200">{currentModel.name}</span>
                <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] text-white/70">
                  {currentModel.roleBadge}
                </span>
              </div>
              <p className="text-[11px] text-white/60 mt-0.5">{currentModel.mathFormulation.overview}</p>
            </div>

            {/* 4 大核心维度选项卡 */}
            <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-1 text-xs">
              <button
                onClick={() => setActiveTab('formulas')}
                className={`rounded px-2.5 py-1 transition-all ${
                  activeTab === 'formulas'
                    ? 'bg-sky-500/30 text-sky-200 font-semibold shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1"><Ruler size={14} />模型公式是什么</span>
              </button>
              <button
                onClick={() => setActiveTab('scenarios')}
                className={`rounded px-2.5 py-1 transition-all ${
                  activeTab === 'scenarios'
                    ? 'bg-sky-500/30 text-sky-200 font-semibold shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1"><Target size={14} />适用场景与判断</span>
              </button>
              <button
                onClick={() => setActiveTab('mapping')}
                className={`rounded px-2.5 py-1 transition-all ${
                  activeTab === 'mapping'
                    ? 'bg-sky-500/30 text-sky-200 font-semibold shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1"><Code size={14} />赛题附件落地</span>
              </button>
              <button
                onClick={() => setActiveTab('pitfalls')}
                className={`rounded px-2.5 py-1 transition-all ${
                  activeTab === 'pitfalls'
                    ? 'bg-sky-500/30 text-sky-200 font-semibold shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1"><Warning size={14} />评委避坑指南</span>
              </button>
            </div>
          </div>

          {/* Tab 1: 核心数学模型公式 (模型公式是什么) */}
          {activeTab === 'formulas' && (
            <div className="space-y-4">
              {/* 决策变量清单 */}
              {currentModel.mathFormulation.variables.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="font-semibold text-sky-300 text-xs flex items-center gap-1.5">
                    <ListBullets size={14} />
                    <span>决策变量与物理量符号说明</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/30">
                    <table className="w-full text-left text-[11px]">
                      <thead className="border-b border-white/10 bg-white/[0.04] text-white/70">
                        <tr>
                          <th className="py-1.5 px-3">符号</th>
                          <th className="py-1.5 px-3">物理名称</th>
                          <th className="py-1.5 px-3">在微网/赛题中的实际含义</th>
                          <th className="py-1.5 px-3">定义域与取值边界</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white/80">
                        {currentModel.mathFormulation.variables.map((v, i) => (
                          <tr key={i} className="hover:bg-white/[0.02]">
                            <td className="py-1.5 px-3 font-mono text-sky-300 font-bold">
                              <MathDisplay math={v.symbol} />
                            </td>
                            <td className="py-1.5 px-3 text-white/90 font-medium">{v.name}</td>
                            <td className="py-1.5 px-3 text-white/70">{v.physicalMeaning}</td>
                            <td className="py-1.5 px-3 font-mono text-emerald-300/90">
                              <MathDisplay math={v.domain} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* 目标函数公式 */}
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-300 text-xs flex items-center gap-1.5">
                    <Target size={14} />
                    <span>目标函数 (Objective Function)</span>
                  </span>
                  <span className="text-[10px] text-amber-200/60 font-mono">LaTeX / KaTeX 严密表达</span>
                </div>
                <div className="py-2 px-3 rounded bg-black/40 border border-white/5 text-center overflow-x-auto text-amber-100 text-sm">
                  <MathDisplay math={currentModel.mathFormulation.objectiveLatex} block />
                </div>
                <p className="text-[11px] text-white/80 leading-relaxed">
                  <span className="font-semibold text-amber-300/90">经济/机理意图：</span>
                  {currentModel.mathFormulation.objectiveDesc}
                </p>
              </div>

              {/* 核心约束条件方程组 */}
              {currentModel.mathFormulation.constraints.length > 0 ? (
                <div className="space-y-2">
                  <div className="font-semibold text-sky-300 text-xs flex items-center gap-1.5">
                    <Lightning size={14} />
                    <span>核心物理机理与约束方程组 (Governing Constraints)</span>
                  </div>
                  <div className="space-y-2">
                    {currentModel.mathFormulation.constraints.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-white/10 bg-black/30 p-2.5 space-y-1.5 transition-all hover:border-sky-500/30"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-sky-300">
                            {i + 1}. {c.name}
                          </span>
                        </div>
                        <div className="py-1.5 px-2.5 rounded bg-black/50 border border-white/5 overflow-x-auto text-sky-100 text-center text-xs">
                          <MathDisplay math={c.latex} block />
                        </div>
                        <p className="text-[11px] text-white/70 leading-relaxed">
                          <span className="text-white/50">物理定律与意义：</span>
                          {c.physicalMeaning}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 紧凑矩阵表示 */}
              {currentModel.mathFormulation.matrixForm ? (
                <div className="rounded-lg border border-white/5 bg-black/20 p-2.5 space-y-1">
                  <div className="text-[11px] text-white/50 font-semibold">矩阵标准型表达 (Matrix Canonical Form):</div>
                  <div className="text-center font-mono text-xs text-white/80 py-1">
                    <MathDisplay math={currentModel.mathFormulation.matrixForm} block />
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Tab 2: 适用场景与判断标准 (对于什么问题可以用这个模型) */}
          {activeTab === 'scenarios' && (
            <div className="space-y-3.5">
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-3 space-y-2">
                <div className="font-semibold text-sky-300 text-xs flex items-center gap-1">
                  <PushPin size={14} />
                  <span>对于什么类型的问题可以用这个模型？</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentModel.applicableScenarios.problemTypes.map((pt, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200"
                    >
                      ✓ {pt}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-3 space-y-1.5">
                  <div className="font-semibold text-emerald-300 text-xs flex items-center gap-1">
                    <Lightbulb size={14} />
                    <span>何时应该首选该模型？（判定特征）</span>
                  </div>
                  <p className="text-[11px] text-white/80 leading-relaxed">
                    {currentModel.applicableScenarios.whenToUse}
                  </p>
                </div>

                <div className="rounded-lg border border-rose-500/25 bg-rose-950/20 p-3 space-y-1.5">
                  <div className="font-semibold text-rose-300 text-xs flex items-center gap-1">
                    <Prohibit size={14} />
                    <span>何时不适用？（失效边界与缺陷）</span>
                  </div>
                  <p className="text-[11px] text-white/80 leading-relaxed">
                    {currentModel.applicableScenarios.whenNotToUse}
                  </p>
                </div>
              </div>

              {/* 优缺点对比 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-1.5">
                  <div className="flex items-center gap-1 font-medium text-emerald-300 text-xs"><CheckCircle size={14} />核心优势 (Pros)</div>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-white/75">
                    {currentModel.applicableScenarios.prosAndCons.pros.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-1.5">
                  <div className="flex items-center gap-1 font-medium text-amber-300 text-xs"><Warning size={14} />局限性与挑战 (Cons)</div>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-white/75">
                    {currentModel.applicableScenarios.prosAndCons.cons.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: 本赛题附件数据映射与求解落地 */}
          {activeTab === 'mapping' && (
            <div className="space-y-3.5">
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-3 space-y-2">
                <div className="font-semibold text-sky-300 text-xs flex items-center gap-1">
                  <ChartBar size={14} />
                  <span>如何映射到本题的附件数据文件？</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-white/80">
                  {currentModel.practicalMapping.dataInputs.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1.5">
                <div className="font-semibold text-emerald-300 text-xs flex items-center gap-1">
                  <Gear size={14} />
                  <span>推荐工业级求解器与工具链</span>
                </div>
                <p className="text-[11px] text-white/80 leading-relaxed font-mono">
                  {currentModel.practicalMapping.solverRecommendation}
                </p>
              </div>

              {currentModel.practicalMapping.pythonSnippet ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-sky-300 flex items-center gap-1">
                      <Code size={14} />
                      <span>核心 Python 建模代码范式</span>
                    </span>
                    {onSendToSandbox ? (
                      <button
                        onClick={() => onSendToSandbox(currentModel.practicalMapping.pythonSnippet!)}
                        className="rounded bg-sky-500/20 border border-sky-500/30 px-2.5 py-0.5 text-[11px] text-sky-300 hover:bg-sky-500/30 transition-all"
                      >
                        ▶ 发送到沙箱试跑
                      </button>
                    ) : null}
                  </div>
                  <pre className="overflow-x-auto rounded-lg border border-white/10 bg-[#07090e] p-3 text-[11px] text-white/80 font-mono leading-relaxed max-h-[260px] overflow-y-auto">
                    {currentModel.practicalMapping.pythonSnippet}
                  </pre>
                </div>
              ) : null}
            </div>
          )}

          {/* Tab 4: 评委避坑指南与灵敏度对冲 */}
          {activeTab === 'pitfalls' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3 space-y-2">
                <div className="font-semibold text-amber-300 text-xs flex items-center gap-1.5">
                  <Warning size={14} />
                  <span>国赛/美赛评委踩坑排查与拔高加分技巧</span>
                </div>
                <div className="space-y-2">
                  {currentModel.pitfallsAndTips.map((tip, i) => (
                    <div
                      key={i}
                      className="rounded border border-amber-500/20 bg-black/30 p-2.5 text-[11px] text-amber-100/90 leading-relaxed"
                    >
                      {tip}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 底部引导做题操作栏 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <div className="flex items-center gap-1 text-[11px] text-white/60">
              <Lightbulb size={14} />已全面理解模型公式与适用场景？带着这些机理知识，进入下方的 4 阶梯选择题！
            </div>
            {onStartQuiz ? (
              <button
                onClick={onStartQuiz}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-4 py-1.5 text-xs font-bold text-emerald-200 transition-all hover:bg-emerald-500/30 shadow-md"
              >
                <RocketLaunch size={14} />
                <span>带着该模型公式，开始做选择题</span>
                <span>↓</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
