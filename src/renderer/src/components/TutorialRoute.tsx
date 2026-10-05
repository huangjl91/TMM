import type { GuidedStep } from '@shared/guidedQuiz'
import { tutorialCsv } from '@shared/tutorial'

export function TutorialRoute({ step }: { step: GuidedStep }) {
  return <section className="prediction-basics" aria-label="新手练习路线">
    <h3>新手练习：从读题到复盘</h3>
    <p><b>本案例只使用合成教学数据。</b>可以尝试和重做，不能将结果用于真实经营决策。回答和保存进度会出现在历史中。</p>
    <p>当前建议：{step === 'intuition' ? '先完成下方三项读题回答，提交后阅读反馈，再继续。' : step === 'model_select' ? '先选一个方向，说明为什么适合、与什么简单方法比较，以及怎样验证。' : '在预测实验任务卡中确认计划、运行并完成复盘；不需要先写出完整推导。'}</p>
    <details open={step === 'intuition'}><summary>1—2. 读懂题目，认识数据</summary>
      <p>为什么做：先确认预测对象和每行的含义，避免选错目标。完成后：用自己的话写出目标、数据来源、结果形式与单位。</p>
      <p>date 是日期，visitors 是当天人数，一行代表一天。下面是教学附件的前五行：</p>
      <pre>{tutorialCsv().split('\n').slice(0, 6).join('\n')}</pre>
      <p>想一想：你要预测的是日期还是人数？预测下一天时，哪些观测已经知道，哪些还不知道？</p>
    </details>
    <details open={step === 'model_select'}><summary>3. 先提出简单基线</summary>
      <p>为什么做：有一个简单参照，才能判断复杂方法有没有带来帮助。完成后：在下方写出一种简单方法，并说明怎样用同一段数据比较。</p>
      <p>可以思考“沿用上一天的人数”。如果人数一直变化，它可能遇到什么问题？先写预期，再看实验。</p>
    </details>
    <details><summary>4. 保存计划并运行实验</summary>
      <p>在实验卡选择“教学练习-客流.csv”，时间列 date、目标列 visitors、单位“人”；预期由你自己填写。保存计划后点击“运行基线与候选比较”。</p>
      <p>为什么做：用真实执行结果检查预期。完成后：应看到运行编号、各方法误差和图表。失败时先看错误提示；本地 Python 及依赖须可用，不需要 AI Key。</p>
    </details>
    <details><summary>5—6. 比较证据，解释局限</summary>
      <p>先找到基线与入选方法在同一测试段的 RMSE。哪个较小？差异是否足以支持你的选择？再看图中哪里偏差较大。</p>
      <p>完成后：填写“指标比较、结果局限、下一步”，检查证据引用并保存复盘。题目只有 60 天合成数据；本次效果不等于真实客流或未来表现。</p>
      <p>自查：遮住提示，你能解释为什么留出测试段、为什么需要基线吗？如果不能，回到术语词典再试。保存完整不代表已经掌握。</p>
    </details>
  </section>
}
