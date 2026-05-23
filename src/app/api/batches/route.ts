import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logActivity } from '@/lib/log'

export async function GET() {
  const batches = await db.batch.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      tasks: true,
    },
  })
  return NextResponse.json(batches)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { gameName, batchName, channels, materialTypes } = body

  // Build where clause for specs
  const where: Record<string, unknown> = {}
  if (channels && channels.length > 0) {
    where.channel = { in: channels }
  }
  if (materialTypes && materialTypes.length > 0) {
    where.name = { in: materialTypes }
  }

  const specs = await db.materialSpec.findMany({ where })

  if (specs.length === 0) {
    return NextResponse.json({ error: '未找到匹配的素材规格' }, { status: 400 })
  }

  const batch = await db.batch.create({
    data: {
      gameName,
      batchName,
      tasks: {
        create: specs.map((spec, idx) => {
          const version = 'V1'
          const suggestedFileName = `${gameName}_${spec.channel}_${spec.name}_${spec.width}x${spec.height}_${version}_待制作.${spec.format.toLowerCase()}`
          return {
            specId: spec.id,
            specChannel: spec.channel,
            specName: spec.name,
            specWidth: spec.width,
            specHeight: spec.height,
            specFormat: spec.format,
            specMaxSize: spec.maxSize,
            specIsRequired: spec.isRequired,
            suggestedFileName,
            remark: '',
          }
        }),
      },
    },
    include: { tasks: true },
  })

  // Log batch creation
  const channelCount = [...new Set(specs.map(s => s.channel))].length
  const uniqueSizes = new Set(specs.map(s => `${s.width}x${s.height}`)).size
  await logActivity({
    batchId: batch.id,
    action: 'batch_create',
    target: `${gameName} - ${batchName}`,
    detail: `创建批次: ${specs.length} 个任务, ${channelCount} 个渠道, ${uniqueSizes} 个独立尺寸`,
    meta: { gameName, batchName, taskCount: specs.length, channelCount, uniqueSizes },
  })

  // Log individual task creation (summary only, not per task)
  await logActivity({
    batchId: batch.id,
    action: 'task_create',
    target: `${gameName} - ${batchName}`,
    detail: `批量生成 ${specs.length} 个制作任务`,
    meta: { gameName, batchName, taskCount: specs.length },
  })

  return NextResponse.json(batch)
}
