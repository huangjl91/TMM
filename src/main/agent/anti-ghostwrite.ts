export interface GhostVerdict {
  suspect: boolean
  score: number
  reasons: string[]
}

/** 国赛论文里最典型的"代笔腔"，出现即说明这段可以直接粘进正文 */
const PAPER_PHRASES = [
  '综上所述',
  '我们建立了',
  '本文采用',
  '本文提出',
  '本文认为',
  '由式',
  '由此可见',
  '不难得到',
  '不难推出',
  '可以得出',
  '结果表明',
  '本节将',
  '因此我们',
  '模型求解得'
]

const LATEX_BODY = [/\\documentclass/, /\\usepackage/, /\\begin\{abstract\}/, /\\begin\{document\}/, /\\section\{/, /\\subsection\{/]

const WEIGHT_PHRASE = 3
const WEIGHT_LATEX = 4
const WEIGHT_CODE_BLOCK = 2
const WEIGHT_ABSTRACT = 3
const QUESTION_RELIEF = 2
/** 判成"越界"的最低分：单条套语不足以定罪，成段+套语才定罪 */
export const SUSPECT_THRESHOLD = 3

function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?\n])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 反代写的启发式第一层：便宜、确定、可离线回归。
 * 命中只判"可疑"，是否真越界再交给小模型判定（critic.ts），避免把正常的长解释误杀。
 */
export function detectGhostwriting(text: string): GhostVerdict {
  const reasons: string[] = []
  let score = 0
  if (!text.trim()) return { suspect: false, score: 0, reasons }

  const phrases = PAPER_PHRASES.filter((p) => text.includes(p))
  if (phrases.length) {
    score += WEIGHT_PHRASE * Math.min(phrases.length, 2)
    reasons.push(`论文套语：${phrases.slice(0, 3).join('、')}`)
  }

  const latex = LATEX_BODY.filter((re) => re.test(text))
  if (latex.length) {
    score += WEIGHT_LATEX
    reasons.push('含可直接编译的论文结构（section/abstract/documentclass）')
  }

  const fenced = text.match(/```[\s\S]*?```/g) ?? []
  if (fenced.some((b) => b.split('\n').length >= 9)) {
    score += WEIGHT_CODE_BLOCK
    reasons.push('整段代码块（应由 Executor 以脚手架身份给）')
  }

  if (/摘要|abstract/i.test(text) && text.length > 260 && !/[?？]/.test(text.slice(0, 260))) {
    score += WEIGHT_ABSTRACT
    reasons.push('疑似摘要成稿')
  }

  const declarative = sentences(text).filter((s) => s.length >= 20 && !/[?？]\s*$/.test(s))
  if (declarative.length >= 3) {
    score += declarative.length >= 5 ? 4 : 2
    reasons.push(`${declarative.length} 句连续陈述，不是提问`)
  }

  // 结尾还在把球踢回给学生，说明这一条主要是引导而非代写
  if (/[?？]\s*$/.test(text.trim())) score -= QUESTION_RELIEF

  return { suspect: score >= SUSPECT_THRESHOLD, score, reasons }
}
