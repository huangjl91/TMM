import type { ReactNode } from 'react'
import type { GuidedStep } from '@shared/guidedQuiz'
import { isLearningStep, LEARNING_TASKS, LEARNING_HELP, readLearningNote, reviewLearning } from '@shared/learning'
import type { TeachingFeedback } from '@shared/teaching'
import { PredictionBasics } from './PredictionBasics'

interface Props {
  prediction?: boolean
  step: GuidedStep
  value: string
  savedValue?: string
  pickedKey: string
  savedKey?: string
  busy: boolean
  onChange: (value: string) => void
  onSaveDraft: (value: string) => void
  saveStatus: string
  teaching?: TeachingFeedback
  teachingStale: boolean
  teachingBusy: boolean
  onTeaching: () => void
}

/** 界面只展示教学任务；反馈规则在 shared/learning.ts，后台也使用相同规则。 */
export function LearningTask({ prediction, step, value, savedValue, pickedKey, savedKey, busy, onChange, onSaveDraft, saveStatus, teaching, teachingStale, teachingBusy, onTeaching }: Props): ReactNode {
  if (!isLearningStep(step)) return null
  const task = LEARNING_TASKS[step]
  const note = readLearningNote(value)
  const saved = readLearningNote(savedValue)
  const feedback = saved.submitted ? reviewLearning(step, saved, savedKey ?? '') : null
  const unchanged = JSON.stringify(note.answers) === JSON.stringify(saved.answers) && pickedKey === savedKey

  return <section className="learning-task" aria-label="解题思考练习">
    <h4>先想一想，再说明依据</h4>
    <p>{task.goal}</p>
    {prediction ? <PredictionBasics stage={step} /> : null}
    <small>填写检查不判断答案对错。没有把握时，可以写明缺少的条件和准备如何核对。</small>
    <p className="learning-save-status" role="status" aria-live="polite">{saveStatus}</p>
    <div className="learning-hint" aria-label="卡点帮助">
      <label>我现在卡在什么地方？
        <select aria-label="选择学习卡点" disabled={busy} value={note.helpTopic ?? ''} onChange={(event) => {
          onSaveDraft(JSON.stringify({ ...note, helpTopic: event.target.value || undefined, helpLevel: 0 }))
        }}>
          <option value="">先自行尝试</option>
          {Object.entries(LEARNING_HELP).map(([key, help]) => <option key={key} value={key}>{help.label}</option>)}
        </select>
      </label>
      <small>由你选择需要的帮助，不作为能力评分。提示只提供方向和类比例子。</small>
      {note.helpTopic ? <>
        <button disabled={busy || (note.helpLevel ?? 0) >= 3} onClick={() => onSaveDraft(JSON.stringify({ ...note, helpLevel: (note.helpLevel ?? 0) + 1 }))}>
          {(note.helpLevel ?? 0) === 0 ? '先给我一个方向' : (note.helpLevel ?? 0) < 3 ? '再具体一点' : '本组提示已展开'} · {note.helpLevel ?? 0}/3
        </button>
        {LEARNING_HELP[note.helpTopic].hints.slice(0, note.helpLevel ?? 0).map((hint, index) => <p key={hint}><b>{['思考方向', '检查方法', '类比例子'][index]}：</b>{hint}</p>)}
      </> : null}
    </div>
    {task.fields.map((label, index) => <label key={label}>
      <span>{index + 1}. {label}</span>
      <textarea
        aria-label={label}
        value={note.answers[index] ?? ''}
        maxLength={4000}
        rows={2}
        disabled={busy}
        placeholder={task.placeholders[index]}
        onChange={(event) => {
          const answers = [...note.answers]
          answers[index] = event.target.value
          onChange(JSON.stringify({ ...note, answers, submitted: false }))
        }}
      />
    </label>)}
    <div className="learning-actions">
      <button disabled={busy} onClick={() => onSaveDraft(JSON.stringify({ ...note, submitted: false }))}>保存草稿</button>
      <button disabled={busy || note.hintLevel >= task.hints.length} onClick={() => {
        const next = JSON.stringify({ ...note, hintLevel: note.hintLevel + 1, submitted: false })
        onSaveDraft(next)
      }}>{note.hintLevel === 0 ? '给我一点提示' : note.hintLevel < 3 ? '再展开一级提示' : '已展开全部提示'} · {note.hintLevel}/3</button>
    </div>
    {task.hints.slice(0, note.hintLevel).map((hint, index) => <p className="learning-hint" key={hint}><strong>提示 {index + 1}：</strong>{hint}</p>)}
    {feedback ? <div className="learning-feedback" role="status">
      <strong>{unchanged ? '上次提交反馈' : '上次提交反馈（回答已修改，请重新提交）'}</strong>
      <p>{feedback.message}</p>
      {feedback.nextQuestion ? <p>下一步：{feedback.nextQuestion}</p> : null}
    </div> : <p className="learning-hint">停笔后自动保存；提交只检查填写完整性，不代表经过实验验证。</p>}
    <div className="learning-teaching">
      <button className="learning-next" disabled={busy || teachingBusy} onClick={onTeaching}>
        {teachingBusy ? '正在分析你的思路…' : '针对我的回答追问'}
      </button>
      <small>优先使用已配置的 AI；未配置或不可用时提供本地追问，不影响继续学习。</small>
      {teaching ? <div className="learning-feedback" aria-label="教学追问">
        <strong>{teaching.source === 'ai' ? 'AI 教学建议' : '本地教学追问'}{teachingStale ? '（回答已修改，需重新获取）' : ''}</strong>
        {teaching.quote ? <blockquote>你写到：“{teaching.quote}”</blockquote> : null}
        <p>{teaching.observation}</p>
        <p><b>待核对：</b>{teaching.gap}</p>
        <p><b>想一想：</b>{teaching.question}</p>
        <p><b>下一步：</b>{teaching.nextAction}</p>
        <small>{teaching.limitation}</small>
      </div> : null}
    </div>
  </section>
}
