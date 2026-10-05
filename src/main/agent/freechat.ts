import { completeText, streamChat, type ChatMsg } from '../llm/openai-compat'
import {
  appendMessage,
  createSession,
  finalizeMessage,
  getFreeMessages,
  loadSettings,
  logAiUsage,
  renameSession
} from '../repo'
import { currentStageId } from '../stage'
import { broadcast, judgeViolation, keyOrFail } from './coach'
import { detectGhostwriting } from './anti-ghostwrite'
import { FREE_REWRITE_INSTRUCTION, FREE_SYSTEM } from './prompts'
import type { FreeSendPayload } from '../../shared/types'

/**
 * 右侧「AI 对话框」：与教练对话并列的第二条链路。
 *
 * 它和 coach.ts 的区别只有三点：
 *   1. 不注入阶段 brief，不带 rubric —— 学生问什么答什么；
 *   2. 不要求 JSON，正文就是普通流式文本；
 *   3. 反代写闸门放在「定稿之后」——教练那边可以先拦再显示卡片，
 *      这里正文一出来就打在学生屏幕上了，所以判实了必须用 replace 事件整段换掉。
 * 相同的是：同样只在主进程取 Key、同样每一次问答都写 AI 使用日志。
 */

/** 自由对话按会话各自记一个 controller，避免和教练的 turn 互相打断 */
const controllers = new Map<number, AbortController>()
export const isFreeChatBusy = (id: number): boolean => controllers.has(id)

/** 历史比教练那边留短一点：自由问答多轮闲聊，没必要把 token 吃满 */
const HISTORY_LIMIT = 20

function blockedNotice(reasons: string[]): string {
  return [
    '这段回答被判为**可以直接粘贴进论文的成稿**，已经撤掉了。',
    reasons.length ? `判定依据：${reasons.join('；')}。` : '',
    '这一栏能帮你的：把问题拆小一点再问——比如「这个方法的适用条件是什么」「我这个报错说明什么」「该用哪个量去验证结论」。',
    '要在论文里落笔的那一段，仍然得你自己写；我可以告诉你它该包含什么、哪里容易站不住。'
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * 反代写闸门（自由对话版）：启发式先筛，可疑再让 Critic 判定，
 * 判实了要求重写一次；重写仍越界就整段换成说明，宁可不给内容也不替学生成稿。
 */
async function enforceFree(
  draft: string,
  base: ChatMsg[],
  endpoint: ReturnType<typeof keyOrFail>,
  sessionId: number
): Promise<string> {
  const first = detectGhostwriting(draft)
  if (!first.suspect) return draft
  if (!(await judgeViolation(endpoint, endpoint.model, draft))) return draft

  const stageId = currentStageId(sessionId)
  logAiUsage(sessionId, stageId, 'critic_block', `自由问答判为越界：${first.reasons.join('；')}`, null, endpoint.model)
  try {
    const retry = await completeText({
      ...endpoint,
      messages: [
        ...base,
        { role: 'assistant', content: draft },
        {
          role: 'user',
          content: `${FREE_REWRITE_INSTRUCTION}\n违规证据：${first.reasons.join('；')}`
        }
      ]
    })
    const rewritten = retry.trim()
    if (rewritten && !detectGhostwriting(rewritten).suspect) return rewritten
    logAiUsage(sessionId, stageId, 'critic_sanitize', '自由问答重写后仍越界，已替换为说明', null, endpoint.model)
  } catch (e) {
    logAiUsage(sessionId, stageId, 'critic_rewrite_failed', (e as Error).message, null, endpoint.model)
  }
  return blockedNotice(first.reasons)
}

export async function sendFree(payload: FreeSendPayload): Promise<void> {
  const text = payload?.text?.trim()
  if (!text) return

  let endpoint: ReturnType<typeof keyOrFail>
  try {
    endpoint = keyOrFail()
  } catch (e) {
    broadcast({ type: 'error', message: (e as Error).message })
    return
  }

  let sessionId = payload.sessionId
  if (!Number.isInteger(sessionId) || (sessionId as number) < 1) {
    const s = loadSettings()
    sessionId = createSession(text, s.providerId, s.model)
    renameSession(sessionId, text)
  }
  const id = sessionId as number

  appendMessage(id, 'user', text, 'free')
  const history: ChatMsg[] = getFreeMessages(id)
    .filter((m) => m.content.trim())
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content }))
  const messages: ChatMsg[] = [{ role: 'system', content: FREE_SYSTEM }, ...history]

  const controller = new AbortController()
  controllers.set(id, controller)
  const messageId = appendMessage(id, 'assistant', '', 'free')
  broadcast({ type: 'start', sessionId: id, messageId, kind: 'free' })

  let raw = ''
  let reasoning = ''
  try {
    const r = await streamChat({ ...endpoint, messages, signal: controller.signal }, (kind, chunk) => {
      if (kind === 'delta') {
        raw += chunk
        broadcast({ type: 'delta', text: chunk })
      } else {
        reasoning += chunk
        broadcast({ type: 'reasoning', text: chunk })
      }
    })
    const draft = r.content.trim().length
      ? r.content
      : '（这次端点没有返回正文。检查一下设置里的模型名是否支持对话补全；思维链若有内容，折叠在上面。）'
    const final = await enforceFree(draft, messages, endpoint, id)
    finalizeMessage(messageId, final, reasoning || null, r.usage)
    // 比的是「流出去过什么」而不是 r.content：草稿已经显示在学生眼前了，
    // 只要定稿和它不一致（被闸门换了，或正文本来就是空的），就得明确覆盖掉
    if (final !== raw) broadcast({ type: 'replace', text: final })
    logAiUsage(
      id,
      currentStageId(id),
      'free_chat',
      `自由问答：${text.slice(0, 120)} → 回答 ${String(final.length)} 字`,
      null,
      endpoint.model
    )
    broadcast({ type: 'done', usage: r.usage })
  } catch (e) {
    const aborted = controller.signal.aborted
    if (raw) finalizeMessage(messageId, raw + '\n\n_(已中断)_', reasoning || null, null)
    broadcast(aborted ? { type: 'aborted' } : { type: 'error', message: (e as Error).message })
  } finally {
    controllers.delete(id)
  }
}

export function abortFree(sessionId: number | null): void {
  if (sessionId === null) for (const c of controllers.values()) c.abort()
  else controllers.get(sessionId)?.abort()
}
