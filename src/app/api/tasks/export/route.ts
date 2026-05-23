import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const batchId = searchParams.get('batchId')
  const mode = searchParams.get('mode') || 'all' // 'all' | 'completed' | 'channel'

  if (!batchId) {
    return NextResponse.json({ error: 'Missing batchId' }, { status: 400 })
  }

  const batch = await db.batch.findUnique({ where: { id: batchId } })
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  const allTasks = await db.taskItem.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
  })

  const wb = XLSX.utils.book_new()

  if (mode === 'channel') {
    // 按渠道分组导出 - 每个渠道一个Sheet
    const channelGroups: Record<string, typeof allTasks> = {}
    for (const task of allTasks) {
      if (!channelGroups[task.specChannel]) {
        channelGroups[task.specChannel] = []
      }
      channelGroups[task.specChannel].push(task)
    }

    // Sort channels by task count descending
    const sortedChannels = Object.entries(channelGroups).sort(
      ([, a], [, b]) => b.length - a.length
    )

    for (const [channel, tasks] of sortedChannels) {
      const data = tasks.map((t, i) => ({
        '序号': i + 1,
        '素材名称': t.specName,
        '宽': t.specWidth,
        '高': t.specHeight,
        '格式': t.specFormat,
        '大小限制(KB)': t.specMaxSize,
        '是否必做': t.specIsRequired ? '是' : '否',
        '建议文件名': t.suggestedFileName,
        '状态': t.status,
        '备注': t.remark,
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      ws['!cols'] = [
        { wch: 6 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
        { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 50 }, { wch: 10 }, { wch: 20 },
      ]
      // Sheet name max 31 chars
      const sheetName = channel.substring(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    }

    // Summary sheet
    const summaryData = sortedChannels.map(([channel, tasks]) => {
      const completed = tasks.filter(t => t.status === '已完成').length
      const inProgress = tasks.filter(t => t.status === '制作中').length
      return {
        '渠道': channel,
        '总素材数': tasks.length,
        '已完成': completed,
        '制作中': inProgress,
        '待制作': tasks.length - completed - inProgress,
        '完成率': tasks.length > 0 ? `${Math.round((completed / tasks.length) * 100)}%` : '0%',
      }
    })
    const summaryWs = XLSX.utils.json_to_sheet(summaryData)
    summaryWs['!cols'] = [
      { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    ]
    XLSX.utils.book_append_sheet(wb, summaryWs, '总览')
  } else if (mode === 'completed') {
    // 仅导出已完成的任务
    const completedTasks = allTasks.filter(t => t.status === '已完成')
    const data = completedTasks.map((t, i) => ({
      '序号': i + 1,
      '渠道': t.specChannel,
      '素材名称': t.specName,
      '宽': t.specWidth,
      '高': t.specHeight,
      '格式': t.specFormat,
      '建议文件名': t.suggestedFileName,
      '备注': t.remark,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, { wch: 50 }, { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, '已完成素材')
  } else {
    // All tasks (original behavior)
    const data = allTasks.map((t, i) => ({
      '序号': i + 1,
      '渠道': t.specChannel,
      '素材名称': t.specName,
      '宽': t.specWidth,
      '高': t.specHeight,
      '格式': t.specFormat,
      '大小限制(KB)': t.specMaxSize,
      '是否必做': t.specIsRequired ? '是' : '否',
      '建议文件名': t.suggestedFileName,
      '状态': t.status,
      '备注': t.remark,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [
      { wch: 6 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 50 }, { wch: 10 }, { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, '任务清单')
  }

  const modeLabel = mode === 'channel' ? '按渠道交付' : mode === 'completed' ? '已完成' : '任务清单'
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${batch.gameName}_${batch.batchName}_${modeLabel}.xlsx"`,
    },
  })
}
