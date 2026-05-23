import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const channelName = (body.channelName || '').trim()
    const items = body.items || []

    if (!channelName) return NextResponse.json({ error: '请提供渠道名称' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: '无有效素材数据' }, { status: 400 })

    let created = 0
    let skipped = 0

    for (const item of items) {
      if (!item.name || !item.width || !item.height) {
        skipped++
        continue
      }
      try {
        const existing = await db.materialSpec.findFirst({
          where: {
            channel: channelName,
            name: item.name,
            width: item.width,
            height: item.height,
          },
        })
        if (existing) {
          skipped++
          continue
        }
        await db.materialSpec.create({
          data: {
            channel: channelName,
            name: item.name,
            width: item.width,
            height: item.height,
            format: item.format || 'PNG',
            maxSize: item.maxSize || 0,
            isRequired: item.isRequired !== false,
            remark: item.remark || '',
            priority: item.priority || '普通',
            copyLimit: '',
            forbidden: '',
          },
        })
        created++
      } catch {
        skipped++
      }
    }

    return NextResponse.json({
      created,
      skipped,
      total: items.length,
      channelName,
    })
  } catch {
    return NextResponse.json({ error: '导入失败' }, { status: 500 })
  }
}
