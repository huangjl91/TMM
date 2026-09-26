/**
 * 导入层的纯逻辑：类型判定、文件名消毒、摘要构造、注入教练上下文的文本。
 * 单独成文件是因为 dialog 与 pdfjs 都无法在离线冒烟里跑，这层能全部直测。
 */

export type IntakeKind = 'problem' | 'data'
export type DigestKind = 'text' | 'pdf' | 'csv' | 'binary'

export interface SessionFileView {
  id: number
  kind: IntakeKind
  name: string
  /** 相对会话工作区的路径，学生代码里就写这个 */
  relPath: string
  size: number
  digestKind: DigestKind
  digest: string
  /** 提取文本一定不完全可靠（双栏、公式、图片里的字），界面必须提醒核对 */
  needsVerify: boolean
  createdAt: number
}

export interface IntakeResult {
  sessionId: number
  files: SessionFileView[]
  /** 题目文档没提取出像样文本时给出原因，让学生知道要手贴 */
  problemWarning: string | null
}

export interface DataFileProfile {
  relPath: string
  sheets: string[]
  activeSheet: string | null
  columns: string[]
  numericColumns: string[]
  rowCount: number
}

export interface DataPreviewSelection {
  sheetName?: string | null
  xColumn?: string | null
  yColumns?: string[]
}

export function isReadableTabularFile(file: Pick<SessionFileView, 'kind' | 'relPath' | 'name'>): boolean {
  return file.kind === 'data' && Boolean(file.relPath) && /\.(csv|tsv|xlsx|xls)$/i.test(file.name)
}

