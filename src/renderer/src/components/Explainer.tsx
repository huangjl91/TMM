import { useEffect, useRef, useState, type ReactNode } from 'react'
import { explainHits, type ExplainSource } from '@shared/explain'

interface Props {
  src: ExplainSource
  onShown?: (level: number) => void
}

const TOP = 3

/**
 * 分级讲解：默认只给一句话直觉，学生自己按「再讲一层」往下走。
 * 每一层展开都留痕，因为《AI 工具使用详情》要能说明「AI 或语料给过到哪一层」。
 */
export function Explainer({ src, onShown }: Props): ReactNode {
  const [level, setLevel] = useState(0)
  const e = src.explain
  const expand = (n: number): void => {
    setLevel(n)
    onShown?.(n)
  }
  // 卡片一出现就已经讲了第一层，这一层也要留痕；换词条要重新记，StrictMode 重跑则不重复记
  const loggedFor = useRef<string | null>(null)
  useEffect(() => {
    if (loggedFor.current === src.ref) return
    loggedFor.current = src.ref
    onShown?.(0)
  }, [src.ref])
  return (
    <div className="space-y-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
      <div className="flex items-baseline gap-2 text-[11px] text-emerald-200/70">
        <span>
          {src.kind === 'method' ? '方法卡' : '名词'} · {src.title}（{src.category}）
        </span>
        <span className="ml-auto text-white/30">讲到第 {String(level + 1)} / {String(TOP + 1)} 层</span>
      </div>
      <p className="text-[12.5px] leading-5 text-white/85">{e.intuition}</p>
      {level >= 1 ? <p className="text-[12.5px] leading-5 text-white/70">比方：{e.analogy}</p> : null}
      {level >= 2 ? <p className="text-[12.5px] leading-5 text-white/70">小例子：{e.miniExample}</p> : null}
      {level >= 3 ? (
        <div className="space-y-1">
          {e.formula ? (
            <p className="rounded bg-black/30 px-2 py-1 text-[12px] leading-5 text-sky-200/90">{e.formula}</p>
          ) : null}
          {e.symbols.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] leading-4 text-white/55">
              {e.symbols.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-[11px] text-white/35">字母照你自己的题目改一遍再进符号表，别照抄这里的一套。</p>
        </div>
      ) : null}
      <div className="flex items-center gap-2 pt-0.5">
        {level < TOP ? (
          <button
            onClick={() => expand(level + 1)}
            className="rounded-lg border border-emerald-500/40 px-2 py-0.5 text-[11.5px] text-emerald-200/90 hover:bg-emerald-500/10"
          >
            再讲一层
          </button>
        ) : null}
        {level > 0 ? (
          <button
            onClick={() => setLevel(0)}
            className="rounded-lg border border-white/10 px-2 py-0.5 text-[11.5px] text-white/50 hover:bg-white/5"
          >
            只留一句话
          </button>
        ) : null}
        <span className="text-[11px] text-white/30">这一段是科普，不是本题答案</span>
      </div>
    </div>
  )
}

interface ChipsProps {
  /** 被查询的文本：教练的选项说明、追问、方法卡摘要都算 */
  text: string
  onShown?: (src: ExplainSource, level: number) => void
}

/** 「这是什么？」：从一段话里挑出能讲的名词，点一个展开一个；一个都挑不出就不占地方 */
export function ExplainChips({ text, onShown }: ChipsProps): ReactNode {
  const [open, setOpen] = useState<string | null>(null)
  const hits = explainHits(text)
  if (!hits.length) return null
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-white/35">这是什么？</span>
        {hits.map((h) => (
          <button
            key={`${h.kind}:${h.ref}`}
            onClick={() => setOpen(open === h.ref ? null : h.ref)}
            className={
              'rounded-lg border px-1.5 py-0.5 text-[11.5px] ' +
              (open === h.ref
                ? 'border-emerald-400/60 bg-emerald-500/20 text-white'
                : 'border-white/10 bg-black/25 text-white/60 hover:bg-white/5')
            }
          >
            {h.title}
          </button>
        ))}
      </div>
      {open
        ? (() => {
            const src = hits.find((h) => h.ref === open)
            return src ? <Explainer src={src} onShown={(lv) => onShown?.(src, lv)} /> : null
          })()
        : null}
    </div>
  )
}
