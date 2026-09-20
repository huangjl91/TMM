import type { ReactNode } from 'react'
import { RichText } from './RichText'
import { HINT_LEVELS } from '@shared/stages'
import type { CoachReply, Scaffold } from '@shared/agent'

export function CoachCard({ card }: { card: CoachReply }): ReactNode {
  const passed = card.checks.filter((c) => c.passed).length
  return (
    <div className="space-y-3">
      <div className="text-[15px] leading-7 text-white/90">
        <RichText text={card.next_question || '（这条没答上，先说说你现在卡在哪一句？）'} />
      </div>

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
