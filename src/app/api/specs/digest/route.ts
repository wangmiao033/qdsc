import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// ========== Parsing Helpers ==========

function forwardFillMerges(sheet: XLSX.WorkSheet): string[][] {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const merges = sheet['!merges'] || []
  const matrix: string[][] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const val = sheet[addr]?.v
      row.push(val !== undefined && val !== null ? String(val).trim() : '')
    }
    matrix.push(row)
  }
  for (const merge of merges) {
    const sourceVal = matrix[merge.s.r]?.[merge.c] || ''
    if (sourceVal) {
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          if (!matrix[r]?.[c]) {
            if (!matrix[r]) matrix[r] = []
            matrix[r][c] = sourceVal
          }
        }
      }
    }
  }
  for (let c = 0; c < (range.e.c - range.s.c + 1); c++) {
    let lastVal = ''
    for (let r = 0; r < matrix.length; r++) {
      if (matrix[r]?.[c]) {
        lastVal = matrix[r][c]
      } else if (lastVal) {
        if (!matrix[r]) matrix[r] = []
        matrix[r][c] = lastVal
      }
    }
  }
  return matrix
}

function parseDimensions(dimStr: string): { width: number; height: number; rawSize: string } {
  if (!dimStr) return { width: 0, height: 0, rawSize: dimStr }
  const cleaned = dimStr.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').replace(/，/g, ',').replace(/\s+/g, '').trim()
  const match = cleaned.match(/(\d+)\s*[x×X*]\s*(\d+)/)
  if (match) {
    return { width: parseInt(match[1]), height: parseInt(match[2]), rawSize: dimStr }
  }
  const numMatch = cleaned.match(/^(\d+)$/)
  if (numMatch) {
    const size = parseInt(numMatch[1])
    return { width: size, height: size, rawSize: dimStr }
  }
  return { width: 0, height: 0, rawSize: dimStr }
}

function parseFileSize(sizeStr: string): number {
  if (!sizeStr) return 0
  const s = String(sizeStr).trim().toUpperCase()
  const mMatch = s.match(/([<≤]?\s*\.?\d+)\s*M/i)
  if (mMatch) return Math.round(parseFloat(mMatch[1].replace(/[<≤\s]/g, '')) * 1024)
  const kMatch = s.match(/([<≤]?\s*\.?\d+)\s*K/i)
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(/[<≤\s]/g, '')))
  const numMatch = s.match(/([<≤]?\s*\.?\d+)/)
  if (numMatch) return Math.round(parseFloat(numMatch[1].replace(/[<≤\s]/g, '')))
  return 0
}

function parseFormat(formatStr: string): string {
  if (!formatStr) return ''
  const s = String(formatStr).trim().toUpperCase()
  let cleaned = s.replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '').trim()
  cleaned = cleaned.replace(/[，、和或]/g, '/')
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/').map(p => p.trim()).filter(Boolean)
    const priority = ['PNG', 'JPEG', 'JPG', 'GIF', 'WEBP', 'SVG', 'MP4']
    for (const pf of priority) {
      if (parts.some(p => p.includes(pf))) return pf
    }
    return parts[0] || ''
  }
  const normalized = cleaned.replace(/[\s/]/g, '')
  if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'].includes(normalized)) return normalized
  if (normalized.startsWith('PNG')) return 'PNG'
  if (normalized.startsWith('JPG') || normalized.startsWith('JPEG')) return 'JPG'
  if (normalized.startsWith('GIF')) return 'GIF'
  return cleaned.length > 10 ? cleaned.substring(0, 10) : cleaned
}

function parsePriority(raw: string): { priority: string; isRequired: boolean } {
  if (!raw) return { priority: '普通', isRequired: true }
  const s = String(raw).trim()
  if (s.includes('一级')) return { priority: '高', isRequired: true }
  if (s.includes('二级')) return { priority: '普通', isRequired: false }
  if (s.includes('三级')) return { priority: '低', isRequired: false }
  if (s.includes('必做') || s.includes('必须')) return { priority: '高', isRequired: true }
  if (s.includes('选做') || s.includes('可选')) return { priority: '低', isRequired: false }
  return { priority: '普通', isRequired: true }
}

function cleanName(raw: string): string {
  if (!raw) return ''
  return raw.replace(/\n.*$/s, '').replace(/[（(][^）)]*[）)]/g, '').replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim()
}

