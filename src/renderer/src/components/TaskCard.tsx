import { useEffect, useState, type ReactNode } from 'react'
import type { StageCard, StageView } from '@shared/agent'
import { qKey, type QuestionView } from '@shared/questions'

export interface Injection {
  target: 'code' | 'field'
  fieldKey?: string
  content: string
  seq: number
}

interface Props {
  stage: StageView | null
  card: StageCard | null
  streaming: boolean
  injection: Injection | null
  questions: QuestionView[]
  focus: number
  onFocus: (idx: number) => void
  onSubmit: (values: Record<string, string>) => void
}

const box =
  'w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] leading-5 outline-none placeholder:text-white/25 focus:border-sky-500/50'

/** 学生自己写的地方。教练不给正文，任务卡里的字必须由学生填。 */
export function TaskCard({ stage, card, streaming, injection, questions, focus, onFocus, onSubmit }: Props): ReactNode {
  const [open, setOpen] = useState(true)
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const f of card?.fields ?? []) {
      next[f.key] = f.content
      for (const q of f.questions ?? []) next[qKey(q.idx, f.key)] = q.content
    }
    setValues(next)
  }, [card, stage?.id])

  useEffect(() => {
    if (!injection || injection.target !== 'field' || !injection.fieldKey) return
    setValues((v) => ({ ...v, [injection.fieldKey as string]: injection.content }))
  }, [injection])

  const set = (key: string, content: string): void => {
    setValues((v) => ({ ...v, [key]: content }))
  }

  /** 计数按「格」算，逐问字段整格填完才算一格，免得学生被 12 个框吓退 */
  const cells = stage?.fields ?? []
  const filled = cells.filter((f) => {
    const per = card?.fields.find((c) => c.key === f.key)?.questions
    return per?.length
      ? per.every((q) => (values[qKey(q.idx, f.key)] ?? '').trim())
      : Boolean((values[f.key] ?? '').trim())
  }).length

  return (
    <section className="shrink-0 border-t border-white/10 bg-[#12141a]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-white/55 hover:bg-white/5"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="font-medium text-white/75">本阶段任务卡</span>
        {stage ? <span className="text-white/35">{stage.title}</span> : null}
        {questions.length >= 2 ? <span className="text-white/25">逐问分开填</span> : null}
        <span className="ml-auto text-[11px] text-white/30">
          {filled}/{cells.length} 已填
        </span>
      </button>
      {open && stage ? (
        <div className="max-h-[38vh] space-y-3 overflow-y-auto px-4 pb-3">
          <div className="text-[11px] leading-4 text-white/35">要交出的东西：{stage.output}</div>
          {questions.length >= 2 ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
              <span className="text-[11px] text-white/35">这一轮盯着</span>
              <button
                onClick={() => onFocus(0)}
                className={
                  'rounded px-2 py-0.5 text-[11px] ' +
                  (focus === 0 ? 'bg-sky-600 text-white' : 'text-white/55 hover:bg-white/5')
                }
              >
                整题
              </button>
              {questions.map((q) => (
                <button
                  key={q.idx}
                  onClick={() => onFocus(q.idx)}
                  title={q.brief}
                  className={
                    'rounded px-2 py-0.5 text-[11px] ' +
                    (focus === q.idx ? 'bg-sky-600 text-white' : 'text-white/55 hover:bg-white/5')
                  }
                >
                  {q.label}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-white/25">教练的提问与方法候选会跟着这一问走</span>
            </div>
          ) : null}
          {cells.map((f) => {
            const per = card?.fields.find((c) => c.key === f.key)?.questions
            if (!per?.length) {
              return (
                <label key={f.key} className="block">
                  <div className="mb-1 text-xs text-white/60">{f.label}</div>
                  <textarea value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} rows={3} placeholder={f.hint} className={box} />
                </label>
              )
            }
            return (
              <div key={f.key} className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <div className="mb-1.5 text-xs text-white/60">{f.label}</div>
                {per.map((q) => (
                  <label key={q.idx} className="mb-2 block last:mb-0">
                    <div className="mb-1 flex items-baseline gap-2 text-[11px] text-white/40">
                      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-200/90">{q.label}</span>
                      <span className="truncate">{questions.find((x) => x.idx === q.idx)?.brief ?? ''}</span>
                    </div>
                    <textarea
                      value={values[qKey(q.idx, f.key)] ?? ''}
                      onChange={(e) => set(qKey(q.idx, f.key), e.target.value)}
                      rows={2}
                      placeholder={f.hint}
                      className={box}
                    />
                  </label>
                ))}
              </div>
            )
          })}
          <button
            onClick={() => onSubmit(values)}
            disabled={streaming || filled === 0}
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            提交给教练评审
          </button>
        </div>
      ) : null}
    </section>
  )
}