/** 生成只读取已导入附件的基础探索代码；不写入示例数组，也不预设任何结果。 */
export function buildRealDataPreviewCode(
  file: Pick<SessionFileView, 'kind' | 'relPath' | 'name'>,
  selection: DataPreviewSelection = {}
): string | null {
  if (!isReadableTabularFile(file)) return null
  const pathLiteral = JSON.stringify(file.relPath.replace(/\\/g, '/'))
  const isExcel = /\.xlsx?$/i.test(file.name)
  const isTsv = /\.tsv$/i.test(file.name)
  const sheetLiteral = JSON.stringify(selection.sheetName ?? 0)
  const xLiteral = selection.xColumn ? JSON.stringify(selection.xColumn) : 'None'
  const yLiteral = JSON.stringify(selection.yColumns ?? [])
  const reader = isExcel
    ? `pd.read_excel(DATA_FILE, sheet_name=SHEET_NAME)`
    : `pd.read_csv(DATA_FILE${isTsv ? ", sep='\\t'" : ''})`
  return `# 此代码只读取已导入的真实附件，不创建模拟数据
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import json
import hashlib
import re
from datetime import datetime, timezone

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

DATA_FILE = Path(${pathLiteral})
SHEET_NAME = ${sheetLiteral}
X_COLUMN = ${xLiteral}
Y_COLUMNS = ${yLiteral}
if not DATA_FILE.exists():
    raise FileNotFoundError(f'找不到已导入附件: {DATA_FILE}')

df = ${reader}
if df.empty:
    raise ValueError('数据表为空，无法绘图')

numeric = df.select_dtypes(include='number')
if numeric.shape[1] == 0:
    raise ValueError(f'没有可绘制的数值列；现有字段: {list(df.columns)}')

print('数据文件:', DATA_FILE)
print('数据形状:', df.shape)
print('字段:', list(df.columns))
print(numeric.describe().to_string())

cols = [c for c in Y_COLUMNS if c in numeric.columns] or list(numeric.columns[:4])
if not cols:
    raise ValueError('所选纵轴字段不是数值列')
if X_COLUMN and X_COLUMN not in df.columns:
    raise ValueError(f'找不到横轴字段: {X_COLUMN}')

def label_and_unit(column):
    text = str(column)
    match = re.match(r'^(.*?)[_（(]([^_（）()]+)[）)]?$', text)
    if not match:
        return text, '未标注单位'
    label, unit = match.group(1), match.group(2)
    unit = {'C': '℃', 'degC': '℃'}.get(unit, unit)
    return label, unit

series_meta = {column: label_and_unit(column) for column in cols}
units = {unit for _, unit in series_meta.values()}
x_values = df[X_COLUMN] if X_COLUMN else df.index
if len(units) == 1:
    fig, ax = plt.subplots(figsize=(10, 5))
    for column in cols:
        label, _unit = series_meta[column]
        ax.plot(x_values, df[column], linewidth=1.5, label=label)
    only_unit = next(iter(units))
    ax.set_ylabel(f'观测值（{only_unit}）')
    ax.legend()
    axes = [ax]
else:
    fig, axes = plt.subplots(len(cols), 1, figsize=(10, max(4, 3.2 * len(cols))), sharex=True)
    if len(cols) == 1:
        axes = [axes]
    for ax, column in zip(axes, cols):
        label, unit = series_meta[column]
        ax.plot(x_values, df[column], linewidth=1.6, label=label)
        ax.set_ylabel(f'{label}（{unit}）')
        ax.legend(loc='best')
for ax in axes:
    ax.grid(True, linestyle='--', alpha=0.35)
axes[-1].set_xlabel(X_COLUMN or '样本序号')
axes[0].set_title(f'真实附件基础检查：{DATA_FILE.name}')
plt.tight_layout()
plt.savefig('real_data_preview.png', dpi=300)

missing_by_column = {str(key): int(value) for key, value in df.isna().sum().items() if int(value) > 0}
duplicate_x = int(df.duplicated(subset=[X_COLUMN]).sum()) if X_COLUMN else None
x_sorted = None
invalid_time_values = None
time_interval_regular = None
inferred_frequency = None
if X_COLUMN:
    parsed_time = pd.to_datetime(df[X_COLUMN], errors='coerce')
    invalid_time_values = int(parsed_time.isna().sum())
    if invalid_time_values == 0:
        x_sorted = bool(parsed_time.is_monotonic_increasing)
        intervals = parsed_time.diff().dropna()
        inferred_frequency = pd.infer_freq(parsed_time) if len(parsed_time) >= 3 else None
        time_interval_regular = bool(inferred_frequency) if len(parsed_time) >= 3 else (bool(intervals.nunique() <= 1) if len(intervals) else True)
    else:
        x_sorted = bool(df[X_COLUMN].is_monotonic_increasing)

source_hash = hashlib.sha256(DATA_FILE.read_bytes()).hexdigest()
output_hash = hashlib.sha256(Path('real_data_preview.png').read_bytes()).hexdigest()
mapping = {'sheet': SHEET_NAME, 'xColumn': X_COLUMN, 'yColumns': list(map(str, cols))}
mapping_hash = hashlib.sha256(json.dumps(mapping, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
manifest = {
    'schemaVersion': 'tmm-evidence-v1',
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'sourceFile': DATA_FILE.as_posix(),
    'sourceSha256': source_hash,
    'sheet': SHEET_NAME if DATA_FILE.suffix.lower() in ('.xlsx', '.xls') else None,
    'rowCount': int(len(df)),
    'columns': list(map(str, df.columns)),
    'xColumn': X_COLUMN,
    'yColumns': list(map(str, cols)),
    'series': [{'column': str(column), 'label': series_meta[column][0], 'unit': series_meta[column][1]} for column in cols],
    'quality': {
        'missingByColumn': missing_by_column,
        'duplicateRows': int(df.duplicated().sum()),
        'duplicateX': duplicate_x,
        'xSortedAscending': x_sorted,
        'invalidTimeValues': invalid_time_values,
        'timeIntervalRegular': time_interval_regular,
        'inferredFrequency': inferred_frequency
    },
    'mappingSha256': mapping_hash,
    'output': 'real_data_preview.png',
    'outputSha256': output_hash
}
Path('evidence_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('数据质量:', json.dumps(manifest['quality'], ensure_ascii=False))
print('已生成 real_data_preview.png 与 evidence_manifest.json；这只是数据检查，不是模型结论。')
`
}

/** 注入教练的预算：题目原文再长也只给这么多，否则每轮对话都在烧 token */
export const MAX_BRIEFING_CHARS = 4000
export const MAX_DIGEST_CHARS = 20_000

