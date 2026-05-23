import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// 记录一条日志
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { batchId, action, target, detail, meta } = body

  const log = await db.activityLog.create({
    data: {
      batchId: batchId || null,
      action: action || 'unknown',
      target: target || '',
      detail: detail || '',
      meta: meta ? JSON.stringify(meta) : '',
    },
  })

  return NextResponse.json(log)
}

// 查询日志
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const batchId = searchParams.get('batchId')
  const action = searchParams.get('action')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  const where: Record<string, unknown> = {}
  if (batchId) where.batchId = batchId
  if (action) where.action = action

  const [logs, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.activityLog.count({ where }),
  ])

  return NextResponse.json({ logs, total })
}

// 清空日志
export async function DELETE(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const batchId = searchParams.get('batchId')

  if (batchId) {
    await db.activityLog.deleteMany({ where: { batchId } })
  } else {
    await db.activityLog.deleteMany()
  }

  return NextResponse.json({ deleted: true })
}
