import { useEffect, useState, type ReactNode } from 'react'
import type { ProviderId, ProviderPreset, RuntimeInfo, SettingsView } from '@shared/types'

interface Props {
  settings: SettingsView
  providers: ProviderPreset[]
  runtime: RuntimeInfo | null
  onClose: () => void
  onChanged: (s: SettingsView) => void
}

function pythonVersion(value: string | null | undefined): string | null {
  if (!value) return null
  return value.split(' · ')[0]?.trim() || null
}

export function SettingsModal({
  settings,
  providers,
  runtime,
  onClose,
  onChanged
}: Props): ReactNode {
  const [providerId, setProviderId] = useState(settings.providerId)
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [model, setModel] = useState(settings.model)
  const [temperature, setTemperature] = useState(settings.temperature)
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pickProvider = (id: ProviderId): void => {
    setProviderId(id)
    const preset = providers.find((p) => p.id === id)
    if (preset && preset.baseUrl) {
      setBaseUrl(preset.baseUrl)
      setModel(preset.models[0] ?? '')
    }
    setNotice('')
  }

  const run = async (fn: () => Promise<SettingsView | void>, okText: string): Promise<void> => {
    setBusy(true)
    setNotice('')
    try {
      const next = await fn()
      if (next) onChanged(next)
      setNotice(okText)
      setKeyInput('')
    } catch (e) {
      setNotice(`失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const test = async (): Promise<void> => {
    setBusy(true)
    setNotice('测试中…')
    try {
      const r = await window.api.testProvider(baseUrl, model, keyInput.trim() || undefined)
      setNotice(r.ok ? `连通，${r.latencyMs}ms — ${r.detail}` : `失败：${r.detail}`)
    } catch (e) {
      setNotice(`失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const preset = providers.find((p) => p.id === providerId)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-full w-[560px] overflow-y-auto rounded-2xl border border-white/10 bg-[#151821] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white/90">模型与运行环境</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">
            关闭
          </button>
        </div>

        <label className="mb-1 block text-xs text-white/45">服务商</label>
        <select
          value={providerId}
          onChange={(e) => pickProvider(e.target.value as ProviderId)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {preset?.keyUrl ? (
          <p className="mb-3 text-[11px] text-white/35">
            Key 申请页：<span className="select-all">{preset.keyUrl}</span>
          </p>
        ) : null}

        <label className="mb-1 block text-xs text-white/45">Base URL</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm outline-none"
        />

        <label className="mb-1 block text-xs text-white/45">模型</label>
        <input
          value={model}
          list="model-list"
          onChange={(e) => setModel(e.target.value)}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm outline-none"
        />
        <datalist id="model-list">
          {(preset?.models ?? []).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <label className="mb-1 block text-xs text-white/45">temperature：{temperature.toFixed(1)}</label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
          className="mb-5 w-full accent-sky-500"
        />

        <label className="mb-1 block text-xs text-white/45">
          API Key {settings.hasApiKey ? '（已保存，留空表示不修改）' : '（未配置）'}
        </label>
        <div className="mb-5 flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-..."
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm outline-none"
          />
          <button
            disabled={busy || !keyInput.trim()}
            onClick={() => void run(() => window.api.setApiKey(providerId, keyInput.trim()), 'Key 已用系统加密保存')}
            className="rounded-lg bg-sky-600 px-3 text-sm disabled:opacity-40"
          >
            保存
          </button>
          {settings.hasApiKey ? (
            <button
              disabled={busy}
              onClick={() => void run(() => window.api.clearApiKey(providerId), 'Key 已清除')}
              className="rounded-lg border border-white/15 px-3 text-sm text-white/70 disabled:opacity-40"
            >
              清除
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() =>
              void run(
                () => window.api.saveSettings({ providerId, baseUrl, model, temperature }),
                '配置已保存'
              )
            }
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm disabled:opacity-40"
          >
            保存配置
          </button>
          <button
            disabled={busy}
            onClick={() => void test()}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/75 disabled:opacity-40"
          >
            测试连接
          </button>
        </div>

        {notice ? <p className="mt-3 break-all text-xs text-emerald-300/80">{notice}</p> : null}

        <div className="mt-6 border-t border-white/10 pt-4 text-[11px] leading-5 text-white/40">
          <div>Electron {runtime?.electron} · Node {runtime?.node} · Chrome {runtime?.chrome}</div>
          <div>
            Python：{pythonVersion(runtime?.python) ?? <span className="text-amber-300">未探测到</span>}
            {runtime?.python && !runtime.pythonReady ? <span className="text-amber-300">（依赖不完整）</span> : null}
            {' · '}XeLaTeX：{runtime?.xelatex ? '已就绪' : <span className="text-amber-300">未探测到</span>}
          </div>
          <div>项目数据：按当前用户保存在本机</div>
          <div className="mt-1">Key 仅在本机经系统加密存储，请求由主进程直发服务商，不经过任何第三方。</div>
        </div>
      </div>
    </div>
  )
}
