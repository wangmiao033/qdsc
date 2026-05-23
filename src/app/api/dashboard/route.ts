import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const batchId = searchParams.get('batchId')

  if (!batchId) {
    return NextResponse.json({ error: 'Missing batchId' }, { status: 400 })
  }

  const batch = await db.batch.findUnique({
    where: { id: batchId },
    include: { tasks: true },
  })

  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  const tasks = batch.tasks
  const total = tasks.length
  const completed = tasks.filter(t => t.status === '已完成').length
  const error = tasks.filter(t => t.status === '异常').length
  const pending = tasks.filter(t => t.status === '待制作').length
  const inProgress = tasks.filter(t => t.status === '制作中').length
  const missingRequired = tasks.filter(t => t.specIsRequired && t.status === '待制作').length

  // Group by channel
  const channelGroups: Record<string, { total: number; completed: number; error: number; pending: number; inProgress: number }> = {}
  for (const task of tasks) {
    const ch = task.specChannel
    if (!channelGroups[ch]) {
      channelGroups[ch] = { total: 0, completed: 0, error: 0, pending: 0, inProgress: 0 }
    }
    channelGroups[ch].total++
    if (task.status === '已完成') channelGroups[ch].completed++
    if (task.status === '异常') channelGroups[ch].error++
    if (task.status === '待制作') channelGroups[ch].pending++
    if (task.status === '制作中') channelGroups[ch].inProgress++
  }

  const acceptanceResults = await db.acceptanceResult.findMany({
    where: { batchId },
    orderBy: { createdAt: 'desc' },
  })

  // Auto-complete batch when all tasks are done
  if (total > 0 && completed === total && batch.status !== '已完成') {
    await db.batch.update({
      where: { id: batchId },
      data: { status: '已完成' },
    })
  }

  return NextResponse.json({
    batch: { id: batch.id, gameName: batch.gameName, batchName: batch.batchName, status: batch.status },
    stats: { total, completed, error, pending, inProgress, missingRequired },
    channelGroups,
    recentAcceptance: acceptanceResults.slice(0, 20),
  })
}
