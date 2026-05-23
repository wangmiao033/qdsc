import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { logActivity } from '@/lib/log'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const files = formData.getAll('files') as File[]
  const batchId = formData.get('batchId') as string

  if (!batchId || !files.length) {
    return NextResponse.json({ error: 'Missing batchId or files' }, { status: 400 })
  }

  const batch = await db.batch.findUnique({ where: { id: batchId } })
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  const tasks = await db.taskItem.findMany({ where: { batchId } })

  // Build a map from suggestedFileName patterns to task items
  // Match by: channel + name + dimensions
  const results: {
    fileName: string
    taskItemId: string
    specName: string
    specChannel: string
    fileWidth: number | null
    fileHeight: number | null
    fileFormat: string | null
    fileSize: number | null
    severity: string
    message: string
  }[] = []

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())

    // Try to get image dimensions from the buffer
    let fileWidth: number | null = null
    let fileHeight: number | null = null
    let fileFormat: string | null = null
    const fileSizeKB = Math.round(buffer.length / 1024)

    // Detect format from magic bytes
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      fileFormat = 'PNG'
    } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      fileFormat = 'JPG'
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49) {
      fileFormat = 'GIF'
    } else if (buffer[0] === 0x52 && buffer[1] === 0x49) {
      fileFormat = 'WEBP'
    }

    // Parse PNG dimensions
    if (fileFormat === 'PNG' && buffer.length > 24) {
      fileWidth = buffer.readUInt32BE(16)
      fileHeight = buffer.readUInt32BE(20)
    }
    // Parse JPG dimensions
    if (fileFormat === 'JPG') {
      let offset = 2
      while (offset < buffer.length) {
        const marker = buffer.readUInt16BE(offset)
        offset += 2
        if (marker === 0xFFC0 || marker === 0xFFC2) {
          offset += 3 // skip marker, length, precision
          fileHeight = buffer.readUInt16BE(offset)
          fileWidth = buffer.readUInt16BE(offset + 2)
          break
        }
        const segLen = buffer.readUInt16BE(offset)
        offset += segLen
      }
    }
    // Parse GIF dimensions
    if (fileFormat === 'GIF' && buffer.length > 10) {
      fileWidth = buffer.readUInt16LE(6)
      fileHeight = buffer.readUInt16LE(8)
    }
    // Parse WEBP dimensions (VP8/VP8L)
    if (fileFormat === 'WEBP' && buffer.length > 30) {
      // Simple RIFF WEBP: check for VP8 or VP8L
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x4C) {
        // VP8L
        const bits = buffer.readUInt32LE(21)
        fileWidth = (bits & 0x3FFF) + 1
        fileHeight = ((bits >> 14) & 0x3FFF) + 1
      } else if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
        // VP8
        fileWidth = buffer.readUInt16LE(26) & 0x3FFF
        fileHeight = buffer.readUInt16LE(28) & 0x3FFF
      }
    }

    // Try to match with a task
    const fileName = file.name.replace(/\.[^.]+$/, '')
    let matchedTask: typeof tasks[0] | null = null
    let maxScore = 0

    for (const task of tasks) {
      let score = 0
      // Match by channel name in filename
      if (fileName.includes(task.specChannel)) score += 3
      // Match by material name
      if (fileName.includes(task.specName)) score += 3
      // Match by dimensions
      const dimStr = `${task.specWidth}x${task.specHeight}`
      if (fileName.includes(dimStr)) score += 5
      // Match by format
      const ext = file.name.split('.').pop()?.toUpperCase()
      if (ext === task.specFormat || (ext === 'JPEG' && task.specFormat === 'JPG')) score += 1
      // Match by game name
      if (fileName.includes(batch.gameName)) score += 1

      if (score > maxScore) {
        maxScore = score
        matchedTask = task
      }
    }

    // Evaluate issues
    const issues: { severity: string; message: string }[] = []

    if (matchedTask) {
      // Check dimensions
      if (fileWidth && fileHeight) {
        if (fileWidth !== matchedTask.specWidth || fileHeight !== matchedTask.specHeight) {
          issues.push({ severity: 'critical', message: `尺寸错误: 实际 ${fileWidth}x${fileHeight}, 要求 ${matchedTask.specWidth}x${matchedTask.specHeight}` })
        }
      } else {
        issues.push({ severity: 'normal', message: '无法读取图片尺寸' })
      }

      // Check format
      if (fileFormat && fileFormat !== matchedTask.specFormat) {
        const isAcceptable = (matchedTask.specFormat === 'PNG' && fileFormat === 'JPG') ||
                             (matchedTask.specFormat === 'JPG' && fileFormat === 'PNG')
        if (isAcceptable) {
          issues.push({ severity: 'normal', message: `格式不推荐: 实际 ${fileFormat}, 要求 ${matchedTask.specFormat}` })
        } else {
          issues.push({ severity: 'critical', message: `格式错误: 实际 ${fileFormat}, 要求 ${matchedTask.specFormat}` })
        }
      }

      // Check file size
      if (fileSizeKB > matchedTask.specMaxSize) {
        issues.push({ severity: 'normal', message: `文件过大: ${fileSizeKB}KB, 限制 ${matchedTask.specMaxSize}KB` })
      } else if (fileSizeKB > matchedTask.specMaxSize * 0.9) {
        issues.push({ severity: 'normal', message: `文件接近大小上限: ${fileSizeKB}KB, 限制 ${matchedTask.specMaxSize}KB` })
      }

      // Check naming
      const expectedParts = [batch.gameName, matchedTask.specChannel, matchedTask.specName, `${matchedTask.specWidth}x${matchedTask.specHeight}`]
      const missingParts = expectedParts.filter(p => !fileName.includes(p))
      if (missingParts.length > 0) {
        issues.push({ severity: 'ignore', message: `命名不规范: 缺少 ${missingParts.join(', ')}` })
      }
    } else {
      issues.push({ severity: 'ignore', message: '未匹配到任务项' })
    }

    // Determine overall severity
    let overallSeverity = ''
    for (const issue of issues) {
      if (issue.severity === 'critical') { overallSeverity = 'critical'; break }
      if (issue.severity === 'normal') overallSeverity = 'normal'
    }
    if (!overallSeverity && issues.length > 0) overallSeverity = 'ignore'
    if (issues.length === 0) {
      issues.push({ severity: 'ignore', message: '验收通过' })
      overallSeverity = 'ignore'
    }

    // Save acceptance result
    const result = {
      fileName: file.name,
      taskItemId: matchedTask?.id || '',
      specName: matchedTask?.specName || '未匹配',
      specChannel: matchedTask?.specChannel || '-',
      fileWidth,
      fileHeight,
      fileFormat,
      fileSize: fileSizeKB,
      severity: overallSeverity,
      message: issues.map(i => i.message).join('; '),
    }

    results.push(result)

    // Update task status if matched
    if (matchedTask) {
      const hasCritical = issues.some(i => i.severity === 'critical')
      await db.taskItem.update({
        where: { id: matchedTask.id },
        data: { status: hasCritical ? '异常' : '已完成' },
      })
    }

    // Save to DB
    await db.acceptanceResult.create({
      data: {
        batchId,
        taskItemId: matchedTask?.id || '',
        fileName: file.name,
        fileWidth: fileWidth || 0,
        fileHeight: fileHeight || 0,
        fileFormat: fileFormat || '',
        fileSize: fileSizeKB,
        severity: overallSeverity,
        message: issues.map(i => i.message).join('; '),
      },
    })
  }

  // Check for missing required items
  const completedTaskIds = results.filter(r => r.taskItemId).map(r => r.taskItemId)
  const missingRequired = tasks.filter(
    t => t.specIsRequired && !completedTaskIds.includes(t.id) && t.status === '待制作'
  )

  // Log acceptance
  const criticalCount = results.filter(r => r.severity === 'critical').length
  const normalCount = results.filter(r => r.severity === 'normal').length
  const passCount = results.filter(r => r.severity === 'ignore').length
  const matchedCount = results.filter(r => r.taskItemId).length
  await logActivity({
    batchId,
    action: 'acceptance',
    target: `${batch.gameName} - ${batch.batchName}`,
    detail: `素材验收: 上传 ${files.length} 个文件, 匹配 ${matchedCount} 个任务, 通过 ${passCount}, 警告 ${normalCount}, 严重 ${criticalCount}`,
    meta: { totalFiles: files.length, matched: matchedCount, pass: passCount, normal: normalCount, critical: criticalCount, missing: missingRequired.length },
  })

  return NextResponse.json({
    results,
    missingRequired: missingRequired.map(t => ({
      id: t.id,
      specChannel: t.specChannel,
      specName: t.specName,
      suggestedFileName: t.suggestedFileName,
    })),
    totalFiles: files.length,
    totalTasks: tasks.length,
  })
}
