import { STORE_SLOT_COUNT } from '@/data/store-screenshot-spec'

export function filterStoreImageFiles(files: File[]) {
  return files.filter(file =>
    file.type.startsWith('image/') || /\.(png|jpe?g|jpeg|webp)$/i.test(file.name)
  )
}

/** 从文件名识别槽位 1~5，如 01.png、图2.jpg、screenshot_03 */
export function resolveSlotIndexFromFileName(fileName: string): number | null {
  const base = fileName.replace(/\.[^.]+$/, '').trim().toLowerCase()

  if (/^(0?[1-5])$/.test(base)) return Number(base.replace(/^0/, '') || base)

  const patterns = [
    /(?:^|[_\-\s])(0?[1-5])(?:[_\-\s.]|$)/,
    /^图\s*([1-5])$/,
    /(?:screenshot|screen|img|pic|store|五图)[_\-\s]?0?([1-5])$/i,
    /[_\-\s](0?[1-5])$/,
  ]

  for (const pattern of patterns) {
    const match = base.match(pattern)
    if (match) {
      const num = Number(match[1])
      if (num >= 1 && num <= STORE_SLOT_COUNT) return num
    }
  }

  return null
}

export function sortStoreImageFiles(files: File[]) {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
  )
}

export interface PlanSlotAssignmentsOptions {
  startSlot?: number
  /** 单槽替换：只使用第一张图填入指定槽位 */
  replaceInPlace?: boolean
  /** smart：按文件名对位；sequential：仅按排序依次填空槽 */
  fillMode?: 'smart' | 'sequential'
}

/**
 * 规划文件 → 槽位映射
 * - 文件名含 01~05 / 图1~5 时自动对位
 * - 其余按排序填入空槽
 */
export function planStoreScreenshotSlotAssignments(
  files: File[],
  occupiedSlots: Record<number, unknown>,
  options: PlanSlotAssignmentsOptions = {}
): Map<number, File> {
  const imageFiles = sortStoreImageFiles(filterStoreImageFiles(files))
  const result = new Map<number, File>()

  if (imageFiles.length === 0) return result

  if (options.replaceInPlace) {
    const slot = options.startSlot ?? 1
    if (slot >= 1 && slot <= STORE_SLOT_COUNT) {
      result.set(slot, imageFiles[0])
    }
    return result
  }

  const fillMode = options.fillMode ?? 'smart'
  const unassigned: File[] = []

  for (const file of imageFiles) {
    const slot = fillMode === 'smart' ? resolveSlotIndexFromFileName(file.name) : null
    if (slot && !result.has(slot)) {
      result.set(slot, file)
    } else {
      unassigned.push(file)
    }
  }

  let slot = options.startSlot ?? 1
  for (const file of unassigned) {
    while (slot <= STORE_SLOT_COUNT && (result.has(slot) || occupiedSlots[slot])) {
      slot += 1
    }
    if (slot > STORE_SLOT_COUNT) break
    result.set(slot, file)
    slot += 1
  }

  return result
}

export function describeSlotAssignments(assignments: Map<number, File>) {
  const named = [...assignments.entries()].filter(([, file]) =>
    resolveSlotIndexFromFileName(file.name) !== null
  ).length
  return { total: assignments.size, named }
}
