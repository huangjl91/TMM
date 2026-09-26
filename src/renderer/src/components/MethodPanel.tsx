import { useMemo, useState, type ReactNode } from 'react'
import { Explainer } from './Explainer'
import { EXPLAIN_MISSING_HINT, explainHits, methodExplainSource, type ExplainSource } from '@shared/explain'
import { methodById, methodsForStage, searchMethods, type MethodCard } from '@shared/methods'

interface Props {
  sessionId: number | null
  stageId: number
  pinned: string[]
  onPin: (m: MethodCard, on: boolean) => void
  onExplain?: (src: ExplainSource, level: number) => void
}

/**
 * 方法库浏览器。检索是渲染层本地纯函数（shared/methods.ts），不走 IPC：
 * 卡是随应用打包的静态知识，不需要主进程参与。只有「钉了哪几张」落库。
 */
export function MethodPanel({ sessionId, stageId, pinned, onPin, onExplain }: Props): ReactNode {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const cards = useMemo(() => searchMethods(query, { stageId, limit: 8 }), [query, stageId])
  const stageOwn = useMemo(() => methodsForStage(stageId, 1).length > 0, [stageId])
  const pinnedCards = pinned.map((id) => methodById(id)).filter((m): m is MethodCard => m !== undefined)
  const termHits = useMemo(() => (query && !cards.length ? explainHits(query) : []), [query, cards.length])

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-white/10">
      <div className="flex items-baseline gap-2 px-4 py-3">
        <span className="text-xs font-semibold tracking-wide text-white/50">方法库</span>
        {pinned.length ? (
          <span className="ml-auto text-[10px] text-sky-300/70">已钉 {String(pinned.length)}/3</span>
        ) : null}
      </div>
      <div className="px-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜方法，或直接写你卡在哪：指标权重怎么定"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px] outline-none placeholder:text-white/25 focus:border-sky-500/50"
        />
      </div>

      {pinnedCards.length ? (
        <div className="flex flex-wrap gap-1 px-4 py-2">
          {pinnedCards.map((m) => (
            <button
              key={m.id}
              onClick={() => onPin(m, false)}
              title="点击取消钉选"
              className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-200 hover:border-sky-400/50"
            >
              {m.name} ×
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {!query && !stageOwn ? (
          <p className="pt-2 text-[10px] leading-4 text-white/30">
            这一步还没到选方法。下面几张是全场最常翻的，先认个脸，不代表你现在就得用。
          </p>
        ) : null}
        {cards.length === 0 ? (
          <div className="space-y-1.5 py-2">
            <p className="text-[11px] leading-4 text-white/30">
              没找到相关方法卡。{termHits.length ? '下面这几个名词倒是能讲：' : EXPLAIN_MISSING_HINT}
            </p>
            {termHits.map((h) => (
              <Explainer key={`${h.kind}:${h.ref}`} src={h} onShown={(lv) => onExplain?.(h, lv)} />
            ))}
          </div>
        ) : (
          cards.map((m) => (
            <div key={m.id} className="border-b border-white/5 py-1.5">
              <button
                onClick={() => setOpenId(openId === m.id ? null : m.id)}
                className="flex w-full items-baseline gap-2 text-left"
              >
                <span className="text-[10px] text-white/30">{openId === m.id ? '▾' : '▸'}</span>
                <span className="text-[12px] text-white/80">{m.name}</span>
                <span className="ml-auto shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
                  {m.category}
                </span>
              </button>
              {openId === m.id ? (
                <div className="mt-1 space-y-1.5 pl-5 text-[11px] leading-4">
                  {(() => {
                    const src = methodExplainSource(m.id)
                    return src ? <Explainer src={src} onShown={(lv) => onExplain?.(src, lv)} /> : null
                  })()}
                  <Line label="什么时候想它" text={m.signals.join('；')} />
                  <Line label="适用" text={m.when} />
                  <Line label="数据要求" text={m.needs} />
                  <Line label="要产出" text={m.output} />
                  <Line label="常见坑" text={m.pitfalls.join('；')} />
                  <Line label="灵敏度" text={m.sensitivity} />
                  <Line label="近邻方法" text={m.variants.join('、')} />
                  <div>
                    <div className="text-white/35">教练会追问这些</div>
                    <ul className="mt-0.5 space-y-0.5 text-white/65">
                      {m.asks.map((a) => (
                        <li key={a}>· {a}</li>
                      ))}
                    </ul>
                  </div>
                  <Line label="书目线索" text={m.refs.join('；') + '（引用前自己核对版本与页码）'} />
                  <button
                    onClick={() => onPin(m, !pinned.includes(m.id))}
                    disabled={!sessionId}
                    className={
                      'mt-1 rounded-lg border px-2.5 py-1 text-[11px] disabled:opacity-40 ' +
                      (pinned.includes(m.id)
                        ? 'border-white/15 text-white/60 hover:bg-white/5'
                        : 'border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20')
                    }
                  >
                    {pinned.includes(m.id) ? '取消钉选' : '钉为候选方法'}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
        <p className="pt-2 text-[10px] leading-4 text-white/25">
          卡上只有适用条件、坑与追问，没有可粘贴的正文。钉上之后教练的提问会围着这几张转，
          但选哪个方法、为什么选，仍然要你在任务卡里自己写。
        </p>
      </div>
    </div>
  )
}

function Line({ label, text }: { label: string; text: string }): ReactNode {
  return (
    <p className="text-white/60">
      <span className="text-white/35">{label}：</span>
      {text}
    </p>
  )
}
