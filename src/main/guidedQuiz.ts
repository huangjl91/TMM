import { completeText } from './llm/openai-compat'
import { createHash } from 'node:crypto'
import {
  loadSettings,
  logAiUsage,
  getGuidedChoices,
  saveGuidedChoice,
  getGuidedAnalysis,
  saveGuidedAnalysis,
  saveStageOutputs,
  latestStageOutputs,
  listSessionFiles,
  clearGuidedChoices
} from './repo'
import { getApiKey } from './secrets'
import { questionsOf } from './stage'
import { parseQuestions } from '../shared/questions'
import {
  buildDefaultGuidedQuestions,
  enforceEvidenceSafeQuestions,
  explainProblemCategory,
  validateGuidedAnalysisPayload,
  extractProblemElements,
  synthesizeGuidedDraft,
  type CandidateModelInfo,
  type CategoryAssessment,
  type AiAdvice,
  type GuidedOption,
  type GuidedQuestion,
  type GuidedCategory,
  type GuidedSessionState,
  type GuidedStep,
  type ProblemElements,
  type ProblemKnowledge,
  type StepChoice
} from '../shared/guidedQuiz'
import { qKey } from '../shared/questions'
import { sliceJsonObject } from '../shared/agent'

function getProblemContext(
  sessionId: number,
  questionIdx: number
): { brief: string; fullText: string; sourceReady: boolean; sourceFingerprint: string } {
  let brief = ''
  let fullText = ''

  const qs = questionsOf(sessionId)
  const found = qs.find((q) => q.idx === questionIdx)
  if (found && found.brief) brief = found.brief

  const files = listSessionFiles(sessionId)
  const problemFile = files.find((f) => f.kind === 'problem')
  if (problemFile) {
    fullText = problemFile.digest
    if (!brief) {
      const fileQs = parseQuestions(problemFile.digest)
      const fileFound = fileQs.find((q) => q.idx === questionIdx)
      if (fileFound && fileFound.brief) brief = fileFound.brief
    }
  }

  if (!brief) {
    const s1Outputs = latestStageOutputs(sessionId, 1)
    brief = s1Outputs.problems || s1Outputs.data || ''
  }

  const sourceReady = Boolean(brief.trim() || fullText.trim())
  const normalizedBrief = brief || `问题 ${questionIdx}`
  const sourceFingerprint = createHash('sha256')
    .update(`${normalizedBrief}\n${fullText}`)
    .digest('hex')
  return { brief: normalizedBrief, fullText, sourceReady, sourceFingerprint }
}

interface AnalysisMetadata {
  _sourceFingerprint?: string
  _categoryOverride?: GuidedCategory
}

function loadOrGenerateAnalysis(
  sessionId: number,
  questionIdx: number,
  forceRefresh = false
): {
  knowledge: ProblemKnowledge
  questions: Record<GuidedStep, GuidedQuestion>
  elements: ProblemElements
  candidateModels: CandidateModelInfo[]
  brief: string
  sourceReady: boolean
  categoryAssessment: CategoryAssessment
} {
  const { brief, fullText, sourceReady, sourceFingerprint } = getProblemContext(sessionId, questionIdx)
  const detected = explainProblemCategory(`${brief}\n${fullText}`)
  let categoryOverride: GuidedCategory | undefined
  const cached = getGuidedAnalysis(sessionId, questionIdx)

  if (cached) {
    try {
      const rawElements = JSON.parse(cached.elementsJson) as ProblemElements & AnalysisMetadata
      categoryOverride = rawElements._categoryOverride
      if (!forceRefresh && rawElements._sourceFingerprint === sourceFingerprint) {
        const knowledge = JSON.parse(cached.knowledgeJson) as ProblemKnowledge
        const questions = enforceEvidenceSafeQuestions(
          JSON.parse(cached.questionsJson) as Record<GuidedStep, GuidedQuestion>
        )
        const candidateModels = buildDefaultGuidedQuestions(
          questionIdx,
          brief,
          fullText,
          categoryOverride ?? detected.detected
        ).candidateModels
        return {
          knowledge,
          questions,
          elements: rawElements,
          candidateModels,
          brief,
          sourceReady,
          categoryAssessment: {
            ...detected,
            active: categoryOverride ?? detected.detected,
            overridden: Boolean(categoryOverride)
          }
        }
      }
      if (rawElements._sourceFingerprint !== sourceFingerprint) {
        clearGuidedChoices(sessionId, questionIdx)
      }
    } catch (e) {
      console.warn('[guidedQuiz] Failed to parse cached analysis:', e)
    }
  }

  // 动态抽取题目核心要素与定制 4 阶梯选择题
  const elements = extractProblemElements(brief, fullText) as ProblemElements & AnalysisMetadata
  elements._sourceFingerprint = sourceFingerprint
  if (categoryOverride) elements._categoryOverride = categoryOverride
  const { knowledge, questions, candidateModels } = buildDefaultGuidedQuestions(
    questionIdx,
    brief,
    fullText,
    categoryOverride
  )

  saveGuidedAnalysis(
    sessionId,
    questionIdx,
    JSON.stringify(knowledge),
    JSON.stringify(questions),
    JSON.stringify(elements)
  )

  return {
    knowledge,
    questions,
    elements,
    candidateModels,
    brief,
    sourceReady,
    categoryAssessment: {
      ...detected,
      active: categoryOverride ?? detected.detected,
      overridden: Boolean(categoryOverride)
    }
  }
}

