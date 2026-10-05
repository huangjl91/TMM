export const TUTORIAL_FILE = '教学练习-客流.csv'
export const TUTORIAL_PROBLEM = `教学练习：每日客流预测（合成数据，不代表真实经营情况）
问题一：根据附件中连续60天的每日客流记录，比较简单预测方法对下一期客流的预测表现。
date 是日期，每行代表一天；visitors 是客流人数，单位为人。所有数值为教学合成数据。
请先用自己的话说明目标与数据，再选择简单基线与候选方法，使用末段留出数据检查误差。最后引用本次实际运行的指标，解释测试范围和局限。
本练习进行历史数据的一步预测评估，不要求生成未来多期预测，也不能把教学结果当成真实业务结论。`
export function tutorialCsv(): string {
  return 'date,visitors\n' + Array.from({ length: 60 }, (_, day) => {
    const date = new Date(Date.UTC(2025, 0, day + 1)).toISOString().slice(0, 10)
    const visitors = 100 + day * 2 + [0, 4, -3, 2, 6, 15, 12][day % 7]!
    return `${date},${visitors}`
  }).join('\n') + '\n'
}
