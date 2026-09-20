import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron'
import { jobPdfPath, openJobPdf, readJobPdf, runTexJob, USAGE_JOB } from '../latex/compile'
import { collectReport } from './collect'
import { buildUsageTex, USAGE_EXPORT_NAME, type UsageExportResult } from '../../shared/compliance'
import type { ArtifactContent } from '../../shared/sandbox'

/**
 * 《AI 工具使用详情.pdf》的导出：本机留痕 → LaTeX → 复用论文的编译管线 → 另存为。
 *
 * 每次导出都重新采集重新编译，不做缓存——留痕是追加式的，隔天再导出必须看到新的记录，
 * 宁可慢两秒也不能给出一份过期的声明材料。
 */
export function usagePdf(sessionId: number): ArtifactContent | null {
  return readJobPdf(sessionId, USAGE_JOB)
}

export function openUsagePdf(sessionId: number): void {
  openJobPdf(sessionId, USAGE_JOB)
}

export async function exportUsagePdf(sessionId: number, win: BrowserWindow | null): Promise<UsageExportResult> {
  const report = collectReport(sessionId)
  const res = await runTexJob(sessionId, buildUsageTex(report), USAGE_JOB, '详情文档编译')
  if (!res.ok) return { ...res, savedTo: null }

  const from = jobPdfPath(sessionId, USAGE_JOB)
  if (!existsSync(from)) return { ...res, ok: false, savedTo: null }

  // 冒烟/自动化跑不了原生对话框：设了 MMT_EXPORT_DIR 就直接写进那个目录，内容完全一致
  const autoDir = process.env.MMT_EXPORT_DIR?.trim()
  if (autoDir) {
    const dest = join(autoDir, USAGE_EXPORT_NAME)
    copyFileSync(from, dest)
    return { ...res, savedTo: dest }
  }

  const opts: SaveDialogOptions = {
    title: '导出《AI 工具使用详情》',
    defaultPath: USAGE_EXPORT_NAME,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  }
  const { canceled, filePath } = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (canceled || !filePath) return { ...res, savedTo: null }
  copyFileSync(from, filePath)
  return { ...res, savedTo: filePath }
}
