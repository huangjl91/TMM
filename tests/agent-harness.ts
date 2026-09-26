/**
 * M2 离线冒烟的打包入口：esbuild 把 ./repo 换成 tests/fake-repo.ts 后打成
 * .tmp/agent-harness.mjs，让状态机能在裸 node 里跑。
 */
export * as fake from './fake-repo'
export * from '../src/main/stage'
export * from '../src/shared/agent'
export {
  COACH_SYSTEM,
  CRITIC_SYSTEM,
  EXECUTOR_SYSTEM,
  executorUserBrief
} from '../src/main/agent/prompts'
export { plotDigest } from '../src/shared/plots'
export { detectGhostwriting, filterQuizOptions } from '../src/main/agent/anti-ghostwrite'
export { ESCALATE_AFTER_ATTEMPTS, HINT_LEVELS, STAGES } from '../src/shared/stages'
