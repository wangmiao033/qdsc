import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/log'
import {
  buildBatchProgress,
  dimKey,
  getHistoricallyCoveredDims,
  loadBatchAcceptanceContext,
  type TaskItem,
} from '@/lib/acceptance'
import { db } from '@/lib/db'

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
  isNew: boolean
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
  previouslyCovered: Set<string>,
  sessionNewDims: Set<string>,
): { result: AcceptanceResultItem; matchedTasks: TaskItem[] } {
  const { fileWidth, fileHeight, fileFormat, fileSize: fileSizeKB } = file
  const matchedTasks = findMatchedTasks(file, tasks)
  const channels = [...new Set(matchedTasks.map(t => t.specChannel))]
  const primary = matchedTasks[0]
  const dim = fileWidth && fileHeight ? dimKey(fileWidth, fileHeight) : ''

  let severity = 'critical'
  let message = ''
  let isNew = false

  if (!fileWidth || !fileHeight) {
    message = '无法读取图片尺寸'
  } else if (matchedTasks.length === 0) {
    message = `尺寸 ${fileWidth}x${fileHeight} 不在本批次任务清单中`
  } else if (previouslyCovered.has(dim) || sessionNewDims.has(dim)) {
    severity = 'duplicate'
    message = previouslyCovered.has(dim)
      ? `尺寸 ${fileWidth}x${fileHeight} 此前已提交，无需重复补充`
      : `尺寸 ${fileWidth}x${fileHeight} 本次已提交，无需重复上传`
    isNew = false
  } else {
    severity = 'ignore'
    message = `尺寸匹配 ${fileWidth}x${fileHeight}，覆盖 ${matchedTasks.length} 项任务 / ${channels.length} 个渠道`
    isNew = true
  }

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
      severity,
      message,
      matchedTaskCount: matchedTasks.length,
      matchedChannels: channels,
      isNew,
    },
    matchedTasks,
  }
}

export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get('batchId')
    if (!batchId) {
      return NextResponse.json({ error: 'Missing batchId' }, { status: 400 })
    }

    const ctx = await loadBatchAcceptanceContext(batchId)
    if (!ctx) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    return NextResponse.json({
      batchProgress: ctx.batchProgress,
      batch: {
        id: ctx.batch.id,
        gameName: ctx.batch.gameName,
        batchName: ctx.batch.batchName,
      },
    })
  } catch (err) {
    console.error('[acceptance GET] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '获取验收进度失败' },
      { status: 500 },
    )
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

    const ctx = await loadBatchAcceptanceContext(batchId)
    if (!ctx) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    const { batch, tasks, acceptanceResults } = ctx
    const previouslyCovered = getHistoricallyCoveredDims(tasks, acceptanceResults)
    const sessionNewDims = new Set<string>()
    const newlyCoveredDims = new Set<string>()
    const results: AcceptanceResultItem[] = []

    for (const file of files) {
      const { result, matchedTasks } = validateFile(file, tasks, previouslyCovered, sessionNewDims)
      results.push(result)

      if (result.isNew && file.fileWidth && file.fileHeight) {
        const key = dimKey(file.fileWidth, file.fileHeight)
        sessionNewDims.add(key)
        newlyCoveredDims.add(key)
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

    for (const task of tasks) {
      if (newlyCoveredDims.has(dimKey(task.specWidth, task.specHeight))) {
        await db.taskItem.update({
          where: { id: task.id },
          data: { status: '已完成' },
        })
      }
    }

    const cumulativeCovered = new Set([...previouslyCovered, ...newlyCoveredDims])
    const updatedAcceptance = await db.acceptanceResult.findMany({
      where: { batchId },
      orderBy: { createdAt: 'desc' },
    })
    const batchProgress = buildBatchProgress(tasks, cumulativeCovered, updatedAcceptance)

    const sessionSummary = {
      passed: results.filter(r => r.isNew).length,
      duplicate: results.filter(r => r.severity === 'duplicate').length,
      failed: results.filter(r => r.severity === 'critical').length,
      total: results.length,
    }

    await logActivity({
      batchId,
      action: 'acceptance',
      target: `${batch.gameName} - ${batch.batchName}`,
      detail: `素材验收: 本次上传 ${files.length} 个, 新通过 ${sessionSummary.passed}, 重复 ${sessionSummary.duplicate}, 不符 ${sessionSummary.failed}, 累计 ${batchProgress.coveredSizes}/${batchProgress.requiredSizes} 个必做尺寸`,
      meta: {
        totalFiles: files.length,
        sessionPassed: sessionSummary.passed,
        sessionDuplicate: sessionSummary.duplicate,
        sessionFailed: sessionSummary.failed,
        coveredSizes: batchProgress.coveredSizes,
        requiredSizes: batchProgress.requiredSizes,
        missingSizes: batchProgress.missingSizes,
      },
    })

    return NextResponse.json({
      results,
      sessionSummary,
      batchProgress,
      missingRequired: batchProgress.missingList,
      sizeSummary: {
        requiredSizes: batchProgress.requiredSizes,
        coveredSizes: batchProgress.coveredSizes,
        missingSizes: batchProgress.missingSizes,
        uploadedSizes: sessionSummary.passed,
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
