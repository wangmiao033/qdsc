import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/log'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const batchId = searchParams.get('batchId')

  if (!batchId) {
    return NextResponse.json({ error: 'Missing batchId' }, { status: 400 })
  }

  const tasks = await db.taskItem.findMany({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(tasks)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, status, remark } = body

  const data: Record<string, string> = {}
  if (status) data.status = status
  if (remark !== undefined) data.remark = remark

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Fetch task before update for logging
  const oldTask = await db.taskItem.findUnique({ where: { id } })
  if (!oldTask) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const task = await db.taskItem.update({
    where: { id },
    data,
  })

  // Log the change
  if (status) {
    await logActivity({
      batchId: oldTask.batchId,
      action: 'task_status',
      target: `${oldTask.specChannel} - ${oldTask.specName}`,
      detail: `状态变更: ${oldTask.status} → ${status}`,
      meta: { taskId: id, fromStatus: oldTask.status, toStatus: status, size: `${oldTask.specWidth}x${oldTask.specHeight}` },
    })
  }
  if (remark !== undefined) {
    await logActivity({
      batchId: oldTask.batchId,
      action: 'task_remark',
      target: `${oldTask.specChannel} - ${oldTask.specName}`,
      detail: remark ? `添加备注: ${remark}` : '清除备注',
      meta: { taskId: id, remark },
    })
  }

  return NextResponse.json(task)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { batchId, status, targetStatus } = body

  if (!batchId) {
    return NextResponse.json({ error: 'Missing batchId' }, { status: 400 })
  }

  const result = await db.taskItem.updateMany({
    where: { batchId, status },
    data: { status: targetStatus || '已完成' },
  })

  // Log batch status change
  await logActivity({
    batchId,
    action: 'task_batch',
    target: `${status} → ${targetStatus || '已完成'}`,
    detail: `批量状态变更: ${result.count} 个任务从「${status}」改为「${targetStatus || '已完成'}」`,
    meta: { fromStatus: status, toStatus: targetStatus || '已完成', count: result.count },
  })

  return NextResponse.json({ updated: result.count })
}

export async function DELETE(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Missing task id' }, { status: 400 })
  }

  const task = await db.taskItem.findUnique({ where: { id } })
  await db.taskItem.delete({ where: { id } })

  if (task) {
    await logActivity({
      batchId: task.batchId,
      action: 'task_delete',
      target: `${task.specChannel} - ${task.specName}`,
      detail: `删除任务: ${task.suggestedFileName} (${task.specWidth}x${task.specHeight})`,
      meta: { taskId: id },
    })
  }

  return NextResponse.json({ deleted: true })
}