export function getGuidedState(sessionId: number, questionIdx: number): GuidedSessionState {
  const qIdx = Math.max(1, questionIdx)
  const { knowledge, questions, elements, candidateModels, brief, sourceReady, categoryAssessment } = loadOrGenerateAnalysis(sessionId, qIdx)
  const stored = getGuidedChoices(sessionId, qIdx) as Partial<Record<GuidedStep, StepChoice>>

  const stepsOrder: GuidedStep[] = ['intuition', 'model_select', 'formulation', 'visualization']
  let currentStep: GuidedStep = 'intuition'
  for (const s of stepsOrder) {
    if (!stored[s]) {
      currentStep = s
      break
    }
    currentStep = s
  }
  const completed = stepsOrder.every((s) => Boolean(stored[s]))

  const draft = synthesizeGuidedDraft(
    qIdx,
    brief,
    knowledge,
    stored,
    questions.visualization.visualization,
    elements
  )

  return {
    questionIdx: qIdx,
    questionLabel: `问题 ${qIdx}`,
    questionBrief: brief,
    sourceReady,
    categoryAssessment,
    currentStep,
    completed,
    knowledge,
    elements,
    candidateModels,
    questions,
    choices: stored,
    generatedDraft: draft
  }
}

export function handleGuidedChoose(
  sessionId: number,
  questionIdx: number,
  step: GuidedStep,
  choice: { pickedKey: string; pickedText: string; pickedMeans: string; userNote?: string }
): GuidedSessionState {
  if (!getProblemContext(sessionId, questionIdx).sourceReady) {
    throw new Error('请先导入题目或在自由探究中描述题目，再开始引导选择。')
  }
  saveGuidedChoice(
    sessionId,
    questionIdx,
    step,
    choice.pickedKey,
    choice.pickedText,
    choice.pickedMeans,
    choice.userNote ?? ''
  )

  logAiUsage(
    sessionId,
    null,
    'guided_choice',
    `问题 ${questionIdx} 在 [${step}] 环节选择了 ${choice.pickedKey}.「${choice.pickedText}」`,
    null,
    'guided-engine'
  )

  return getGuidedState(sessionId, questionIdx)
}

export function handleGuidedCategory(
  sessionId: number,
  questionIdx: number,
  category: GuidedCategory | 'auto'
): GuidedSessionState {
  const { brief, fullText, sourceReady, sourceFingerprint } = getProblemContext(sessionId, questionIdx)
  if (!sourceReady) throw new Error('请先导入题目或描述题目，再修正题型。')
  const override = category === 'auto' ? undefined : category
  const elements = extractProblemElements(brief, fullText) as ProblemElements & AnalysisMetadata
  elements._sourceFingerprint = sourceFingerprint
  if (override) elements._categoryOverride = override
  const { knowledge, questions } = buildDefaultGuidedQuestions(questionIdx, brief, fullText, override)
  saveGuidedAnalysis(
    sessionId,
    questionIdx,
    JSON.stringify(knowledge),
    JSON.stringify(questions),
    JSON.stringify(elements)
  )
  clearGuidedChoices(sessionId, questionIdx)
  logAiUsage(
    sessionId,
    null,
    'guided_category_override',
    category === 'auto' ? `问题 ${questionIdx} 恢复自动题型判断` : `问题 ${questionIdx} 由学生修正为 ${category}`,
    null,
    'guided-engine'
  )
  return getGuidedState(sessionId, questionIdx)
}

