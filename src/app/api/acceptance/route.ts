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
  matchedTaskCount: number
  matchedChannels: string[]
}

type TaskItem = Awaited<ReturnType<typeof db.taskItem.findMany>>[number]

function dimKey(width: number, height: number) {
  return `${width}x${height}`
}

function findMatchedTasks(file: FileMeta, tasks: TaskItem[]): TaskItem[] {
  if (!file.fileWidth || !file.fileHeight) return []

  let matched = tasks.filter(
    t => t.specWidth === file.fileWidth && t.specHeight === file.fileHeight,
  )
  if (matched.length === 0) return []

  const fileName = file.fileName.replace(/\.[^.]+$/, '')

  const channelMatches = matched.filter(t => fileName.includes(t.specChannel))
  if (channelMatches.length > 0) matched = channelMatches

  const nameMatches = matched.filter(t => fileName.includes(t.specName))
  if (nameMatches.length > 0) matched = nameMatches

  return matched
}

function validateFile(
  file: FileMeta,
  tasks: TaskItem[],
): { result: AcceptanceResultItem; matchedTasks: TaskItem[]; issues: { severity: string; message: string }[] } {
  const { fileWidth, fileHeight, fileFormat, fileSize: fileSizeKB } = file
  const matchedTasks = findMatchedTasks(file, tasks)
  const issues: { severity: string; message: string }[] = []

  if (!fileWidth || !fileHeight) {
    issues.push({ severity: 'critical', message: '无法读取图片尺寸' })
  } else if (matchedTasks.length === 0) {
    issues.push({
      severity: 'critical',
      message: `尺寸 ${fileWidth}x${fileHeight} 不在本批次任务清单中`,
    })
  } else {
    const channels = [...new Set(matchedTasks.map(t => t.specChannel))]
    issues.push({
      severity: 'ignore',
      message: `尺寸匹配 ${fileWidth}x${fileHeight}，覆盖 ${matchedTasks.length} 项任务 / ${channels.length} 个渠道`,
    })
  }

  let overallSeverity = ''
  for (const issue of issues) {
    if (issue.severity === 'critical') { overallSeverity = 'critical'; break }
    if (issue.severity === 'normal') overallSeverity = 'normal'
  }
  if (!overallSeverity && issues.length > 0) overallSeverity = 'ignore'

  const channels = [...new Set(matchedTasks.map(t => t.specChannel))]
  const primary = matchedTasks[0]

  return {
    result: {
      fileName: file.fileName,
      taskItemId: primary?.id || '',
      specName: primary?.specName || (matchedTasks.length > 0 ? '多素材类型' : '未匹配'),
      specChannel: channels.length === 0
        ? '-'
        : channels.length === 1
          ? channels[0]
          : `${channels.slice(0, 3).join('、')}${channels.length > 3 ? ` 等${channels.length}个渠道` : ''}`,
      fileWidth,
      fileHeight,
      fileFormat,
      fileSize: fileSizeKB,
      severity: overallSeverity,
      message: issues.map(i => i.message).join('; '),
      matchedTaskCount: matchedTasks.length,
      matchedChannels: channels,
    },
    matchedTasks,
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
    const satisfiedDims = new Set<string>()

    for (const file of files) {
      const { result, matchedTasks } = validateFile(file, tasks)
      results.push(result)

      if (result.severity === 'ignore' && file.fileWidth && file.fileHeight) {
        satisfiedDims.add(dimKey(file.fileWidth, file.fileHeight))
      }

      await db.acceptanceResult.create({
        data: {
          batchId,
          taskItemId: matchedTasks[0]?.id || '',
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

    // 一张同尺寸素材覆盖批次内所有同尺寸任务
    for (const task of tasks) {
      if (satisfiedDims.has(dimKey(task.specWidth, task.specHeight))) {
        await db.taskItem.update({
          where: { id: task.id },
          data: { status: '已完成' },
        })
      }
    }

    const requiredDimKeys = new Set(
      tasks.filter(t => t.specIsRequired).map(t => dimKey(t.specWidth, t.specHeight)),
    )
    const coveredDimKeys = new Set([...satisfiedDims].filter(k => requiredDimKeys.has(k)))
    const missingDimKeys = [...requiredDimKeys].filter(k => !satisfiedDims.has(k))

    const missingByDim = new Map<string, TaskItem[]>()
    for (const t of tasks.filter(t => t.specIsRequired && missingDimKeys.includes(dimKey(t.specWidth, t.specHeight)))) {
      const key = dimKey(t.specWidth, t.specHeight)
      if (!missingByDim.has(key)) missingByDim.set(key, [])
      missingByDim.get(key)!.push(t)
    }

    const missingRequired = [...missingByDim.entries()].map(([, items]) => {
      const t = items[0]
      const channels = [...new Set(items.map(i => i.specChannel))]
      return {
        id: t.id,
        specChannel: channels.length === 1 ? channels[0] : `${channels.slice(0, 3).join('、')} 等${channels.length}个渠道`,
        specName: t.specName,
        suggestedFileName: `${t.specWidth}x${t.specHeight}.${t.specFormat.toLowerCase()}`,
        size: dimKey(t.specWidth, t.specHeight),
        channelCount: channels.length,
        taskCount: items.length,
      }
    })

    const criticalCount = results.filter(r => r.severity === 'critical').length
    const passCount = results.filter(r => r.severity === 'ignore').length
    const matchedCount = results.filter(r => r.matchedTaskCount > 0).length

    await logActivity({
      batchId,
      action: 'acceptance',
      target: `${batch.gameName} - ${batch.batchName}`,
      detail: `素材验收: 上传 ${files.length} 个文件, 尺寸匹配 ${matchedCount}, 通过 ${passCount}, 尺寸不符 ${criticalCount}, 覆盖 ${coveredDimKeys.size}/${requiredDimKeys.size} 个必做尺寸`,
      meta: {
        totalFiles: files.length,
        matched: matchedCount,
        pass: passCount,
        critical: criticalCount,
        coveredSizes: coveredDimKeys.size,
        requiredSizes: requiredDimKeys.size,
        missingSizes: missingDimKeys.length,
      },
    })

    return NextResponse.json({
      results,
      missingRequired,
      sizeSummary: {
        requiredSizes: requiredDimKeys.size,
        coveredSizes: coveredDimKeys.size,
        uploadedSizes: satisfiedDims.size,
        missingSizes: missingRequired.map(m => ({
          size: m.size,
          channelCount: m.channelCount,
          taskCount: m.taskCount,
          channels: m.specChannel,
        })),
      },
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
