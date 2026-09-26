import { useEffect, useState, type ReactNode } from 'react'
import {
  GUIDED_STEPS,
  buildDefaultGuidedQuestions,
  type AiAdvice,
  type GuidedQuestion,
  type GuidedSessionState,
  type GuidedStep,
  type StepChoice
} from '@shared/guidedQuiz'
import type { QuestionView } from '@shared/questions'
import type { ProblemFileContent } from '@shared/types'
import { A4ProblemViewer } from './A4ProblemViewer'
import { CandidateModelLecture } from './CandidateModelLecture'

import type { DataFileProfile, SessionFileView } from '@shared/intake'
import { buildRealDataPreviewCode, humanSize, isReadableTabularFile } from '@shared/intake'
import {
  buildPredictionBaselineCode,
  summarizePredictionEvidence,
  type PredictionEvidenceSummary
} from '@shared/prediction'

interface Props {
  sessionId: number | null
  questions: QuestionView[]
  files?: SessionFileView[]
  activeQuestionIdx: number
  onSelectQuestion: (idx: number) => void
  onIntake?: () => void
  intakeBusy?: boolean
  onSendToSandbox?: (code: string) => void
}

export function GuidedQuizPanel({
  sessionId,
  questions,
  files,
  activeQuestionIdx,
  onSelectQuestion,
  onIntake,
  intakeBusy,
  onSendToSandbox
}: Props): ReactNode {
  const [state, setState] = useState<GuidedSessionState | null>(null)
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [userNote, setUserNote] = useState<string>('')
  const [aiAdvice, setAiAdvice] = useState<AiAdvice | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [activeStep, setActiveStep] = useState<GuidedStep>('intuition')
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [sandboxRunning, setSandboxRunning] = useState(false)
  const [sandboxMessage, setSandboxMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [predictionEvidence, setPredictionEvidence] = useState<PredictionEvidenceSummary | null>(null)
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [categoryUpdating, setCategoryUpdating] = useState(false)
  const [problemFile, setProblemFile] = useState<ProblemFileContent | null>(null)
  const [pdfExpanded, setPdfExpanded] = useState(false)
  const [selectedDataRelPath, setSelectedDataRelPath] = useState('')
  const [selectedSheet, setSelectedSheet] = useState('')
  const [dataProfile, setDataProfile] = useState<DataFileProfile | null>(null)
  const [xColumn, setXColumn] = useState('')
  const [yColumns, setYColumns] = useState<string[]>([])

  const currentQIdx = activeQuestionIdx > 0 ? activeQuestionIdx : 1

  // 异步回读赛题真实 PDF 附件与文本内容
  useEffect(() => {
    if (!sessionId) {
      setProblemFile(null)
      return
    }
    let active = true

    window.api
      .problemPdf(sessionId)
      .then((pf) => {
        if (!active) return
        setProblemFile(pf)
      })
      .catch((e: unknown) => {
        console.warn('Failed to load problem file:', e)
      })

    return () => {
      active = false
    }
  }, [sessionId])

  // 加载当前小问的引导状态
  useEffect(() => {
    if (!sessionId) {
      // 未建会话时使用本地预设题
      const { knowledge, questions, candidateModels } = buildDefaultGuidedQuestions(currentQIdx, '')
      setState({
        questionIdx: currentQIdx,
        questionLabel: `问题 ${currentQIdx}`,
        questionBrief: '（尚未导入题目，先按经典数模题型体验引导做题流程）',
        sourceReady: false,
        categoryAssessment: {
          detected: 'prediction',
          active: 'prediction',
          overridden: false,
          reasons: ['等待真实题目文本']
        },
        currentStep: 'intuition',
        completed: false,
        knowledge,
        candidateModels,
        choices: {}
      })
      setActiveStep('intuition')
      setAiAdvice(questions.intuition.aiAdvice)
      setSelectedKey('')
      return
    }

    setSyncStatus(null)
    setGeneratedImgUrl(null)
    window.api
      .getGuidedState(sessionId, currentQIdx)
      .then((s) => {
        setState(s)
        setActiveStep(s.currentStep)
        const choice = s.choices[s.currentStep]
        setSelectedKey(choice ? choice.pickedKey : '')
        setUserNote(choice?.userNote ?? '')
        setAiAdvice(null)
      })
      .catch((e: unknown) => {
        console.error('Failed to load guided state:', e)
      })
  }, [sessionId, currentQIdx])

  const brief = state?.questionBrief || questions.find((q) => q.idx === currentQIdx)?.brief || ''
  const { questions: stepQuestions, candidateModels: fallbackModels } = buildDefaultGuidedQuestions(
    currentQIdx,
    brief
  )
  const curQ: GuidedQuestion = state?.questions?.[activeStep] || stepQuestions[activeStep]
  const curModels = state?.candidateModels?.length ? state.candidateModels : fallbackModels
  const readableDataFiles = files?.filter(isReadableTabularFile) ?? []
  const selectedDataFile = readableDataFiles.find((file) => file.relPath === selectedDataRelPath) ?? readableDataFiles[0]
  const effectiveVisualizationCode = selectedDataFile
    ? buildRealDataPreviewCode(selectedDataFile, {
        sheetName: selectedSheet || null,
        xColumn: xColumn || null,
        yColumns
      })
    : null
  const effectivePredictionCode = selectedDataFile && state?.categoryAssessment.active === 'prediction'
    ? buildPredictionBaselineCode(selectedDataFile, {
        sheetName: selectedSheet || null,
        xColumn: xColumn || null,
        targetColumn: yColumns[0] || null
      })
    : null

  useEffect(() => {
    setPredictionEvidence(null)
  }, [sessionId, currentQIdx, selectedDataFile?.relPath, selectedSheet, xColumn, yColumns[0]])

  useEffect(() => {
    if (!selectedDataFile || !sessionId) {
      setDataProfile(null)
      return
    }
    if (selectedDataRelPath !== selectedDataFile.relPath) setSelectedDataRelPath(selectedDataFile.relPath)
    let active = true
    window.api
      .inspectDataFile(sessionId, selectedDataFile.relPath, selectedSheet || undefined)
      .then((profile) => {
        if (!active) return
        setDataProfile(profile)
        if (!selectedSheet && profile.activeSheet) setSelectedSheet(profile.activeSheet)
        setXColumn((current) => current && profile.columns.includes(current) ? current : (profile.columns[0] ?? ''))
        setYColumns((current) => {
          const kept = current.filter((column) => profile.numericColumns.includes(column))
          return kept.length ? kept : profile.numericColumns.filter((column) => column !== profile.columns[0]).slice(0, 4)
        })
      })
      .catch((error: unknown) => {
        if (active) console.error('Failed to inspect data attachment:', error)
      })
    return () => { active = false }
  }, [sessionId, selectedDataFile?.relPath, selectedSheet])

  // 深度重新解构本问（结合赛题全文重新提取机理并刷新引导题）
  const handleReanalyze = async (): Promise<void> => {
    if (!sessionId) return
    setReanalyzing(true)
    try {
      const nextState = await window.api.reanalyzeGuided(sessionId, currentQIdx)
      setState(nextState)
      const prevChoice = nextState.choices[activeStep]
      setSelectedKey(prevChoice ? prevChoice.pickedKey : '')
      setUserNote(prevChoice?.userNote ?? '')
      setAiAdvice(null)
    } catch (e) {
      console.error('Failed to reanalyze guided questions:', e)
    } finally {
      setReanalyzing(false)
    }
  }

  const handleCategoryChange = async (category: 'auto' | 'prediction' | 'optimization' | 'evaluation'): Promise<void> => {
    if (!sessionId) return
    setCategoryUpdating(true)
    try {
      const nextState = await window.api.setGuidedCategory({
        sessionId,
        questionIdx: currentQIdx,
        category
      })
      setState(nextState)
      setActiveStep('intuition')
      setSelectedKey('')
      setUserNote('')
      setAiAdvice(null)
    } catch (e) {
      console.error('Failed to update guided category:', e)
    } finally {
      setCategoryUpdating(false)
    }
  }

  // 切换步骤时同步当前已选答案与建议
  const handleStepChange = (step: GuidedStep): void => {
    setActiveStep(step)
    const prev = state?.choices[step]
    setSelectedKey(prev ? prev.pickedKey : '')
    setUserNote(prev?.userNote ?? '')
    setAiAdvice(null)
  }

  // 听听 AI 导师怎么看
  const handleAskAi = async (): Promise<void> => {
    if (aiAdvice) {
      setAiAdvice(null) // 点击可收起
      return
    }
    if (!sessionId) {
      setAiAdvice(curQ.aiAdvice)
      return
    }

    setAiLoading(true)
    try {
      const advice = await window.api.askGuidedAdvice({
        sessionId,
        questionIdx: currentQIdx,
        step: activeStep,
        ask: curQ.ask,
        options: curQ.options.map((o) => ({ key: o.key, text: o.text, means: o.means }))
      })
      setAiAdvice(advice)
    } catch (e) {
      console.warn('askGuidedAdvice error, fallback:', e)
      setAiAdvice(curQ.aiAdvice)
    } finally {
      setAiLoading(false)
    }
  }

  // 确认当前选择并进入下一步
  const handleConfirmChoice = async (): Promise<void> => {
    if (!selectedKey) return
    const opt = curQ.options.find((o) => o.key === selectedKey)
    if (!opt) return

    const choice: StepChoice = {
      pickedKey: opt.key,
      pickedText: opt.text,
      pickedMeans: opt.means,
      userNote: userNote.trim() || undefined,
      timestamp: Date.now()
    }

    if (sessionId) {
      try {
        const nextState = await window.api.chooseGuidedStep({
          sessionId,
          questionIdx: currentQIdx,
          step: activeStep,
          pickedKey: choice.pickedKey,
          pickedText: choice.pickedText,
          pickedMeans: choice.pickedMeans,
          userNote: choice.userNote
        })
        setState(nextState)
      } catch (e) {
        console.error('Failed to save choice:', e)
      }
    } else {
      setState((prev) => {
        if (!prev) return prev
        const nextChoices = { ...prev.choices, [activeStep]: choice }
        return {
          ...prev,
          choices: nextChoices,
          completed: GUIDED_STEPS.every((s) => Boolean(nextChoices[s.key]))
        }
      })
    }

    // 自动切到下一个未完成 step
    const steps: GuidedStep[] = ['intuition', 'model_select', 'formulation', 'visualization']
    const curIdx = steps.indexOf(activeStep)
    if (curIdx < steps.length - 1) {
      handleStepChange(steps[curIdx + 1] as GuidedStep)
    }
  }

  // 一键同步到任务卡
  const handleSyncToTasks = async (): Promise<void> => {
    if (!sessionId) {
      setSyncStatus('请先在主界面新建会话或导入题目')
      return
    }
    setSyncStatus('正在同步至任务卡与论文结构...')
    try {
      const res = await window.api.syncGuided(sessionId, currentQIdx)
      setSyncStatus(res.message)
    } catch (e) {
      setSyncStatus(`同步失败：${(e as Error).message}`)
    }
  }

  // 运行第四步的数据检查或预测基线代码
  const handleRunVisualizationCode = async (mode: 'preview' | 'prediction' = 'preview'): Promise<void> => {
    const code = mode === 'prediction' ? effectivePredictionCode : effectiveVisualizationCode
    if (!code) return
    if (onSendToSandbox) {
      onSendToSandbox(code)
    }

    if (!sessionId) return
    setSandboxRunning(true)
    setGeneratedImgUrl(null)
    setSandboxMessage(null)
    if (mode === 'prediction') setPredictionEvidence(null)
    try {
      const run = await window.api.runCode({ sessionId, code })
      if (!run.ok) {
        setSandboxMessage({
          ok: false,
          text: run.error?.message || run.stderr || '运行失败，请检查数据字段与内容。'
        })
        return
      }
      const preferredName = mode === 'prediction' ? 'prediction_baseline.png' : 'real_data_preview.png'
      const firstImg = run.artifacts.find((a) => a.name === preferredName) ?? run.artifacts.find(
        (a) => Boolean(a.dataUrl) || a.name.endsWith('.png') || a.name.endsWith('.jpg')
      )
      if (firstImg?.dataUrl) {
        setGeneratedImgUrl(firstImg.dataUrl)
      }
      if (mode === 'prediction' && run.artifacts.some((a) => a.name === 'model_evidence.json')) {
        const evidenceFile = await window.api.readArtifact(sessionId, 'model_evidence.json')
        if (evidenceFile.text) {
          setPredictionEvidence(summarizePredictionEvidence(JSON.parse(evidenceFile.text)))
        }
      }
      setSandboxMessage({
        ok: true,
        text: mode === 'prediction'
          ? '预测基线已完成：结果表、验证图和 model_evidence.json 已写入本会话工作区。'
          : '数据检查已完成：预览图和 evidence_manifest.json 已写入本会话工作区。'
      })
    } catch (e) {
      console.error('Run visualization failed:', e)
      setSandboxMessage({ ok: false, text: (e as Error).message })
    } finally {
      setSandboxRunning(false)
    }
  }

  const qList =
    questions.length >= 2
      ? questions
      : [{ idx: 1, label: '问题 1', brief: '第一问解题引导' }]

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0f1115] text-white/90">
      {/* 顶部：小问切换 Tabs 与 导入按钮 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#141720] px-5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/20 text-xs font-bold text-sky-400">
            解
          </span>
          <span className="text-sm font-semibold tracking-wide text-white">引导式解题中心</span>
          <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">
            由浅入深 · 决策式做题
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 导入赛题与附件按钮 */}
          {onIntake ? (
            <button
              onClick={onIntake}
              disabled={intakeBusy}
              className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-200 transition-all hover:bg-sky-500/25 disabled:opacity-40"
              title="选择题目 PDF/文档及数据附件，系统将自动切分问题并准备引导"
            >
              <span>{intakeBusy ? '⏳' : '📥'}</span>
              <span>{intakeBusy ? '正在解析赛题...' : '导入赛题与附件'}</span>
            </button>
          ) : null}

          {/* 问题切换轴 */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 p-1">
            {qList.map((q) => {
              const active = q.idx === currentQIdx
              return (
                <button
                  key={q.idx}
                  onClick={() => onSelectQuestion(q.idx)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    active
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>{q.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 已导入赛题与数据文件展示栏 */}
      {files && files.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-[#10131a] px-5 py-2 text-xs">
          <span className="text-white/40 font-medium">已导入：</span>
          {files.map((f) => (
            <div
              key={f.id}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${
                f.kind === 'problem'
                  ? 'border-sky-500/40 bg-sky-500/15 text-sky-200 font-medium'
                  : 'border-white/10 bg-white/5 text-white/70'
              }`}
              title={f.digest}
            >
              <span className={f.kind === 'problem' ? 'text-sky-300' : 'text-emerald-400'}>
                {f.kind === 'problem' ? '📄 题' : '📊 附'}
              </span>
              <span className="max-w-[140px] truncate">{f.name}</span>
              <span className="text-[10px] text-white/35">({humanSize(f.size)})</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex-1 space-y-4 p-5">
        {!state?.sourceReady ? (
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-8 text-center shadow-sm">
            <div className="text-3xl">📥</div>
            <h2 className="mt-3 text-base font-semibold text-white">先提供真实题目，再开始建模引导</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/60">
              当前没有可追溯的题目文本。系统不会预填题型、候选模型、模拟指标或论文结论，以免把示例误当成真实分析。
            </p>
            {onIntake ? (
              <button
                onClick={onIntake}
                disabled={intakeBusy}
                className="mt-5 rounded-xl bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
              >
                {intakeBusy ? '正在解析赛题...' : '导入题目与数据附件'}
              </button>
            ) : null}
          </div>
        ) : (
        <>
        {/* 当前问题简介与深度解构看板 */}
        <div className="rounded-xl border border-white/10 bg-[#161a23] p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">问题 {currentQIdx}</span>
              <span className="text-xs text-white/40">
                {state?.knowledge.topic ? `考点方向：${state.knowledge.topic}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing || !sessionId}
                className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-200 transition-all hover:bg-sky-500/25 disabled:opacity-40"
                title="重新结合赛题全文与出题人意图进行第一性原理解构"
              >
                <span>{reanalyzing ? '⏳' : '🧠'}</span>
                <span>{reanalyzing ? '正在深度解构题目中...' : '重新深度解构本问'}</span>
              </button>
              <button
                onClick={() => setShowKnowledge((v) => !v)}
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
              >
                <span>{showKnowledge ? '收起知识谱系 ▴' : '查看知识谱系 ▾'}</span>
              </button>
            </div>
          </div>

          {/* 赛题 A4 原件视窗 (真实高清渲染) */}
          <A4ProblemViewer
            pdfDataUrl={problemFile?.dataUrl ?? null}
            fileName={problemFile?.name}
            currentQIdx={currentQIdx}
            expanded={pdfExpanded}
            onToggleExpand={() => setPdfExpanded((v) => !v)}
            onOpenExternal={sessionId ? () => window.api.openProblemPdf(sessionId) : undefined}
          />

          {state?.categoryAssessment ? (
            <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.05] p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-indigo-200">题型判断：</span>
                  <span className="text-white/80">
                    {{ optimization: '优化决策', prediction: '预测分析', evaluation: '综合评价' }[state.categoryAssessment.active]}
                  </span>
                  {state.categoryAssessment.overridden ? (
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">学生已修正</span>
                  ) : null}
                  <div className="mt-1 text-[11px] text-white/45">
                    判断依据：{state.categoryAssessment.reasons.join('；')}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-white/55">
                  <span>发现判断不对：</span>
                  <select
                    value={state.categoryAssessment.overridden ? state.categoryAssessment.active : 'auto'}
                    disabled={categoryUpdating}
                    onChange={(e) => void handleCategoryChange(e.target.value as 'auto' | 'prediction' | 'optimization' | 'evaluation')}
                    className="rounded-md border border-white/10 bg-[#11151d] px-2 py-1 text-white outline-none focus:border-indigo-400"
                  >
                    <option value="auto">自动判断</option>
                    <option value="optimization">优化决策</option>
                    <option value="prediction">预测分析</option>
                    <option value="evaluation">综合评价</option>
                  </select>
                </label>
              </div>
              {state.categoryAssessment.overridden ? (
                <div className="mt-2 text-[11px] text-amber-200/80">修改题型后，旧选择已清空，候选模型与四阶梯问题已重新生成。</div>
              ) : null}
            </div>
          ) : null}

          {/* 赛题深度解构与要素看板 */}
          {state?.elements ? (
            <div className="rounded-lg border border-sky-500/20 bg-[#121620] p-3 text-xs space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                <span>📋</span>
                <span>赛题深度解构与核心要素看板</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="rounded-md border border-white/5 bg-black/25 p-2.5 space-y-1">
                  <div className="font-medium text-amber-300 flex items-center gap-1">
                    <span>🎯</span>
                    <span>核心攻关目标</span>
                  </div>
                  <p className="text-white/80 leading-relaxed text-[11px]">{state.elements.coreTarget}</p>
                </div>
                <div className="rounded-md border border-white/5 bg-black/25 p-2.5 space-y-1">
                  <div className="font-medium text-sky-300 flex items-center gap-1">
                    <span>📊</span>
                    <span>关键输入与附件数据</span>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-3.5 text-white/70 text-[11px] leading-relaxed">
                    {state.elements.inputData.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-white/5 bg-black/25 p-2.5 space-y-1">
                  <div className="font-medium text-rose-300 flex items-center gap-1">
                    <span>⚡</span>
                    <span>物理机理与硬性约束</span>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-3.5 text-white/70 text-[11px] leading-relaxed">
                    {state.elements.physicsConstraints.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-white/5 bg-black/25 p-2.5 space-y-1">
                  <div className="font-medium text-emerald-300 flex items-center gap-1">
                    <span>📦</span>
                    <span>交付成果与规范表格</span>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-3.5 text-white/70 text-[11px] leading-relaxed">
                    {state.elements.deliverables.map((res, i) => (
                      <li key={i}>{res}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          {/* 可折叠的考察知识点卡片 */}
          {showKnowledge && state?.knowledge ? (
            <div className="mt-3 space-y-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-3 text-xs leading-5 text-sky-100/90">
              <div className="font-medium text-sky-300">💡 核心数学本质</div>
              <p className="text-white/80">{state.knowledge.mathEssence}</p>
              <div className="font-medium text-sky-300">📌 评审关键机理点</div>
              <ul className="list-disc space-y-0.5 pl-4 text-white/75">
                {state.knowledge.keyPrinciples.map((kp, i) => (
                  <li key={i}>{kp}</li>
                ))}
              </ul>
              <div className="font-medium text-amber-300">⚠️ 历年常见失分陷阱</div>
              <ul className="list-disc space-y-0.5 pl-4 text-amber-200/80">
                {state.knowledge.commonPitfalls.map((cp, i) => (
                  <li key={i}>{cp}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* 候选数学模型推导与深度教学解析池（适用场景、详细公式、赛题数据映射与避坑指南） */}
        <CandidateModelLecture
          models={curModels}
          questionIdx={currentQIdx}
          onStartQuiz={() => {
            const el = document.getElementById('guided-quiz-steps-container')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
          }}
          onSendToSandbox={onSendToSandbox}
        />

        {/* 承上启下的引导做题过渡横幅 */}
        <div
          id="guided-quiz-steps-container"
          className="flex items-center justify-between rounded-lg border border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-[#101928] to-indigo-950/40 p-3 text-xs shadow-sm"
        >
          <div className="flex items-center gap-2 text-sky-200">
            <span className="text-base">🎓</span>
            <div>
              <span className="font-semibold text-white">模型机理与公式研读完毕！</span>
              <span className="text-white/60 ml-1">现在请带着上述模型逻辑，完成以下 4 阶梯实操选择题：</span>
            </div>
          </div>
          <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-mono text-sky-300">
            4 阶梯实战 · 循序渐进
          </span>
        </div>

        {/* 4阶梯度步进指示器 (4 Steps) */}
        <div className="grid grid-cols-4 gap-2">
          {GUIDED_STEPS.map((s) => {
            const hasChoice = Boolean(state?.choices[s.key])
            const isCur = activeStep === s.key
            return (
              <button
                key={s.key}
                onClick={() => handleStepChange(s.key)}
                className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
                  isCur
                    ? 'border-sky-500/70 bg-sky-500/10 shadow-md ring-1 ring-sky-500/40'
                    : hasChoice
                    ? 'border-emerald-500/30 bg-emerald-500/[0.04] hover:bg-white/5'
                    : 'border-white/10 bg-[#141720] opacity-60 hover:opacity-90'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white/90">
                    {s.icon} {s.title}
                  </span>
                  {hasChoice ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-black">
                      ✓
                    </span>
                  ) : (
                    <span className="text-[10px] text-white/30">第{s.index}阶</span>
                  )}
                </div>
                <span className="mt-1 text-[11px] text-white/40 truncate">{s.subTitle}</span>
              </button>
            )
          })}
        </div>

        {/* 选择题核心答题区 */}
        <div className="rounded-xl border border-white/10 bg-[#161a23] p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-block rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                {curQ.stepTitle}
              </span>
              <h3 className="mt-2 text-base font-semibold leading-6 text-white">{curQ.ask}</h3>
              {curQ.description ? (
                <p className="mt-1 text-xs text-white/45">{curQ.description}</p>
              ) : null}
            </div>
            {state?.choices[activeStep] ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
                已确定：选 {state.choices[activeStep]?.pickedKey}
              </span>
            ) : null}
          </div>

          {/* 选项列表（先给出选项） */}
          <div className="space-y-2.5">
            {curQ.options.map((opt) => {
              const selected = selectedKey === opt.key
              return (
                <div
                  key={opt.key}
                  onClick={() => setSelectedKey(opt.key)}
                  className={`group relative flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                    selected
                      ? 'border-sky-500 bg-sky-500/15 shadow-sm'
                      : 'border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/[0.03]'
                  }`}
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                      selected
                        ? 'bg-sky-500 text-white'
                        : 'border border-white/20 bg-white/5 text-white/70 group-hover:border-white/40'
                    }`}
                  >
                    {opt.key}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-white/95">{opt.text}</span>
                      {opt.tag ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            opt.tag.includes('推荐') || opt.tag.includes('首选')
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : opt.tag.includes('坑') || opt.tag.includes('不推荐')
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-white/10 text-white/50'
                          }`}
                        >
                          {opt.tag}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs leading-relaxed text-white/45">{opt.means}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 🤖 核心特色：【问 AI 建议 / 听听 AI 怎么看】按钮 */}
          <div className="pt-1">
            <button
              onClick={handleAskAi}
              disabled={aiLoading}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium transition-all ${
                aiAdvice
                  ? 'border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'
                  : 'border-violet-500/30 bg-violet-600/20 text-violet-200 hover:border-violet-500/60 hover:bg-violet-600/30 shadow-sm'
              }`}
            >
              <span>{aiLoading ? '🔄' : '🤖'}</span>
              <span>
                {aiLoading
                  ? '正在深度分析题意与选项利弊...'
                  : aiAdvice
                  ? '收起 AI 导师选项分析 ▴'
                  : '犹豫不决？点击听听 AI 导师建议与利弊剖析 ▾'}
              </span>
            </button>

            {/* AI 导师深度分析展开卡 */}
            {aiAdvice ? (
              <div className="mt-3 space-y-3 rounded-xl border border-violet-500/30 bg-violet-950/20 p-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/30 text-xs">
                    💡
                  </span>
                  <span className="font-semibold text-violet-200">AI 导师推荐方案：</span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
                    推荐选择：{aiAdvice.recommended}
                  </span>
                </div>

                <div className="rounded-lg bg-black/30 p-3 leading-relaxed text-white/80">
                  <span className="font-medium text-violet-300">推荐依据：</span>
                  {aiAdvice.reason}
                </div>

                {aiAdvice.pitfalls && Object.keys(aiAdvice.pitfalls).length > 0 ? (
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-white/50">
                      各选项深度剖析与避坑指南：
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                      {Object.entries(aiAdvice.pitfalls).map(([k, desc]) => (
                        <div key={k} className="rounded-lg border border-white/5 bg-black/20 p-2">
                          <span
                            className={`font-bold ${
                              k === aiAdvice.recommended ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            选项 {k}：
                          </span>
                          <span className="text-white/60">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {aiAdvice.mathNote ? (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-sky-200">
                    <span className="font-medium text-sky-300">机理要点：</span>
                    {aiAdvice.mathNote}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 用户做决策与确认 */}
          <div className="flex items-center gap-3 pt-2">
            <input
              type="text"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              placeholder="你的决策理由（可选，写一句话加深理解）"
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-sky-500"
            />
            <button
              onClick={handleConfirmChoice}
              disabled={!selectedKey}
              className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-sky-500 disabled:opacity-40"
            >
              ✓ 确认选择并进入下一步
            </button>
          </div>
        </div>

        {/* 第 4 阶梯专属：【科研数据可视化与论文结论】专项面板 */}
        {activeStep === 'visualization' && curQ.visualization ? (
          <div className="rounded-xl border border-emerald-500/30 bg-[#131b18] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/20 text-xs font-bold text-emerald-400">
                  图
                </span>
                <span className="text-sm font-semibold text-white">科研数据可视化与结果验证</span>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                  以真实输出为准
                </span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => void handleRunVisualizationCode('preview')}
                  disabled={sandboxRunning || !effectiveVisualizationCode}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <span>{sandboxRunning ? '⏳' : '🚀'}</span>
                  <span>{sandboxRunning ? '正在沙箱中运行...' : '运行数据检查'}</span>
                </button>
                {state?.categoryAssessment.active === 'prediction' ? (
                  <button
                    onClick={() => void handleRunVisualizationCode('prediction')}
                    disabled={sandboxRunning || !effectivePredictionCode}
                    className="flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
                  >
                    <span>📈</span>
                    <span>{sandboxRunning ? '正在沙箱中运行...' : '运行预测基线'}</span>
                  </button>
                ) : null}
              </div>
            </div>

            {!effectiveVisualizationCode ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
                运行已锁定：请导入 CSV、TSV、XLSX 或 XLS 数据附件。系统不会运行模拟数组。
              </div>
            ) : (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2 text-xs text-sky-200">
                当前代码读取：{selectedDataFile?.relPath}
              </div>
            )}

            {sandboxMessage ? (
              <div className={`rounded-lg border px-3 py-2 text-xs ${sandboxMessage.ok ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-200' : 'border-rose-500/25 bg-rose-500/[0.06] text-rose-200'}`}>
                {sandboxMessage.text}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
              {readableDataFiles.length ? (
                <div className="space-y-3 rounded-lg border border-sky-500/20 bg-black/25 p-3 md:col-span-2">
                  <div className="font-semibold text-sky-300">真实数据字段映射</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <label className="space-y-1 text-white/55">
                      <span>数据附件</span>
                      <select value={selectedDataFile?.relPath ?? ''} onChange={(e) => { setSelectedDataRelPath(e.target.value); setSelectedSheet(''); setDataProfile(null) }} className="w-full rounded border border-white/10 bg-[#11151d] px-2 py-1.5 text-white">
                        {readableDataFiles.map((file) => <option key={file.id} value={file.relPath}>{file.name}</option>)}
                      </select>
                    </label>
                    {dataProfile?.sheets.length ? (
                      <label className="space-y-1 text-white/55">
                        <span>Excel 工作表</span>
                        <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)} className="w-full rounded border border-white/10 bg-[#11151d] px-2 py-1.5 text-white">
                          {dataProfile.sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
                        </select>
                      </label>
                    ) : null}
                    <label className="space-y-1 text-white/55">
                      <span>横轴字段</span>
                      <select value={xColumn} onChange={(e) => setXColumn(e.target.value)} className="w-full rounded border border-white/10 bg-[#11151d] px-2 py-1.5 text-white">
                        <option value="">样本序号</option>
                        {dataProfile?.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                      </select>
                    </label>
                  </div>
                  <div>
                    <div className="mb-1 text-white/55">纵轴数值字段（可多选）</div>
                    <div className="flex flex-wrap gap-2">
                      {dataProfile?.numericColumns.map((column) => (
                        <label key={column} className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-white/75">
                          <input type="checkbox" checked={yColumns.includes(column)} onChange={(e) => setYColumns((current) => e.target.checked ? [...current, column] : current.filter((item) => item !== column))} />
                          <span>{column}</span>
                        </label>
                      ))}
                    </div>
                    {dataProfile ? (
                      <div className="mt-2 text-[11px] text-white/40">
                        共 {dataProfile.rowCount} 行；运行数据检查会生成 evidence_manifest.json。
                        {state?.categoryAssessment.active === 'prediction'
                          ? ` 预测基线使用“${yColumns[0] || '尚未选择'}”作为目标，并生成 model_evidence.json。`
                          : ''}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="space-y-1 rounded-lg border border-white/10 bg-black/30 p-3">
                <span className="text-white/40">1. 推荐学术图表类型</span>
                <p className="font-medium text-emerald-300">{curQ.visualization.plotType}</p>
              </div>
              <div className="space-y-1 rounded-lg border border-white/10 bg-black/30 p-3">
                <span className="text-white/40">2. 坐标轴与物理量纲</span>
                <p className="text-white/80">{curQ.visualization.xLabel}</p>
                <p className="text-white/80">{curQ.visualization.yLabel}</p>
              </div>
              <div className="space-y-1 rounded-lg border border-white/10 bg-black/30 p-3 md:col-span-2">
                <span className="text-white/40">3. 图表揭示的核心数据规律 / 物理现象</span>
                <p className="text-white/85 leading-relaxed">{curQ.visualization.expectedFinding}</p>
              </div>
              <div className="space-y-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 md:col-span-2">
                <span className="font-semibold text-emerald-300">4. 学生结果填写框架</span>
                <p className="italic text-white/90 leading-relaxed">
                  {curQ.visualization.paperConclusion}
                </p>
              </div>
            </div>

            {/* 生成的图表预览回显 */}
            {generatedImgUrl ? (
              <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="mb-2 text-xs font-medium text-emerald-300">
                  🎉 沙箱运行生成图表预览：
                </div>
                <img
                  src={generatedImgUrl}
                  alt="Generated Result"
                  className="max-h-72 rounded border border-white/10 mx-auto"
                />
              </div>
            ) : null}

            {/* 可收起的代码预览 */}
            <details className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-white/60 hover:text-white">
                查看 Python 学术绘图代码模板 (Matplotlib / Seaborn)
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                {effectiveVisualizationCode ?? curQ.visualization.pythonCode}
              </pre>
            </details>
            {effectivePredictionCode ? (
              <details className="rounded-lg border border-sky-500/20 bg-black/30 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-sky-200/70 hover:text-sky-100">
                  查看可复现预测基线代码
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-sky-100/90">
                  {effectivePredictionCode}
                </pre>
              </details>
            ) : null}

            {predictionEvidence ? (
              <div className="space-y-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-sky-200">本次运行的模型证据</span>
                  <span className="rounded bg-sky-500/15 px-2 py-1 text-sky-100">
                    按 {predictionEvidence.selectionMetric} 选择：{predictionEvidence.bestModel}
                  </span>
                </div>
                <div className="text-white/55">
                  模型选择仅使用训练段内部的 {predictionEvidence.selectionFolds} 折滚动时间验证；测试集只用于最终评估。
                </div>
                <div className="grid gap-2 text-white/65 md:grid-cols-2">
                  <div>训练：{predictionEvidence.trainRows} 行，{predictionEvidence.trainRange}</div>
                  <div>测试：{predictionEvidence.testRows} 行，{predictionEvidence.testRange}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="text-white/45">
                      <tr><th className="py-1 pr-3">模型</th><th className="py-1 pr-3">MAE</th><th className="py-1 pr-3">RMSE</th><th className="py-1">MAPE</th></tr>
                    </thead>
                    <tbody className="text-white/80">
                      {predictionEvidence.metrics.map((metric) => (
                        <tr key={metric.model} className={metric.model === predictionEvidence.bestModel ? 'text-sky-200' : ''}>
                          <td className="py-1 pr-3 font-mono">{metric.model}</td>
                          <td className="py-1 pr-3">{metric.mae.toFixed(4)}</td>
                          <td className="py-1 pr-3">{metric.rmse.toFixed(4)}</td>
                          <td className="py-1">{metric.mape === null ? '不适用' : `${metric.mape.toFixed(3)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {predictionEvidence.intervals.length ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {predictionEvidence.intervals.map((interval) => (
                      <div key={interval.level} className="rounded border border-sky-400/15 bg-black/20 p-3">
                        <div className="font-semibold text-sky-100">{Math.round(interval.level * 100)}% 经验预测区间</div>
                        <div className="mt-1 text-white/65">半宽：±{interval.halfWidth.toFixed(4)}</div>
                        <div className="text-white/65">测试覆盖率：{(interval.coverage * 100).toFixed(1)}%</div>
                        {interval.coverage < interval.level ? (
                          <div className="mt-1 text-amber-300">低于标称水平，需要谨慎解释</div>
                        ) : (
                          <div className="mt-1 text-emerald-300">达到本测试集的标称水平</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="rounded border border-white/10 bg-black/25 p-3 text-white/70">
                  <div className="mb-1 font-semibold text-white/80">学生结果填写框架</div>
                  <p>请依次说明：① 为什么采用时间顺序留出测试；② 各模型在同一测试集上的指标差异；③ 为什么按 {predictionEvidence.selectionMetric} 选择 {predictionEvidence.bestModel}；④ 80%/95% 区间覆盖了多少测试点，是否达到标称水平；⑤ 从残差图观察到的偏差和当前方法局限。数字必须引用上表及 model_evidence.json。</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 方案统合与一键同步任务卡 */}
        {state?.generatedDraft ? (
          <div className="rounded-xl border border-white/10 bg-[#161a23] p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  问题 {currentQIdx} 沉淀解题蓝图
                </span>
                <span className="text-xs text-white/40">
                  已完成 {Object.keys(state.choices).length}/4 步选择
                </span>
              </div>
              <button
                onClick={handleSyncToTasks}
                className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/20"
              >
                <span>📌</span>
                <span>同步至任务卡与写作提纲</span>
              </button>
            </div>

            {syncStatus ? (
              <div className="rounded-lg bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200">
                {syncStatus}
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-white/5 bg-black/25 p-3 space-y-1">
                <div className="font-semibold text-white/70">一、题意拆解与本质</div>
                <div className="text-white/60 whitespace-pre-wrap leading-relaxed">
                  {state.generatedDraft.problemRestatement}
                </div>
              </div>
              <div className="rounded-lg border border-white/5 bg-black/25 p-3 space-y-1">
                <div className="font-semibold text-white/70">二、主力模型与机理</div>
                <div className="text-white/60 whitespace-pre-wrap leading-relaxed">
                  {state.generatedDraft.modelFormulation}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        </>
        )}
      </div>
    </div>
  )
}