export async function handleGuidedReanalyze(
  sessionId: number,
  questionIdx: number
): Promise<GuidedSessionState> {
  const { brief, fullText, sourceReady, sourceFingerprint } = getProblemContext(sessionId, questionIdx)
  if (!sourceReady) throw new Error('没有可分析的题目文本，请先导入或描述题目。')
  const existing = getGuidedAnalysis(sessionId, questionIdx)
  if (existing) {
    try {
      const metadata = JSON.parse(existing.elementsJson) as AnalysisMetadata
      if (metadata._categoryOverride) {
        loadOrGenerateAnalysis(sessionId, questionIdx, true)
        return getGuidedState(sessionId, questionIdx)
      }
    } catch {
      // 损坏缓存交给后续重建路径处理。
    }
  }
  const s = loadSettings()
  const key = getApiKey(s.providerId)

  if (key && fullText) {
    const systemPrompt = [
      '你是全国大学生数学建模竞赛（CUMCM/国赛）的国家级金牌评审专家与总教练。',
      '请根据学生导入的真实赛题全文和指定小问，进行深度第一性原理剖析，生成结构化的引导解题与诊断题目 JSON。',
      '严禁泛泛而谈的模板化套话，必须深度结合赛题给出的具体物理变量、设备参数（如微网容量、光伏数据、电价表、惩罚规则、附件表格要求等）。',
      '必须且仅输出一个纯 JSON 对象，格式如下：',
      '{',
      '  "elements": {',
      '    "coreTarget": "该问的核心攻关目标（一句话，突出定量决策或预测指标）",',
      '    "inputData": ["输入数据与附件清单（如分时电价表、光伏预测序列等）"],',
      '    "physicsConstraints": ["关键硬性物理机理与守恒约束（如供需守恒、电池容量上下限、始末闭环）"],',
      '    "deliverables": ["规定交付物与表格规范（如表1、表2、result1.xlsx等）"]',
      '  },',
      '  "knowledge": {',
      '    "topic": "专业考点名称",',
      '    "category": "optimization 或 prediction 或 evaluation 或 differential",',
      '    "summary": "核心考察意图与矛盾",',
      '    "mathEssence": "数学本质映射",',
      '    "keyPrinciples": ["关键机理点1", "关键机理点2", "关键机理点3"],',
      '    "commonPitfalls": ["历年失分陷阱1", "历年失分陷阱2"]',
      '  },',
      '  "questions": {',
      '    "intuition": {',
      '      "step": "intuition", "stepIndex": 1, "stepTitle": "读题感知 · 简单切入",',
      '      "ask": "针对本问具体背景的启发式问题（包含具体物理主体）",',
      '      "options": [{"key": "A", "text": "...", "means": "...", "tag": "..."}, {"key": "B", ...}],',
      '      "aiAdvice": {"recommended": "B", "reason": "...", "pitfalls": {"A": "...", "B": "..."}}',
      '    },',
      '    "model_select": { "step": "model_select", "stepIndex": 2, "stepTitle": "宏观选型 · 建立防线", "ask": "...", "options": [...], "aiAdvice": {...} },',
      '    "formulation": { "step": "formulation", "stepIndex": 3, "stepTitle": "机理推导 · 符号与约束", "ask": "...", "options": [...], "aiAdvice": {...} },',
      '    "visualization": {',
      '      "step": "visualization", "stepIndex": 4, "stepTitle": "科研绘图与结论 · 论文决胜",',
      '      "ask": "...", "options": [...], "aiAdvice": {...},',
      '      "visualization": {',
      '        "plotType": "学术图表类型（双Panel复合图）", "xLabel": "横轴说明", "yLabel": "纵轴说明",',
      '        "dataOrigin": "真实数据来源", "expectedFinding": "需要由真实输出验证的问题", "paperConclusion": "仅含【待计算】占位符的学生填写框架",',
      '        "pythonCode": "# 只提供读取真实数据与校验字段的代码骨架；禁止随机造数和预填结果" ',
      '      }',
      '    }',
      '  }',
      '}'
    ].join('\n')

    const userPrompt = [
      `【赛题全文提取内容】\n${fullText.slice(0, 3000)}`,
      `【当前小问序号】问题 ${questionIdx}`,
      `【当前小问描述】\n${brief}`
    ].join('\n\n')

    try {
      const raw = await completeText({
        baseUrl: s.baseUrl,
        apiKey: key,
        model: s.model,
        temperature: 0.3,
        jsonMode: true,
        maxTokens: 2500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })

      const jsonText = sliceJsonObject(raw)
      if (jsonText) {
        const parsed = validateGuidedAnalysisPayload(JSON.parse(jsonText))
        if (parsed) {
          const parsedElements = parsed.elements as ProblemElements & AnalysisMetadata
          parsedElements._sourceFingerprint = sourceFingerprint
          const previous = getGuidedAnalysis(sessionId, questionIdx)
          if (previous) {
            try {
              const previousElements = JSON.parse(previous.elementsJson) as AnalysisMetadata
              if (previousElements._categoryOverride) {
                parsedElements._categoryOverride = previousElements._categoryOverride
              }
            } catch {
              // 旧缓存损坏时忽略元数据，后续仍可用本地规则重建。
            }
          }
          const vis = parsed.questions?.visualization?.visualization
          if (vis) {
            vis.expectedFinding = '运行真实数据后验证：趋势、差异、异常点及其不确定性。'
            vis.paperConclusion = '【待学生填写】指标【待计算】；对比基线【待计算】；结论仅依据沙箱输出。'
          }
          saveGuidedAnalysis(
            sessionId,
            questionIdx,
            JSON.stringify(parsed.knowledge),
            JSON.stringify(parsed.questions),
            JSON.stringify(parsedElements)
          )
          logAiUsage(
            sessionId,
            null,
            'guided_reanalyze_llm',
            `已通过 ${s.model} 对问题 ${questionIdx} 完成赛题深度第一性原理解构与引导题生成`,
            null,
            s.model
          )
          return getGuidedState(sessionId, questionIdx)
        }
      }
    } catch (e) {
      console.warn('[handleGuidedReanalyze] LLM call failed, fallback to local:', e)
    }
  }

  // 离线或 LLM 调用失败时，使用实体适配引擎重新解构并缓存
  loadOrGenerateAnalysis(sessionId, questionIdx, true)
  logAiUsage(
    sessionId,
    null,
    'guided_reanalyze_local',
    `通过赛题深度解构引擎完成问题 ${questionIdx} 定制化要素提取与试题刷新`,
    null,
    'guided-engine'
  )
  return getGuidedState(sessionId, questionIdx)
}