const PROBLEM_EXT = new Set(['.pdf', '.txt', '.md', '.docx', '.doc'])
const TEXT_EXT = new Set(['.txt', '.md'])
const CSV_EXT = new Set(['.csv', '.tsv'])
/** 应用不解析、只登记清单的类型：交给学生在沙箱里用 pandas 读 */
const LIST_ONLY_EXT = new Set(['.xlsx', '.xls', '.zip', '.rar', '.7z', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.bmp', '.mat', '.npz', '.h5'])

export function extOf(name: string): string {
  const base = baseOf(name)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

function baseOf(name: string): string {
  return name.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
}

export function digestKind(name: string): DigestKind {
  const ext = extOf(name)
  if (ext === '.pdf') return 'pdf'
  if (TEXT_EXT.has(ext)) return 'text'
  if (CSV_EXT.has(ext)) return 'csv'
  return 'binary'
}

export function defaultKind(name: string): IntakeKind {
  return PROBLEM_EXT.has(extOf(name)) ? 'problem' : 'data'
}

export function needsVerify(name: string): boolean {
  return digestKind(name) === 'pdf'
}

/** 只保留落盘安全的文件名：去目录、去控制字符、限长，且不允许以点开头（免得造出 .mt-* 之类内部文件） */
export function safeName(name: string): string {
  const cleaned = baseOf(name)
    .replace(/[\r\n\t\u0000-\u001f:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  if (!cleaned || cleaned === '.' || cleaned === '..') return '未命名文件'
  return cleaned.startsWith('.') ? '_' + cleaned : cleaned
}

export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '大小未知'
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 空白折叠 + 截断：PDF 抽出来满是断行与多余空格，直接喂模型只会污染上下文 */
export function normalizeExtracted(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…（共 ${String(text.length)} 字，已截断）`
}

/** CSV 只给表头加前几行样本：那是数据不是文本，整表进 prompt 既贵又没用了学生自己看 */
export function csvDigest(text: string): string {
  const rows = text.replace(/\r\n?/g, '\n').split('\n').filter((r) => r.trim().length > 0)
  if (rows.length === 0) return '（空文件）'
  const head = rows[0] ?? ''
  const cols = head.split(/[,\t]/).length
  const sample = rows.slice(1, 4).map((r, i) => `  第 ${String(i + 1)} 行：${clip(r, 300)}`)
  return [
    `列数 ${String(cols)}，数据行数约 ${String(Math.max(0, rows.length - 1))}`,
    `表头：${clip(head, 600)}`,
    ...sample,
    rows.length > 4 ? `…另有 ${String(rows.length - 4)} 行未列出` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function binaryDigest(name: string, size: number): string {
  const ext = extOf(name)
  if (LIST_ONLY_EXT.has(ext)) {
    return `应用不解析 ${ext || '此类'} 内容，只登记清单（${humanSize(size)}）。要在沙箱里看：pandas.read_excel('${safeName(name)}') 或先解压。`
  }
  return `未识别的文件类型 ${ext || '（无扩展名）'}，大小 ${humanSize(size)}。`
}

/** 从文件名和已读到的文本构造 digest；pdf 的文本由主进程提取后传进来，这层只做清洗与截断 */
export function buildDigest(name: string, size: number, extracted: string | null): string {
  const kind = digestKind(name)
  if (kind === 'text') return clip(normalizeExtracted(extracted ?? ''), MAX_DIGEST_CHARS) || '（文件是空的）'
  if (kind === 'pdf') {
    const t = normalizeExtracted(extracted ?? '')
    return t ? clip(t, MAX_DIGEST_CHARS) : '（这版 PDF 抽不出文本层，多半是扫描件；请手贴题目文本）'
  }
  if (kind === 'csv') return clip(csvDigest(extracted ?? ''), MAX_DIGEST_CHARS) || '（空文件）'
  return binaryDigest(name, size)
}

/** 导入后教练必须看得见题目与附件，否则它只能凭学生复述提问 */
export function intakeBriefing(files: SessionFileView[], budget = MAX_BRIEFING_CHARS): string {
  const problems = files.filter((f) => f.kind === 'problem')
  const data = files.filter((f) => f.kind === 'data')
  if (problems.length === 0 && data.length === 0) return ''

  const parts: string[] = []
  for (const p of problems) {
    if (!p.digest.trim()) continue
    parts.push(
      `【赛题原文（导入自 ${p.name}${p.needsVerify ? '，PDF 提取结果可能错乱，须学生核对' : ''}）】\n${clip(p.digest, budget)}`
    )
  }
  if (data.length) {
    parts.push(
      `【已导入附件（在会话工作区里，学生代码用相对路径 '附件/文件名' 读取）】\n${data
        .map((d) => `- ${d.name} · ${humanSize(d.size)}\n${clip(d.digest, 600)}`)
        .join('\n')}`
    )
  }
  // 预算按整段控制：题目长的题一份就够，别让附件清单把它挤掉
  return clip(parts.join('\n\n'), budget + 6000)
}
