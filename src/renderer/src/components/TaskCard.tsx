import { useEffect, useState, type ReactNode } from 'react'
import type { StageCard, StageView } from '@shared/agent'

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
  onSubmit: (values: Record<string, string>) => void
}

/** 学生自己写的地方。教练不给正文，任务卡里的字必须由学生填。 */
export function TaskCard({ stage, card, streaming, injection, onSubmit }: Props): ReactNode {
  const [open, setOpen] = useState(true)
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const f of card?.fields ?? []) next[f.key] = f.content
    setValues(next)
  }, [card, stage?.id])

  useEffect(() => {
    if (!injection || injection.target !== 'field' || !injection.fieldKey) return
    setValues((v) => ({ ...v, [injection.fieldKey as string]: injection.content }))
  }, [injection])

  const filled = Object.values(values).filter((v) => v.trim()).length
  const total = stage?.fields.length ?? 0

  return (
    <section className="shrink-0 border-t border-white/10 bg-[#12141a]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-white/55 hover:bg-white/5"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="font-medium text-white/75">本阶段任务卡</span>
        {stage ? <span className="text-white/35">{stage.title}</span> : null}
        <span className="ml-auto text-[11px] text-white/30">
          {filled}/{total} 已填
        </span>
      </button>
      {open && stage ? (
        <div className="max-h-[38vh] space-y-3 overflow-y-auto px-4 pb-3">
          <div className="text-[11px] leading-4 text-white/35">要交出的东西：{stage.output}</div>
          {stage.fields.map((f) => (
            <label key={f.key} className="block">
              <div className="mb-1 text-xs text-white/60">{f.label}</div>
              <textarea
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                rows={3}
                placeholder={f.hint}
                className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] leading-5 outline-none placeholder:text-white/25 focus:border-sky-500/50"
              />
            </label>
          ))}
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
