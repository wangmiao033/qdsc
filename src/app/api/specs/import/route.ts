import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// ========== 智能解析函数 ==========

/** 前向填充合并单元格的空值 */
function forwardFillMerges(sheet: XLSX.WorkSheet): string[][] {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const merges = sheet['!merges'] || []

  // 构建单元格值矩阵
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

  // 对合并区域进行前向填充：只在列 A（渠道）和列 B（位置/名称）处理
  for (const merge of merges) {
    if (merge.c === 0 || merge.c === 1) {
      // 合并区域左上角的值填充到所有被合并的行
      const sourceVal = matrix[merge.s.r]?.[merge.c] || ''
      if (sourceVal) {
        for (let r = merge.s.r; r <= merge.e.r; r++) {
          if (!matrix[r]?.[merge.c]) {
            if (!matrix[r]) matrix[r] = []
            matrix[r][merge.c] = sourceVal
          }
        }
      }
    }
  }

  // 额外前向填充：对列 A 和列 B，如果某行该列为空，用上一个非空行的值填充
  for (const col of [0, 1]) {
    let lastVal = ''
    for (let r = 0; r < matrix.length; r++) {
      if (matrix[r]?.[col]) {
        lastVal = matrix[r][col]
      } else if (lastVal) {
        if (!matrix[r]) matrix[r] = []
        matrix[r][col] = lastVal
      }
    }
  }

  return matrix
}

/** 解析尺寸字符串，返回 [width, height] 和原始文本 */
function parseDimensions(dimStr: string): { width: number; height: number; rawSize: string } {
  if (!dimStr) return { width: 0, height: 0, rawSize: dimStr }

  const cleaned = dimStr.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '').replace(/，/g, ',').replace(/\s+/g, '').trim()

  // 匹配 WxH 或 W*H 格式
  const match = cleaned.match(/(\d+)\s*[x×X*]\s*(\d+)/)
  if (match) {
    return { width: parseInt(match[1]), height: parseInt(match[2]), rawSize: dimStr }
  }

  // 纯数字，可能是正方形图标
  const numMatch = cleaned.match(/^(\d+)$/)
  if (numMatch) {
    const size = parseInt(numMatch[1])
    return { width: size, height: size, rawSize: dimStr }
  }

  // 多个尺寸用逗号或换行分隔，取第一个
  const multiMatch = cleaned.match(/(\d+)\s*[x×X*]\s*(\d+)/)
  if (multiMatch) {
    return { width: parseInt(multiMatch[1]), height: parseInt(multiMatch[2]), rawSize: dimStr }
  }

  return { width: 0, height: 0, rawSize: dimStr }
}

/** 解析大小限制，统一转换为 KB */
function parseFileSize(sizeStr: string): number {
  if (!sizeStr) return 0 // 0 表示无限制

  const s = String(sizeStr).trim().toUpperCase()

  // 数值后跟单位
  const mMatch = s.match(/([<≤]?\s*\.?\d+)\s*M/i)
  if (mMatch) return Math.round(parseFloat(mMatch[1].replace(/[<≤\s]/g, '')) * 1024)

  const kMatch = s.match(/([<≤]?\s*\.?\d+)\s*K/i)
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(/[<≤\s]/g, '')))

  // 纯数字（可能默认是 KB）
  const numMatch = s.match(/([<≤]?\s*\.?\d+)/)
  if (numMatch) return Math.round(parseFloat(numMatch[1].replace(/[<≤\s]/g, '')))

  return 0
}

/** 标准化格式字符串 */
function parseFormat(formatStr: string): string {
  if (!formatStr) return ''
  const s = String(formatStr).trim().toUpperCase()

  // 去掉括号和方括号
  let cleaned = s.replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '').trim()

  // 将中文逗号和顿号统一为斜杠
  cleaned = cleaned.replace(/[，、和或]/g, '/')

  // 如果包含多种格式，取第一个主要格式
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/').map(p => p.trim()).filter(Boolean)
    // 优先返回 PNG > JPG > GIF
    const priority = ['PNG', 'JPEG', 'JPG', 'GIF', 'WEBP', 'SVG', 'MP4']
    for (const pf of priority) {
      if (parts.some(p => p.includes(pf))) return pf
    }
    return parts[0] || ''
  }

  const normalized = cleaned.replace(/[\s/]/g, '')
  if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'].includes(normalized)) return normalized
  if (normalized === 'JPNG') return 'PNG'
  if (normalized.startsWith('PNG')) return 'PNG'
  if (normalized.startsWith('JPG') || normalized.startsWith('JPEG')) return 'JPG'
  if (normalized.startsWith('GIF')) return 'GIF'

  return cleaned.length > 10 ? cleaned.substring(0, 10) : cleaned
}