function detectHeaderRow(matrix: string[][]): number {
  // Look for a row that has BOTH '优先级' and at least one of ['素材名称', '名称', '尺寸', '格式']
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const rowText = (matrix[r] || []).join('')
    const hasPriority = rowText.includes('优先级') || rowText.includes('级别')
    const hasAsset = rowText.includes('素材名称') || rowText.includes('尺寸') || rowText.includes('格式') || rowText.includes('名称')
    if (hasPriority && hasAsset) return r
  }
  // Fallback: look for any row with multiple asset-related keywords
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const rowText = (matrix[r] || []).join('')
    const kwCount = ['素材', '名称', '尺寸', '格式', '大小', '位置', '优先级', '备注'].filter(kw => rowText.includes(kw)).length
    if (kwCount >= 3) return r
  }
  return -1
}

function detectChannelName(sheets: string[], workbook: XLSX.WorkBook): string {
  // Try to detect channel name from sheet names or first cell content
  const firstSheet = workbook.Sheets[sheets[0]]
  if (!firstSheet) return '未命名渠道'
  const firstCell = firstSheet['A1']
  if (firstCell && typeof firstCell.v === 'string') {
    const val = firstCell.v.trim()
    const channelKeywords = ['雷电', '抖音', '快手', '微信', 'B站', 'bilibili', 'TapTap', '好游快爆', '小米', '华为', 'OPPO', 'vivo', '应用宝', '苹果', 'AppStore', 'UC', '百度', '今日头条', '微博', 'QQ', '网易', '4399', '三七互娱', 'taptap', '阅文']
    for (const kw of channelKeywords) {
      if (val.toLowerCase().includes(kw.toLowerCase())) return kw.trim()
    }
  }
  // Try from all cell content in the first sheet
  const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1')
  for (let r = 0; r <= Math.min(range.e.r, 5); r++) {
    for (let c = 0; c <= Math.min(range.e.c, 3); c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = firstSheet[addr]
      if (cell && typeof cell.v === 'string') {
        const channelKeywords = ['雷电', '抖音', '快手', '微信', 'B站', 'TapTap', '好游快爆', '小米', '华为', 'OPPO', 'vivo', '应用宝', 'UC', '百度', '微博', 'QQ', '网易', '4399', 'taptap']
        for (const kw of channelKeywords) {
          if (cell.v.includes(kw)) return kw.trim()
        }
      }
    }
  }
  return sheets[0] || '未命名渠道'
}