export async function handleGuidedAskAi(
  sessionId: number,
  questionIdx: number,
  step: GuidedStep,
  ask: string,
  options: GuidedOption[]
): Promise<AiAdvice> {
  if (!getProblemContext(sessionId, questionIdx).sourceReady) {
    throw new Error('请先导入题目或在自由探究中描述题目，再请求导师分析。')
  }
  const { questions, brief } = loadOrGenerateAnalysis(sessionId, questionIdx)
  const fallbackAdvice = questions[step]?.aiAdvice

  const s = loadSettings()
  const key = getApiKey(s.providerId)
  if (!key) {
    logAiUsage(
      sessionId,
      null,
      'guided_ask_ai_offline',
      `问题 ${questionIdx} [${step}] 展开专家 AI 导师选项分析建议`,
      null,
      'local-expert'
    )
    return fallbackAdvice
  }

  const systemPrompt = [
    '你是全国大学生数学建模竞赛（CUMCM/国赛）的国家级金牌教练。',
    '学生当前正在做一道建模决策选择题。你需要分析题意和选项，给出最具启发性、严谨且深刻的建议。',
    '严禁直接代写论文段落；你的职责是像导师一样剖析各个选项的利弊与数学机理，推荐最适合的一个选项。',
    '必须输出且仅输出一个纯 JSON 对象，格式如下：',
    '{',
    '  "recommended": "A或B或C等推荐项",',
    '  "reason": "推荐该项的深刻数学/题意依据（100-200字，通俗且专业）",',
    '  "pitfalls": {',
    '    "A": "对选项A的针对性点评或潜在陷阱（40-80字）",',
    '    "B": "对选项B的针对性点评或优势说明（40-80字）"',
    '  },',
    '  "mathNote": "关键数学公式、定理或物理量纲要点提示（可选）"',
    '}'
  ].join('\n')

  const userPrompt = [
    `【赛题背景与问题简述】\n${brief.slice(0, 1500)}`,
    `【当前解题阶梯】第 ${questionIdx} 问 · 环节：${step}`,
    `【选择题题干】\n${ask}`,
    '【可选选项】\n' + options.map((o) => `${o.key}. ${o.text} (含义：${o.means})`).join('\n')
  ].join('\n\n')

  try {
    const raw = await completeText({
      baseUrl: s.baseUrl,
      apiKey: key,
      model: s.model,
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 800,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })

    const jsonText = sliceJsonObject(raw)
    if (jsonText) {
      const parsed = JSON.parse(jsonText) as Partial<AiAdvice>
      if (parsed.recommended && parsed.reason) {
        logAiUsage(
          sessionId,
          null,
          'guided_ask_ai',
          `问题 ${questionIdx} [${step}] 获取在线模型建议：推荐 ${parsed.recommended}`,
          null,
          s.model
        )
        return {
          recommended: String(parsed.recommended),
          reason: String(parsed.reason),
          pitfalls: (parsed.pitfalls as Record<string, string>) ?? fallbackAdvice.pitfalls,
          mathNote: parsed.mathNote ? String(parsed.mathNote) : fallbackAdvice.mathNote
        }
      }
    }
  } catch (e) {
    console.warn('[guidedAskAi] LLM call failed, falling back to local advice:', (e as Error).message)
  }

  logAiUsage(
    sessionId,
    null,
    'guided_ask_ai_fallback',
    `问题 ${questionIdx} [${step}] 使用深度解构导师建议`,
    null,
    'fallback'
  )
  return fallbackAdvice
}