/** 判断是否必做（根据素材名称中的关键词） */
function inferRequired(name: string, position: string): boolean {
  const requiredKeywords = ['图标', 'icon', 'ICON', 'Icon', '开屏', '闪屏', '五图', '截图', '首页']
  const combined = (name + ' ' + position).toLowerCase()
  return requiredKeywords.some(kw => combined.includes(kw.toLowerCase()))
}

/** 推断优先级 */
function inferPriority(name: string, position: string): string {
  const highKeywords = ['图标', 'icon', 'ICON', 'Icon', '开屏', '闪屏', '截图', '五图', '首页']
  const lowKeywords = ['角标', 'badge', '广告', '推荐', '小图', '配图']
  const combined = (name + ' ' + position)
  if (highKeywords.some(kw => combined.toLowerCase().includes(kw.toLowerCase()))) return '高'
  if (lowKeywords.some(kw => combined.toLowerCase().includes(kw.toLowerCase()))) return '低'
  return '普通'
}

/** 从备注中提取禁止事项 */
function extractForbidden(remark: string): string {
  if (!remark) return ''
  const forbiddenKeywords = ['禁止', '不允许', '不能', '不可', '不要', '违规']
  for (const kw of forbiddenKeywords) {
    if (remark.includes(kw)) {
      // 提取包含关键词的句子
      const sentences = remark.split(/[。；;，,\n]/)
      const found = sentences.find(s => s.includes(kw))
      if (found) return found.trim()
    }
  }
  return ''
}

/** 从备注中提取文案限制 */
function extractCopyLimit(remark: string): string {
  if (!remark) return ''
  const limitKeywords = ['字', '文案', '文字', '标题', '描述', '不超过']
  for (const kw of limitKeywords) {
    if (remark.includes(kw)) {
      const sentences = remark.split(/[。；;\n]/)
      const found = sentences.find(s => s.includes(kw) && !s.includes('禁止') && !s.includes('不能'))
      if (found) return found.trim()
    }
  }
  return ''
}

/** 清理渠道名称：去除换行、括号中的备注、特殊字符 */
function cleanChannel(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/\n.*$/s, '')  // 去掉换行后的所有内容（备注行）
    .replace(/[（(][^）)]*[）)]/g, '')  // 去掉括号内容
    .replace(/[\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 清理素材名称：去除换行、括号备注 */
function cleanName(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/\n.*$/s, '')  // 去掉换行后的备注
    .replace(/[（(][^）)]*[）)]/g, '')  // 去掉括号备注
    .replace(/[\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 清理格式列输入：如果不是标准格式，移到备注 */
function cleanFormatInput(raw: string): string {
  if (!raw) return ''
  const upper = raw.toUpperCase().trim()
  const validFormats = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'MP4', 'AVI', 'MOV']
  const cleaned = upper.replace(/[\s/，、和或【】\[\]]/g, '')
  // 检查是否包含有效格式关键词
  for (const vf of validFormats) {
    if (cleaned.includes(vf)) return raw.trim()
  }
  // 不包含有效格式关键词，返回空（内容将被归入备注）
  return ''
}

/** 清理备注：合并格式列中被移过来的内容 */
function cleanRemark(raw: string, formatStr: string): string {
  const parts = []
  if (formatStr) parts.push(formatStr)  // 如果格式列的内容被移到备注
  if (raw) parts.push(raw)
  return parts.join('；').trim()
}

// ========== 主导入逻辑 ==========

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const mode = formData.get('mode') as string || 'standard' // 'standard' or 'realdata'

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  if (mode === 'realdata') {
    return handleRealDataImport(workbook)
  }

  // 标准导入模式（原有逻辑）
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]

  let created = 0
  let errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const channel = String(row['渠道'] || row['channel'] || '').trim()
      const name = String(row['素材名称'] || row['name'] || '').trim()
      if (!channel || !name) {
        errors.push(`第 ${i + 2} 行: 渠道和素材名称不能为空`)
        continue
      }
      await db.materialSpec.create({
        data: {
          channel,
          name,
          width: parseInt(String(row['宽'] || row['width'] || '0')),
          height: parseInt(String(row['高'] || row['height'] || '0')),
          format: String(row['格式'] || row['format'] || 'PNG').toUpperCase().trim(),
          maxSize: parseInt(String(row['大小限制(KB)'] || row['maxSize'] || '500')),
          isRequired: String(row['是否必做'] || row['isRequired'] || '是').trim() === '是',
          copyLimit: String(row['文案限制'] || row['copyLimit'] || ''),
          forbidden: String(row['禁止事项'] || row['forbidden'] || ''),
          remark: String(row['备注'] || row['remark'] || ''),
          priority: String(row['优先级'] || row['priority'] || '普通').trim(),
        },
      })
      created++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`第 ${i + 2} 行: ${msg}`)
    }
  }

  return NextResponse.json({ created, errors, total: rows.length })
}

