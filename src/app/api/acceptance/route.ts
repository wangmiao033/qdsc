import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/log'

export const maxDuration = 60

interface FileMeta {
  fileName: string
  fileWidth: number | null
  fileHeight: number | null
  fileFormat: string | null
  fileSize: number
}

interface AcceptanceResultItem {
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
}

function validateFile(
  file: FileMeta,
  tasks: Awaited<ReturnType<typeof db.taskItem.findMany>>,
  gameName: string,
): { result: AcceptanceResultItem; matchedTask: (typeof tasks)[0] | null; issues: { severity: string; message: string }[] } {
  const fileName = file.fileName.replace(/\.[^.]+$/, '')
  const { fileWidth, fileHeight, fileFormat, fileSize: fileSizeKB } = file

  let matchedTask: (typeof tasks)[0] | null = null
  let maxScore = 0

  for (const task of tasks) {
    let score = 0
    if (fileName.includes(task.specChannel)) score += 3
    if (fileName.includes(task.specName)) score += 3
    const dimStr = `${task.specWidth}x${task.specHeight}`
    if (fileName.includes(dimStr)) score += 5
    const ext = file.fileName.split('.').pop()?.toUpperCase()
    if (ext === task.specFormat || (ext === 'JPEG' && task.specFormat === 'JPG')) score += 1
    if (fileName.includes(gameName)) score += 1

    if (score > maxScore) {
      maxScore = score
      matchedTask = task
    }
  }

  const issues: { severity: string; message: string }[] = []

  if (matchedTask) {
    if (fileWidth && fileHeight) {
      if (fileWidth !== matchedTask.specWidth || fileHeight !== matchedTask.specHeight) {
        issues.push({ severity: 'critical', message: `尺寸错误: 实际 ${fileWidth}x${fileHeight}, 要求 ${matchedTask.specWidth}x${matchedTask.specHeight}` })
      }
    } else {
      issues.push({ severity: 'normal', message: '无法读取图片尺寸' })
    }

    if (fileFormat && fileFormat !== matchedTask.specFormat) {
      const isAcceptable = (matchedTask.specFormat === 'PNG' && fileFormat === 'JPG') ||
                           (matchedTask.specFormat === 'JPG' && fileFormat === 'PNG')
      if (isAcceptable) {
        issues.push({ severity: 'normal', message: `格式不推荐: 实际 ${fileFormat}, 要求 ${matchedTask.specFormat}` })
      } else {
        issues.push({ severity: 'critical', message: `格式错误: 实际 ${fileFormat}, 要求 ${matchedTask.specFormat}` })
      }
    }

    if (fileSizeKB > matchedTask.specMaxSize) {
      issues.push({ severity: 'normal', message: `文件过大: ${fileSizeKB}KB, 限制 ${matchedTask.specMaxSize}KB` })
    } else if (fileSizeKB > matchedTask.specMaxSize * 0.9) {
      issues.push({ severity: 'normal', message: `文件接近大小上限: ${fileSizeKB}KB, 限制 ${matchedTask.specMaxSize}KB` })
    }

    const expectedParts = [gameName, matchedTask.specChannel, matchedTask.specName, `${matchedTask.specWidth}x${matchedTask.specHeight}`]
    const missingParts = expectedParts.filter(p => !fileName.includes(p))
    if (missingParts.length > 0) {
      issues.push({ severity: 'ignore', message: `命名不规范: 缺少 ${missingParts.join(', ')}` })
    }
  } else {
    issues.push({ severity: 'ignore', message: '未匹配到任务项' })
  }

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

  return {
    result: {
      fileName: file.fileName,
      taskItemId: matchedTask?.id || '',
      specName: matchedTask?.specName || '未匹配',
      specChannel: matchedTask?.specChannel || '-',
      fileWidth,
      fileHeight,
      fileFormat,
      fileSize: fileSizeKB,
      severity: overallSeverity,
      message: issues.map(i => i.message).join('; '),
    },
    matchedTask,
    issues,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const batchId = body.batchId as string
    const files = body.files as FileMeta[]

    if (!batchId || !files?.length) {
      return NextResponse.json({ error: 'Missing batchId or files' }, { status: 400 })
    }

    const batch = await db.batch.findUnique({ where: { id: batchId } })
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    const tasks = await db.taskItem.findMany({ where: { batchId } })
    const results: AcceptanceResultItem[] = []

    for (const file of files) {
      const { result, matchedTask, issues } = validateFile(file, tasks, batch.gameName)
      results.push(result)

      if (matchedTask) {
        const hasCritical = issues.some(i => i.severity === 'critical')
        await db.taskItem.update({
          where: { id: matchedTask.id },
          data: { status: hasCritical ? '异常' : '已完成' },
        })
      }

      await db.acceptanceResult.create({
        data: {
          batchId,
          taskItemId: matchedTask?.id || '',
          fileName: file.fileName,
          fileWidth: file.fileWidth || 0,
          fileHeight: file.fileHeight || 0,
          fileFormat: file.fileFormat || '',
          fileSize: file.fileSize,
          severity: result.severity,
          message: result.message,
        },
      })
    }

    const completedTaskIds = results.filter(r => r.taskItemId).map(r => r.taskItemId)
    const missingRequired = tasks.filter(
      t => t.specIsRequired && !completedTaskIds.includes(t.id) && t.status === '待制作'
    )

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
  } catch (err) {
    console.error('[acceptance] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '验收处理失败' },
      { status: 500 },
    )
  }
}
