import { db } from '@/lib/db'

export type TaskItem = Awaited<ReturnType<typeof db.taskItem.findMany>>[number]
export type AcceptanceRecord = Awaited<ReturnType<typeof db.acceptanceResult.findMany>>[number]

export function dimKey(width: number, height: number) {
  return `${width}x${height}`
}

export function parseDimKey(key: string): { width: number; height: number } | null {
  const m = key.match(/^(\d+)x(\d+)$/)
  if (!m) return null
  return { width: Number(m[1]), height: Number(m[2]) }
}

export interface SizeEntry {
  size: string
  width: number
  height: number
  specName: string
  format: string
  channelCount: number
  taskCount: number
  channels: string
  fileName?: string
  submittedAt?: string
}

export interface BatchProgress {
  requiredSizes: number
  coveredSizes: number
  missingSizes: number
  coveredList: SizeEntry[]
  missingList: SizeEntry[]
}

export function getHistoricallyCoveredDims(
  tasks: TaskItem[],
  acceptanceResults: AcceptanceRecord[],
): Set<string> {
  const covered = new Set<string>()

  for (const t of tasks) {
    if (t.status === '已完成') {
      covered.add(dimKey(t.specWidth, t.specHeight))
    }
  }

  for (const r of acceptanceResults) {
    if ((r.severity === 'ignore' || r.severity === 'duplicate') && r.fileWidth && r.fileHeight) {
      covered.add(dimKey(r.fileWidth, r.fileHeight))
    }
  }

  return covered
}

function groupTasksByDim(tasks: TaskItem[]) {
  const map = new Map<string, TaskItem[]>()
  for (const t of tasks) {
    const key = dimKey(t.specWidth, t.specHeight)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return map
}

function toSizeEntry(key: string, items: TaskItem[], extra?: Partial<SizeEntry>): SizeEntry {
  const t = items[0]
  const channels = [...new Set(items.map(i => i.specChannel))]
  return {
    size: key,
    width: t.specWidth,
    height: t.specHeight,
    specName: items.length === 1 ? t.specName : `${t.specName} 等`,
    format: t.specFormat,
    channelCount: channels.length,
    taskCount: items.length,
    channels: channels.length <= 3 ? channels.join('、') : `${channels.slice(0, 3).join('、')} 等${channels.length}个渠道`,
    ...extra,
  }
}

export function buildBatchProgress(
  tasks: TaskItem[],
  coveredDims: Set<string>,
  acceptanceResults: AcceptanceRecord[] = [],
): BatchProgress {
  const requiredTasks = tasks.filter(t => t.specIsRequired)
  const requiredByDim = groupTasksByDim(requiredTasks)
  const requiredDimKeys = [...requiredByDim.keys()]

  const latestByDim = new Map<string, AcceptanceRecord>()
  for (const r of acceptanceResults) {
    if (!r.fileWidth || !r.fileHeight) continue
    if (r.severity !== 'ignore' && r.severity !== 'duplicate') continue
    const key = dimKey(r.fileWidth, r.fileHeight)
    const existing = latestByDim.get(key)
    if (!existing || r.createdAt > existing.createdAt) {
      latestByDim.set(key, r)
    }
  }

  const coveredList: SizeEntry[] = []
  const missingList: SizeEntry[] = []

  for (const key of requiredDimKeys.sort()) {
    const items = requiredByDim.get(key)!
    const latest = latestByDim.get(key)
    const entry = toSizeEntry(key, items, latest ? {
      fileName: latest.fileName,
      submittedAt: latest.createdAt.toISOString(),
    } : undefined)

    if (coveredDims.has(key)) {
      coveredList.push(entry)
    } else {
      missingList.push(entry)
    }
  }

  return {
    requiredSizes: requiredDimKeys.length,
    coveredSizes: coveredList.length,
    missingSizes: missingList.length,
    coveredList,
    missingList,
  }
}

export async function loadBatchAcceptanceContext(batchId: string) {
  const batch = await db.batch.findUnique({ where: { id: batchId } })
  if (!batch) return null

  const tasks = await db.taskItem.findMany({ where: { batchId } })
  const acceptanceResults = await db.acceptanceResult.findMany({
    where: { batchId },
    orderBy: { createdAt: 'desc' },
  })

  const coveredDims = getHistoricallyCoveredDims(tasks, acceptanceResults)
  const batchProgress = buildBatchProgress(tasks, coveredDims, acceptanceResults)

  return { batch, tasks, acceptanceResults, coveredDims, batchProgress }
}
