import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DataFileProfile, SessionFileView } from '@shared/intake'
import { isReadableTabularFile } from '@shared/intake'
import { PredictionBasics } from './PredictionBasics'
import { emptyLab, experimentQuestion, labInputKey, labStatus, planMissing, reviewReflection, type PredictionLabPlan, type PredictionLabState } from '@shared/predictionLab'

interface Props { sessionId: number; questionIdx: number; files: SessionFileView[]; thoughtSubmitted: boolean }

export function PredictionLab({ sessionId, questionIdx, files, thoughtSubmitted }: Props): ReactNode {
  const [saved, setSaved] = useState<PredictionLabState>(emptyLab)
  const [plan, setPlan] = useState<PredictionLabPlan>(emptyLab().plan)
  const [reflection, setReflection] = useState(emptyLab().reflection)
  const [profile, setProfile] = useState<DataFileProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    window.api.getPredictionLab(sessionId, questionIdx).then((next) => {
      if (!active) return
      setSaved(next); setPlan(next.plan); setReflection(next.reflection)
      if (next.experiment?.plotName) void window.api.readArtifact(sessionId, next.experiment.plotName).then((picture) => {
        if (active) setImageUrl(picture.dataUrl ?? null)
      }).catch(() => { /* 指标快照仍可阅读，图表缺失不会生成替代图。 */ })
    }).catch((e: Error) => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId, questionIdx])
  useEffect(() => {
    let active = true
    let retry: ReturnType<typeof setTimeout> | undefined
    setProfile(null)
    const inspect = (attempt: number): void => {
      void window.api.inspectDataFile(sessionId, plan.file, plan.sheet || undefined).then((next) => {
        if (active) { setProfile(next); setError('') }
      }).catch((e: Error) => {
        if (!active) return
        // 附件预览也使用会话沙箱，等待其他面板的短暂读取完成。
        if (/上一次运行还没结束|正在运行/.test(e.message) && attempt < 12) {
          retry = setTimeout(() => inspect(attempt + 1), 500)
        } else setError(e.message)
      })
    }
    if (plan.file) inspect(0)
    return () => { active = false; if (retry) clearTimeout(retry) }
  }, [sessionId, plan.file, plan.sheet])

  const dataFiles = files.filter(isReadableTabularFile)
  const inputMatches = labInputKey(plan) === labInputKey(saved.plan)
  const planConfirmed = inputMatches && plan.expectation === saved.plan.expectation && !planMissing(plan)
  const experiment = inputMatches ? saved.experiment : undefined
  const evidenceUsable = Boolean(experiment && !saved.staleReason)
  const summary = experiment?.summary
  const fieldsValid = Boolean(profile?.columns.includes(plan.timeColumn) && profile.numericColumns.includes(plan.targetColumn))
  const dirtyReflection = JSON.stringify(reflection) !== JSON.stringify(saved.reflection)

  function updatePlan(key: keyof PredictionLabPlan, value: string): void {
    setPlan((current) => ({ ...current, [key]: value, ...(key === 'file' ? { sheet: '', timeColumn: '', targetColumn: '' } : key === 'sheet' ? { timeColumn: '', targetColumn: '' } : {}) }))
    setMessage('配置已修改，请确认计划后再运行。')
    if (key !== 'expectation') setImageUrl(null)
  }
  async function action(kind: 'plan' | 'run' | 'reflect'): Promise<void> {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const next = kind === 'plan'
        ? await window.api.savePredictionPlan(sessionId, questionIdx, plan)
        : kind === 'run'
          ? await window.api.runPredictionLab(sessionId, questionIdx)
          : await window.api.savePredictionReflection(sessionId, questionIdx, experiment!.runId, reflection)
      if (!alive.current) return
      if (kind !== 'reflect') setReviewed(null)
      setSaved(next); setPlan(next.plan); setReflection(next.reflection)
      setMessage(kind === 'plan' ? '实验计划已保存。' : kind === 'run' ? '实验已运行。请依据下面的真实指标完成复盘，不要直接将它们当成最终结论。' : '复盘已保存，仍需核对证据与题目要求。')
      if (next.experiment) {
        const picture = await window.api.readArtifact(sessionId, next.experiment.plotName)
        if (alive.current) setImageUrl(picture.dataUrl ?? null)
      }
    } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { if (alive.current) setBusy(false) }
  }
  if (loading) return <section className="prediction-lab">正在恢复实验任务…</section>
  return <section className="prediction-lab" aria-label="预测实验任务卡">
    <h3>预测实验任务卡 · 问题 {questionIdx}</h3>
    <div className="lab-statuses" aria-label="学习状态">
      <span>{thoughtSubmitted ? '思路已提交' : '思路尚未提交'}</span>
      <span>{!inputMatches ? '配置已改变，需重新实验' : labStatus(saved)}</span>
      <span>最终结论：仍需人工核对</span>
    </div>
    <p>填写思路、运行成功和验证结论是三个不同的状态。这里先完成一次可核对的预测实验。</p>
    <PredictionBasics stage="experiment" />
    <fieldset disabled={busy}>
      <legend>1. 确认数据与实验预期</legend>
      {!dataFiles.length ? <p>请先导入真实 CSV、TSV 或 Excel 数据附件。</p> : null}
      <div className="lab-fields">
        <label>数据附件<select aria-label="实验数据附件" value={plan.file} onChange={(e) => updatePlan('file', e.target.value)}><option value="">请选择</option>{dataFiles.map((file) => <option key={file.id} value={file.relPath}>{file.name}</option>)}</select></label>
        {profile?.sheets.length ? <label>工作表<select aria-label="实验工作表" value={plan.sheet || profile.activeSheet || ''} onChange={(e) => updatePlan('sheet', e.target.value)}>{profile.sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}</select></label> : null}
        <label>时间列<select aria-label="实验时间列" value={plan.timeColumn} onChange={(e) => updatePlan('timeColumn', e.target.value)}><option value="">请选择</option>{profile?.columns.map((column) => <option key={column}>{column}</option>)}</select></label>
        <label>预测目标<select aria-label="实验预测目标" value={plan.targetColumn} onChange={(e) => updatePlan('targetColumn', e.target.value)}><option value="">请选择一个数值列</option>{profile?.numericColumns.filter((column) => column !== plan.timeColumn).map((column) => <option key={column}>{column}</option>)}</select></label>
        <label>目标单位<input aria-label="实验目标单位" maxLength={120} value={plan.unit} placeholder="例如：人、kWh、无量纲" onChange={(e) => updatePlan('unit', e.target.value)} /></label>
      </div>
      {profile ? <p>已读取 {profile.rowCount} 行。请自行核对时间含义、采样间隔和字段单位。</p> : null}
      <label>运行前的预期<textarea aria-label="实验预期" rows={2} maxLength={4000} value={plan.expectation} placeholder="你预计哪种简单方法有效？为什么？准备比较什么指标？" onChange={(e) => updatePlan('expectation', e.target.value)} /></label>
      <button disabled={!fieldsValid || Boolean(planMissing(plan))} onClick={() => void action('plan')}>确认并保存实验计划</button>
    </fieldset>
    <fieldset disabled={busy}>
      <legend>2. 建立基线并运行比较</legend>
      <p>先用“上一期观测值”作基线，再比较线性趋势、3 期移动平均及数据允许时的季节朴素方法。一次运行使用相同的测试集，结果包含在下方表格中。</p>
      <p>只用训练段内部的滚动验证选择方法；最后的 20% 数据仅作测试。本实验评估逐期一步预测，并不直接生成未来多期预测。</p>
      <button disabled={!thoughtSubmitted || !planConfirmed || !fieldsValid} onClick={() => void action('run')}>{busy ? '正在运行…' : '运行基线与候选比较'}</button>
      {!thoughtSubmitted ? <small>请先提交读题复述与模型选择理由。</small> : null}
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    <fieldset>
      <legend>3. 阅读本次证据</legend>
      {saved.staleReason ? <p role="alert">{saved.staleReason}</p> : null}
      {summary && experiment ? <>
        <p>最近成功实验 #{experiment.runId} · {new Date(experiment.createdAt).toLocaleString()} · 目标单位：{experiment.plan.unit}</p>
        <p>运行前预期：{experiment.plan.expectation}</p>
        <p>训练 {summary.trainRows} 行；测试 {summary.testRows} 行（{summary.testRange}）。训练段滚动验证入选：{summary.bestModel}。</p>
        <div className="lab-table"><table><thead><tr><th>方法</th><th>MAE</th><th>RMSE</th><th>MAPE</th></tr></thead><tbody>{summary.metrics.map((metric) => <tr key={metric.model}><td>{metric.model === 'walk-forward-naive-lag-1' ? '上一期观测值（基线）' : metric.model}</td><td>{metric.mae.toPrecision(5)}</td><td>{metric.rmse.toPrecision(5)}</td><td>{metric.mape === null ? '不适用' : `${metric.mape.toPrecision(4)}%`}</td></tr>)}</tbody></table></div>
        <p>MAE 是平均绝对误差，RMSE 对较大的误差更敏感，两者单位均为{experiment.plan.unit}；MAPE 是百分比误差。误差更小还需要结合样本量与实际用途判断。</p>
        {summary.intervals.map((interval) => <p key={interval.level}>{Math.round(interval.level * 100)}% 经验区间：半宽 {interval.halfWidth.toPrecision(4)} {experiment.plan.unit}，本次测试覆盖率 {(interval.coverage * 100).toFixed(1)}%。覆盖率不保证未来表现。</p>)}
        {imageUrl ? <img src={imageUrl} alt="当前预测实验的测试集比较与残差图" /> : <p>图表可在“代码实验”的运行记录中查看；这里恢复的是本次运行保存的指标快照。</p>}
        <p className="lab-question">想一想：{experimentQuestion(summary)}</p>
      </> : <p>尚无当前配置的实验结果。先运行，不预填指标或结论。</p>}
    </fieldset>
    <fieldset disabled={busy || !evidenceUsable}>
      <legend>4. 比较结果并解释局限</legend>
      {(['comparison', 'limitation', 'nextAction'] as const).map((key, index) => <label key={key}>{['指标比较与证据', '结果的局限', '下一步调整或保留理由'][index]}<textarea aria-label={['实验比较', '实验局限', '实验下一步'][index]} rows={2} maxLength={4000} value={reflection[key]} onChange={(e) => setReflection((current) => ({ ...current, [key]: e.target.value }))} /></label>)}
      <button disabled={!Object.values(reflection).every((value) => value.trim())} onClick={() => void action('reflect')}>保存实验复盘</button>
      <button onClick={() => setReviewed(JSON.stringify(reflection))}>检查我的证据引用</button>
      {reviewed && evidenceUsable ? <div aria-label="复盘证据反馈"><strong>本地证据引用检查</strong>{reviewed !== JSON.stringify(reflection) ? <p>复盘已修改，请重新检查。</p> : <ul>{reviewReflection({ ...saved, reflection }).map((item) => <li key={item}>{item}</li>)}</ul>}</div> : null}
      <small>{dirtyReflection ? '复盘已修改，请点击保存。' : saved.reflectedAt ? '已保存复盘；填写完整不代表结论验证通过。' : '请引用具体指标，并说明数据范围、误差和局限。'}</small>
    </fieldset>
  </section>
}
