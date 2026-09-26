import { useState, type ReactNode } from 'react'
import { RichText } from './RichText'
import { ExplainChips } from './Explainer'
import { HINT_LEVELS } from '@shared/stages'
import type { CoachReply, QuizItem, Scaffold } from '@shared/agent'
import type { ExplainSource } from '@shared/explain'

interface QuizProps {
  quiz: QuizItem[]
  disabled: boolean
  onAnswer: (text: string, log: string) => void
  onExplain?: (src: ExplainSource, level: number) => void
}

/**
 * 诊断式选择题：只帮学生把「摆在面前的几条路」摊开，没有对错标记，
 * 也没有「看答案」——选完之后必须他自己说一句为什么，这一句才是教练下一轮的素材。
 */
export function QuizBlock({ quiz, disabled, onAnswer, onExplain }: QuizProps): ReactNode {
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [why, setWhy] = useState('')

  const toggle = (qi: number, key: string, multi: boolean): void => {
    setPicked((p) => {
      const cur = p[qi] ?? []
      if (!multi) return { ...p, [qi]: cur[0] === key ? [] : [key] }
      return { ...p, [qi]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] }
    })
  }

  const chosen = quiz.map((q, qi) => ({
    q,
    keys: picked[qi] ?? [],
    opts: (picked[qi] ?? []).map((k) => q.options.find((o) => o.key === k)).filter((o) => o !== undefined)
  }))
  const ready = chosen.every((c) => c.keys.length > 0) && !disabled

  const send = (): void => {
    const text = chosen
      .map((c) => `关于「${c.q.ask}」：我选 ${c.opts.map((o) => `${o.key} ${o.text}`).join('；')}`)
      .join('\n')
    const log = chosen
      .map(
        (c) =>
          `${c.q.ask} → 选 ${c.opts.map((o) => `${o.key}「${o.text}」`).join('、')}` +
          c.opts.map((o) => `；含义：${o.means}`).join('') +
          `；理由：${why.trim() || '（没写理由）'}`
      )
      .join(' ｜ ')
    onAnswer(`${text}\n我的理由：${why.trim() || '（暂时说不上来，想先往下走）'}`, log)
  }

  return (
    <div className="space-y-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] px-3 py-2.5">
      <div className="text-[11px] text-violet-200/70">
        先挑路子，不给对错：选出你打算走的那条，然后说清为什么。教练按你选的继续问。
      </div>
      {chosen.map((c, qi) => (
        <div key={c.q.ask}>
          <div className="mb-1 text-[13px] leading-5 text-white/85">{c.q.ask}</div>
          <div className="flex flex-wrap gap-1.5">
            {c.q.options.map((o) => {
              const on = c.keys.includes(o.key)
              return (
                <button
                  key={o.key}
                  onClick={() => toggle(qi, o.key, c.q.multi)}
                  className={
                    'rounded-lg border px-2 py-1 text-left text-[12px] leading-4 ' +
                    (on
                      ? 'border-violet-400/60 bg-violet-500/25 text-white'
                      : 'border-white/10 bg-black/25 text-white/65 hover:bg-white/5')
                  }
                >
                  <span className="mr-1 text-white/40">{o.key}</span>
                  {o.text}
                </button>
              )
            })}
          </div>
          {c.opts.some((o) => o.means) ? (
            <ul className="mt-1 space-y-0.5 text-[11px] leading-4 text-white/45">
              {c.opts
                .filter((o) => o.means)
                .map((o) => (
                  <li key={o.key}>
                    {o.key} 意味着：{o.means}
                  </li>
                ))}
            </ul>
          ) : null}
          <div className="mt-1.5">
            <ExplainChips
              text={[c.q.ask, ...c.q.options.flatMap((o) => [o.text, o.means])].join('，')}
              onShown={onExplain}
            />
          </div>
        </div>
      ))}
      <textarea
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        rows={2}
        placeholder="为什么走这条？（你自己的话，一两行就够）"
        className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] leading-4 outline-none placeholder:text-white/25 focus:border-violet-400/50"
      />
      <button
        onClick={send}
        disabled={!ready}
        className="rounded-lg bg-violet-600/80 px-3 py-1 text-[12px] font-medium text-white disabled:opacity-40"
      >
        把选择发给教练
      </button>
    </div>
  )
}

export function CoachCard({
  card,
  disabled,
  onQuizAnswer,
  onExplain
}: {
  card: CoachReply
  disabled?: boolean
  onQuizAnswer?: (text: string, log: string) => void
  onExplain?: (src: ExplainSource, level: number) => void
}): ReactNode {
  const passed = card.checks.filter((c) => c.passed).length
  return (
    <div className="space-y-3">
      <div className="text-[15px] leading-7 text-white/90">
        <RichText text={card.next_question || '（这条没答上，先说说你现在卡在哪一句？）'} />
      </div>

      {card.next_question ? (
        <ExplainChips text={card.next_question} onShown={onExplain} />
      ) : null}

      {card.checks.length ? (
        <div>
          <div className="mb-1 text-[11px] text-white/40">检查点 {passed}/{card.checks.length}</div>
          <ul className="space-y-1">
            {card.checks.map((c) => (
              <li key={c.item} className="flex gap-2 text-[13px] leading-5">
                <span className={c.passed ? 'text-emerald-400' : 'text-amber-400'}>{c.passed ? '✓' : '✗'}</span>
                <span className={c.passed ? 'text-white/55' : 'text-white/85'}>
                  {c.item}
                  {c.note ? <span className="text-white/40"> — {c.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {card.quiz?.length && onQuizAnswer ? (
        <QuizBlock quiz={card.quiz} disabled={disabled === true} onAnswer={onQuizAnswer} onExplain={onExplain} />
      ) : null}

      {card.hint ? (
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.07] px-3 py-2">
          <div className="mb-0.5 text-[11px] text-sky-300/80">提示 L{card.hint.level} · {HINT_LEVELS[card.hint.level]}</div>
          <RichText text={card.hint.text} />
        </div>
      ) : null}

      {card.rubric_score.comments.length ? (
        <div className="text-[13px] leading-5 text-white/60">
          <div className="mb-1 text-[11px] text-white/40">rubric 反馈 · {card.rubric_score.total}/100</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {card.rubric_score.comments.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {card.blockers ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[12px] text-amber-200/80">
          进入下一阶段前还缺：{card.blockers}
        </div>
      ) : null}
    </div>
  )
}

interface ScaffoldProps {
  scaffold: Scaffold
  onAdopt: (scaffold: Scaffold) => void
}

/** Executor 的产物：身份是示例，必须学生点「采纳」才落地，且这一步会记进使用日志 */
export function ScaffoldView({ scaffold, onAdopt }: ScaffoldProps): ReactNode {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-white/40">
        Executor 示例 · {scaffold.kind === 'code' ? '代码脚手架' : `落到字段 ${scaffold.fieldKey ?? '（未指定）'}`} · 需自行核实改写，不得直接提交
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] leading-5 text-white/75">
        {scaffold.content}
      </pre>
      <button
        onClick={() => onAdopt(scaffold)}
        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20"
      >
        采纳到我的文件
      </button>
    </div>
  )
}
