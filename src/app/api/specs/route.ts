import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const channel = searchParams.get('channel') || ''
  const name = searchParams.get('name') || ''
  const priority = searchParams.get('priority') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const mode = searchParams.get('mode') || '' // mode=types: 按渠道获取素材类型
  const channelsParam = searchParams.get('channels') || '' // 逗号分隔的渠道列表

  const where: Record<string, unknown> = {}
  if (channel) where.channel = channel
  if (channelsParam) {
    const chList = channelsParam.split(',').filter(Boolean)
    if (chList.length > 0) where.channel = { in: chList }
  }
  if (name) where.name = { contains: name }
  if (priority) where.priority = priority

  // mode=types: 返回指定渠道下的素材类型统计
  if (mode === 'types') {
    const typeStats = await db.materialSpec.groupBy({
      by: ['name'],
      where: Object.keys(where).length > 0 ? where : undefined,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })
    const total = typeStats.reduce((sum, t) => sum + t._count.id, 0)
    return NextResponse.json({
      types: typeStats.map(t => ({ name: t.name, count: t._count.id })),
      total,
    })
  }

  // mode=count: 返回指定筛选条件下的总条数（不受分页限制）
  if (mode === 'count') {
    const total = await db.materialSpec.count({ where: Object.keys(where).length > 0 ? where : undefined })
    return NextResponse.json({ total })
  }

  const [items, total] = await Promise.all([
    db.materialSpec.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.materialSpec.count({ where }),
  ])

  // Get unique channels for filter
  const channels = await db.materialSpec.findMany({
    select: { channel: true },
    distinct: ['channel'],
    orderBy: { channel: 'asc' },
  })

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    channels: channels.map(c => c.channel),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const spec = await db.materialSpec.create({
    data: {
      channel: body.channel,
      name: body.name,
      width: parseInt(body.width) || 0,
      height: parseInt(body.height) || 0,
      format: body.format || 'PNG',
      maxSize: parseInt(body.maxSize) || 500,
      isRequired: body.isRequired !== false,
      copyLimit: body.copyLimit || '',
      forbidden: body.forbidden || '',
      remark: body.remark || '',
      priority: body.priority || '普通',
    },
  })
  return NextResponse.json(spec)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const spec = await db.materialSpec.update({
    where: { id: body.id },
    data: {
      channel: body.channel,
      name: body.name,
      width: parseInt(body.width) || 0,
      height: parseInt(body.height) || 0,
      format: body.format || 'PNG',
      maxSize: parseInt(body.maxSize) || 500,
      isRequired: body.isRequired !== false,
      copyLimit: body.copyLimit || '',
      forbidden: body.forbidden || '',
      remark: body.remark || '',
      priority: body.priority || '普通',
    },
  })
  return NextResponse.json(spec)
}

export async function DELETE(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await db.materialSpec.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