export function handleGuidedSync(
  sessionId: number,
  questionIdx: number
): { ok: boolean; message: string } {
  const state = getGuidedState(sessionId, questionIdx)
  if (!state.sourceReady) {
    return { ok: false, message: '请先导入题目或描述题目，空白示例不会同步到任务卡。' }
  }
  if (!state.generatedDraft) {
    return { ok: false, message: '请先完成该小问至少前两步的选择题引导' }
  }

  const { problemRestatement, modelFormulation, visualizationPlan } = state.generatedDraft

  // 1. 同步回填到任务卡 Stage 1 (读题与拆解)
  saveStageOutputs(sessionId, 1, {
    [qKey(questionIdx, 'problems')]: problemRestatement
  })

  // 2. 同步回填到任务卡 Stage 4 (模型选型)
  const choiceText = state.choices.model_select?.pickedText ?? ''
  if (choiceText) {
    saveStageOutputs(sessionId, 4, {
      [qKey(questionIdx, 'choice')]: choiceText,
      [qKey(questionIdx, 'candidates')]: `${choiceText}；对冲基准方案`
    })
  }

  // 3. 同步回填到任务卡 Stage 5 (模型推导)
  const formulateText = state.choices.formulation?.pickedText ?? ''
  if (formulateText) {
    saveStageOutputs(sessionId, 5, {
      [qKey(questionIdx, 'objective')]: formulateText,
      [qKey(questionIdx, 'domain')]: modelFormulation
    })
  }

  // 4. 同步回填到任务卡 Stage 8 (结果分析与图表)
  saveStageOutputs(sessionId, 8, {
    [qKey(questionIdx, 'figures')]: visualizationPlan,
    [qKey(questionIdx, 'insight')]: state.choices.visualization?.pickedMeans ?? ''
  })

  logAiUsage(
    sessionId,
    null,
    'guided_sync_to_tasks',
    `已将问题 ${questionIdx} 引导式选择沉淀方案一键同步至阶段 1/4/5/8 任务卡`,
    null,
    'guided-engine'
  )

  return { ok: true, message: `已成功将问题 ${questionIdx} 决策方案同步至任务卡对应模块！` }
}