interface ParsedItem {
  scene: string
  location: string
  name: string
  width: number
  height: number
  format: string
  maxSize: number
  isRequired: boolean
  priority: string
  sizeText: string
  remark: string
  isNew: boolean
  matchedExisting: Array<{ channel: string; name: string; width: number; height: number }>
}

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string, existingSpecs: Array<{ channel: string; name: string; width: number; height: number }>): ParsedItem[] {
  const matrix = forwardFillMerges(sheet)
  if (matrix.length === 0) return []

  // Detect header row
  const headerRowIdx = detectHeaderRow(matrix)
  let startRow = 0
  let colMap: Record<string, number> = {}

  if (headerRowIdx >= 0) {
    startRow = headerRowIdx + 1
    const headerRow = matrix[headerRowIdx] || []
    // Build column mapping from header keywords
    for (let c = 0; c < headerRow.length; c++) {
      const h = String(headerRow[c] || '').trim()
      if (!h) continue
      // Priority must be first check (shortest match)
      if (h.includes('优先级') || h.includes('级别')) { colMap.priority = c; continue }
      // Location: 展示位置, 位置, 资源位, 展现位置
      if ((h.includes('位置') || h.includes('资源位') || h.includes('展现')) && !h.includes('大小')) { colMap.location = c; continue }
      // Name: 素材名称, 名称 (but NOT 优先级 which also contains 级)
      if ((h.includes('素材名称') || h === '名称' || h === '素材') && !h.includes('优先级')) { colMap.name = c; continue }
      // Size: 尺寸, 大小规格, 规格 (but NOT 大小限制 or 大小（KB以下）)
      if ((h.includes('尺寸') || h.includes('规格')) && !h.includes('限制') && !h.includes('以下') && !h.includes('KB')) { colMap.size = c; continue }
      // Format
      if (h.includes('格式')) { colMap.format = c; continue }
      // File size: 大小（KB以下）, 大小限制, 容量
      if (h.includes('大小') || h.includes('容量') || h.includes('KB')) { colMap.filesize = c; continue }
      // Required
      if (h.includes('必做') || h.includes('是否必')) { colMap.required = c; continue }
      // Remark: 备注, 注意, 要求和备注, 做图说明 (prefer the LAST remark column)
      if (h.includes('备注') || h.includes('说明')) { colMap.remark = c; continue }
    }

    // If no header detected well, use default column order
    if (Object.keys(colMap).length < 3) {
      colMap = { priority: 0, location: 1, name: 2, size: 3, format: 4, filesize: 5, remark: 6 }
    }
  } else {
    // No explicit header, try default column order
    colMap = { location: 0, name: 1, size: 2, format: 3, filesize: 4, remark: 5, priority: 6 }
  }

  const items: ParsedItem[] = []
  for (let r = startRow; r < matrix.length; r++) {
    const row = matrix[r]
    if (!row) continue

    const location = cleanName(String(row[colMap.location] || '').trim())
    const name = cleanName(String(row[colMap.name] || '').trim())
    const sizeStr = String(row[colMap.size] || '').trim()
    const formatStr = String(row[colMap.format] || '').trim()
    const fileSizeStr = String(row[colMap.filesize] || '').trim()
    const priorityStr = String(row[colMap.priority] || '').trim()
    const remarkStr = String(row[colMap.remark] || '').trim()
    const requiredStr = String(row[colMap.required] || '').trim()

    // Skip empty rows or header rows
    if (!location && !name && !sizeStr) continue
    if (['位置', '素材名称', '名称', '展示位置', '优先级'].includes(name) || ['展示位置', '优先级'].includes(location)) continue
    // Skip rows where the "name" is actually a section header (no size data)
    const preCheckDims = parseDimensions(sizeStr)
    if (!sizeStr && preCheckDims.width === 0 && preCheckDims.height === 0 && !formatStr) continue

    // Handle multiple sizes in one cell (split by newlines, semicolons, etc.)
    const sizeLines = sizeStr.split(/[\n;；|]/).map(s => s.trim()).filter(Boolean)
    if (sizeLines.length === 0) continue

    for (const singleSize of sizeLines) {
      const { width, height, rawSize } = parseDimensions(singleSize)
      if (width === 0 && height === 0) continue
      if (width > 10000 || height > 10000) continue
      // Skip items with no real name (continuation rows)
      if (!name.trim()) continue

      const format = parseFormat(formatStr) || (singleSize.toLowerCase().includes('mp4') ? 'MP4' : (singleSize.toLowerCase().includes('gif') ? 'GIF' : 'PNG'))
      const maxSize = parseFileSize(fileSizeStr)
      const { priority, isRequired } = parsePriority(priorityStr)
      const finalRequired = requiredStr ? (requiredStr === '是' || requiredStr.includes('必')) : isRequired
      const finalPriority = priorityStr ? priority : (name.includes('图标') || name.includes('开屏') ? '高' : priority)

      // Check if this size exists in DB
      const matched = existingSpecs.filter(s => s.width === width && s.height === height)
      const uniqueMatched = matched.filter((m, i, arr) =>
        arr.findIndex(a => a.channel === m.channel && a.name === m.name) === i
      ).slice(0, 5)

      items.push({
        scene: sheetName,
        location: location || name || '未分类',
        name: name || `素材_${width}x${height}`,
        width,
        height,
        format: format || 'PNG',
        maxSize: maxSize || 0,
        isRequired: finalRequired,
        priority: finalPriority,
        sizeText: singleSize || rawSize,
        remark: remarkStr,
        isNew: matched.length === 0,
        matchedExisting: uniqueMatched.map(m => ({ channel: m.channel, name: m.name, width: m.width, height: m.height })),
      })
    }
  }
  return items
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '未上传文件' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' })
  } catch {
    return NextResponse.json({ error: '无法解析文件，请确认为有效的 Excel 文件' }, { status: 400 })
  }

  const sheetsToProcess = workbook.SheetNames.filter(n => !n.match(/^Sheet\d+$/i) || workbook.SheetNames.length === 1)
  if (sheetsToProcess.length === 0) return NextResponse.json({ error: '未找到有效的工作表' }, { status: 400 })

  // Get all existing specs for cross-reference
  const existingSpecs = await db.materialSpec.findMany({
    select: { channel: true, name: true, width: true, height: true },
  })

  // Parse all sheets
  const allItems: ParsedItem[] = []
  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const items = parseSheet(sheet, sheetName, existingSpecs)
    allItems.push(...items)
  }

  if (allItems.length === 0) return NextResponse.json({ error: '未能从文件中解析到有效的素材规格' }, { status: 400 })

  // Build summary
  const uniqueAssets = new Set(allItems.map(i => i.name))
  const uniqueSizes = new Map<string, { width: number; height: number }>()
  for (const item of allItems) {
    const key = `${item.width}x${item.height}`
    if (!uniqueSizes.has(key)) uniqueSizes.set(key, { width: item.width, height: item.height })
  }

  const newSizesList: Array<{ width: number; height: number; usedBy: string[] }> = []
  const reusableSizesList: Array<{ width: number; height: number; existingChannels: string[]; usedBy: string[] }> = []

  for (const [key, size] of uniqueSizes) {
    const usedByItems = allItems.filter(i => i.width === size.width && i.height === size.height)
    const usedBy = [...new Set(usedByItems.map(i => i.name))].slice(0, 5)
    const existingChannels = [...new Set(
      existingSpecs
        .filter(s => s.width === size.width && s.height === size.height)
        .map(s => s.channel)
    )].slice(0, 5)

    if (existingChannels.length > 0) {
      reusableSizesList.push({ width: size.width, height: size.height, existingChannels, usedBy })
    } else {
      newSizesList.push({ width: size.width, height: size.height, usedBy })
    }
  }

  // Build action plan
  const actionPlan: Array<{ name: string; size: string; scenes: string[]; action: 'new' | 'resize' | 'reuse'; detail: string }> = []

  // Group items by name+size for action plan
  const groupMap = new Map<string, ParsedItem[]>()
  for (const item of allItems) {
    const key = `${item.name}_${item.width}x${item.height}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(item)
  }

  for (const [key, items] of groupMap) {
    const item = items[0]
    const scenes = [...new Set(items.map(i => i.scene))]
    const sizeStr = `${item.width}x${item.height}`

    if (!item.isNew) {
      const channels = [...new Set(item.matchedExisting.map(m => m.channel))]
      actionPlan.push({
        name: item.name,
        size: sizeStr,
        scenes,
        action: 'reuse',
        detail: `可直接复用 (已有 ${channels.length} 个渠道使用: ${channels.slice(0, 3).join(', ')}${channels.length > 3 ? '...' : ''})`,
      })
    } else {
      // Check if there's a close match for resizing
      let closeMatch: string | null = null
      for (const [existingKey, existingSize] of uniqueSizes) {
        if (existingKey === sizeStr) continue
        const ratioW = item.width / existingSize.width
        const ratioH = item.height / existingSize.height
        if (Math.abs(ratioW - ratioH) < 0.1 && ratioW > 0.8 && ratioW < 1.2) {
          closeMatch = `${existingSize.width}x${existingSize.height}`
          break
        }
      }
      if (closeMatch) {
        actionPlan.push({
          name: item.name,
          size: sizeStr,
          scenes,
          action: 'resize',
          detail: `可从 ${closeMatch} 等比缩放`,
        })
      } else {
        actionPlan.push({
          name: item.name,
          size: sizeStr,
          scenes,
          action: 'new',
          detail: `需新做 (${sizeStr} 为新尺寸)`,
        })
      }
    }
  }

  // Sort action plan: new first, then resize, then reuse
  const actionOrder = { new: 0, resize: 1, reuse: 2 }
  actionPlan.sort((a, b) => actionOrder[a.action] - actionOrder[b.action])

  const reusableCount = allItems.filter(i => !i.isNew).length
  const totalCount = allItems.length
  const savedPercent = totalCount > 0 ? Math.round((reusableCount / totalCount) * 100) : 0

  const channelName = detectChannelName(sheetsToProcess, workbook)
  const scenes = sheetsToProcess

  return NextResponse.json({
    summary: {
      totalItems: totalCount,
      uniqueAssets: uniqueAssets.size,
      uniqueSizes: uniqueSizes.size,
      newSizes: newSizesList.length,
      reusableSizes: reusableSizesList.length,
      scenes,
      channelName,
    },
    items: allItems,
    sizeAnalysis: {
      newSizes: newSizesList,
      reusableSizes: reusableSizesList,
    },
    actionPlan,
    savedPercent,
  })
}