async function handleRealDataImport(workbook: XLSX.WorkBook) {
  let totalCreated = 0
  let totalSkipped = 0
  let totalErrors: string[] = []
  const sheetSummaries: { sheet: string; rows: number; created: number; skipped: number }[] = []

  // 处理 Sheet 1 和 Sheet 2
  const sheetsToProcess = workbook.SheetNames.filter(name => name !== 'Sheet3' && name !== 'Sheet4')

  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    // 获取 header 行来判断列结构
    const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0 })[0] as string[]
    if (!headerRow || headerRow.length === 0) {
      sheetSummaries.push({ sheet: sheetName, rows: 0, created: 0, skipped: 0 })
      continue
    }

    // 判断列映射
    // Sheet 1: [渠道, 位置, 尺寸, 格式, 大小, 备注]
    // Sheet 2: [渠道名, 名称, 尺寸, 格式, 大小, 版面注意事项]
    let channelCol = 0
    let nameCol = 1
    let dimCol = 2
    let formatCol = 3
    let sizeCol = 4
    let remarkCol = 5

    // 如果第一行不是"渠道"开头，可能是 Sheet 2（第一行直接是渠道名）
    const firstHeader = String(headerRow[0] || '').trim()
    const isSheet2 = firstHeader !== '渠道' && firstHeader !== '位置'

    // 用前向填充处理合并单元格
    const matrix = forwardFillMerges(sheet)

    // 确定数据起始行（跳过 header）
    const startRow = isSheet2 ? 0 : 1

    let sheetCreated = 0
    let sheetSkipped = 0

    for (let r = startRow; r < matrix.length; r++) {
      const row = matrix[r]
      if (!row) continue

      let channel = cleanChannel(String(row[channelCol] || '').trim())
      let name = cleanName(String(row[nameCol] || '').trim())
      const dimStr = String(row[dimCol] || '').trim()
      const formatStr = cleanFormatInput(String(row[formatCol] || '').trim())
      const sizeStr = String(row[sizeCol] || '').trim()
      const remarkStr = cleanRemark(String(row[remarkCol] || '').trim(), formatStr)

      // Sheet 2 特殊处理：第一行 header 就是数据
      if (isSheet2 && r === 0) {
        name = cleanName(String(row[nameCol] || '').trim())
        if (name === '名称') continue // 跳过纯 header 行
      }

      // 跳过空行
      if (!channel && !name && !dimStr) {
        sheetSkipped++
        continue
      }

      // 跳过 header 行（Sheet 1 中 "渠道" 行）
      if (channel === '渠道' || name === '位置' || channel === '阅文' && r === 0 && isSheet2) {
        sheetSkipped++
        continue
      }

      // 名称可能有合并或为空，尝试从位置列推断
      if (!name && dimStr) {
        name = '素材_' + dimStr.replace(/[^0-9x×X*]/g, '').substring(0, 10)
      }

      if (!channel) {
        sheetSkipped++
        continue
      }

      // 解析数据
      const { width, height, rawSize } = parseDimensions(dimStr)
      const format = parseFormat(formatStr)
      const maxSize = parseFileSize(sizeStr)
      const isRequired = inferRequired(name, '')
      const priority = inferPriority(name, '')
      const forbidden = extractForbidden(remarkStr)
      const copyLimit = extractCopyLimit(remarkStr)

      // 过滤异常数据
      if (width > 10000 || height > 10000) {
        sheetSkipped++
        continue
      }

      try {
        // 使用 upsert 避免重复（同一渠道+素材名称+尺寸视为同一条）
        const existing = await db.materialSpec.findFirst({
          where: {
            channel,
            name,
            width,
            height,
          },
        })

        if (existing) {
          // 更新已有记录
          await db.materialSpec.update({
            where: { id: existing.id },
            data: {
              format: format || existing.format,
              maxSize: maxSize || existing.maxSize,
              remark: remarkStr || existing.remark,
              forbidden: forbidden || existing.forbidden,
              copyLimit: copyLimit || existing.copyLimit,
            },
          })
          sheetSkipped++
        } else {
          await db.materialSpec.create({
            data: {
              channel,
              name,
              width,
              height,
              format: format || 'PNG',
              maxSize: maxSize || 0,
              isRequired,
              copyLimit,
              forbidden,
              remark: remarkStr,
              priority,
            },
          })
          sheetCreated++
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        totalErrors.push(`Sheet "${sheetName}" 第 ${r + 1} 行 [${channel}-${name}]: ${msg}`)
        sheetSkipped++
      }
    }

    sheetSummaries.push({
      sheet: sheetName,
      rows: matrix.length,
      created: sheetCreated,
      skipped: sheetSkipped,
    })
    totalCreated += sheetCreated
    totalSkipped += sheetSkipped
  }

  return NextResponse.json({
    created: totalCreated,
    skipped: totalSkipped,
    errors: totalErrors,
    totalErrors: totalErrors.length,
    sheets: sheetSummaries,
  })
}
