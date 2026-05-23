import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// Fuzzy channel matching
function channelMatches(dbChannel: string, targetNames: string[]): boolean {
  for (const target of targetNames) {
    if (dbChannel === target) return true
    if (dbChannel.includes(target) || target.includes(dbChannel)) return true
  }
  return false
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const channelsParam = url.searchParams.get('channels')
  const batchId = url.searchParams.get('batchId')

  // Fetch all specs for the target channels
  const allSpecs = await db.materialSpec.findMany({
    select: {
      id: true,
      channel: true,
      name: true,
      width: true,
      height: true,
      format: true,
      isRequired: true,
      priority: true,
      maxSize: true,
    }
  })

  // Fuzzy channel matching
  let matchedDbChannels: Set<string> | null = null
  if (channelsParam) {
    const targetNames = channelsParam.split(',').map(c => c.trim()).filter(Boolean)
    const allDbChannels = [...new Set(allSpecs.map(s => s.channel))]
    matchedDbChannels = new Set<string>()
    for (const dbCh of allDbChannels) {
      if (channelMatches(dbCh, targetNames)) {
        matchedDbChannels.add(dbCh)
      }
    }
  }

  // Filter specs by matched channels
  const filteredSpecs = matchedDbChannels
    ? allSpecs.filter(s => matchedDbChannels!.has(s.channel))
    : allSpecs

  // Group specs by size key (width x height _ format)
  const sizeMap = new Map<string, {
    key: string
    width: number
    height: number
    format: string
    specs: Array<{
      id: string
      channel: string
      name: string
      isRequired: boolean
      priority: string
      maxSize: number
    }>
    channels: string[]
    names: string[]
    taskCount: number
    requiredCount: number
    highPriorityCount: number
    categories: string[]
  }>()

  // Categorize sizes by type
  const categorizeSize = (name: string, width: number, height: number): string => {
    const n = name.toLowerCase()
    if (n.includes('icon') || n.includes('图标') || n.includes('logo')) return '图标'
    if (n.includes('banner') || n.includes('横幅') || n.includes('焦点') || n.includes('推荐')) return '横幅'
    if (n.includes('screenshot') || n.includes('截图') || n.includes('预览')) return '截图'
    if (n.includes('splash') || n.includes('启动')) return '启动页'
    if (width === height && width <= 512) return '图标'
    if (width > height && width >= 1024) return '横幅'
    if (height > width && height >= 800) return '截图'
    return '其他'
  }

  for (const spec of filteredSpecs) {
    const key = `${spec.width}x${spec.height}_${spec.format}`
    if (!sizeMap.has(key)) {
      sizeMap.set(key, {
        key,
        width: spec.width,
        height: spec.height,
        format: spec.format,
        specs: [],
        channels: [],
        names: [],
        taskCount: 0,
        requiredCount: 0,
        highPriorityCount: 0,
        categories: [],
      })
    }
    const sg = sizeMap.get(key)!
    sg.specs.push({
      id: spec.id,
      channel: spec.channel,
      name: spec.name,
      isRequired: spec.isRequired,
      priority: spec.priority,
      maxSize: spec.maxSize,
    })
    if (!sg.channels.includes(spec.channel)) sg.channels.push(spec.channel)
    if (!sg.names.includes(spec.name)) sg.names.push(spec.name)
    if (!sg.categories.includes(categorizeSize(spec.name, spec.width, spec.height))) {
      sg.categories.push(categorizeSize(spec.name, spec.width, spec.height))
    }
    sg.taskCount++
    if (spec.isRequired) sg.requiredCount++
    if (spec.priority === '高') sg.highPriorityCount++
  }

  // Sort: shared sizes first (most channels), then by required count, then by area
  const sizeGroups = [...sizeMap.values()].sort((a, b) => {
    if (b.channels.length !== a.channels.length) return b.channels.length - a.channels.length
    if (b.requiredCount !== a.requiredCount) return b.requiredCount - a.requiredCount
    return (b.width * b.height) - (a.width * a.height)
  })

  // Group by dimension (same WxH, different format - e.g. 512x512 PNG and 512x512 JPG)
  const dimensionMap = new Map<string, {
    dimension: string
    width: number
    height: number
    formats: Array<{
      format: string
      key: string
      channelCount: number
      specCount: number
    }>
    totalChannels: string[]
    totalSpecCount: number
  }>()

  for (const sg of sizeGroups) {
    const dimKey = `${sg.width}x${sg.height}`
    if (!dimensionMap.has(dimKey)) {
      dimensionMap.set(dimKey, {
        dimension: dimKey,
        width: sg.width,
        height: sg.height,
        formats: [],
        totalChannels: [],
        totalSpecCount: 0,
      })
    }
    const dim = dimensionMap.get(dimKey)!
    dim.formats.push({
      format: sg.format,
      key: sg.key,
      channelCount: sg.channels.length,
      specCount: sg.taskCount,
    })
    for (const ch of sg.channels) {
      if (!dim.totalChannels.includes(ch)) dim.totalChannels.push(ch)
    }
    dim.totalSpecCount += sg.taskCount
  }

  const dimensionGroups = [...dimensionMap.values()].sort((a, b) => {
    if (b.totalChannels.length !== a.totalChannels.length) return b.totalChannels.length - a.totalChannels.length
    return (b.width * b.height) - (a.width * a.height)
  })

  // If batchId provided, also fetch task data to show production progress
  let taskProgress: Record<string, { total: number; completed: number; pending: number; inProgress: number }> = {}
  if (batchId) {
    const tasks = await db.taskItem.findMany({
      where: { batchId },
      select: {
        id: true,
        specWidth: true,
        specHeight: true,
        specFormat: true,
        status: true,
      },
    })
    for (const t of tasks) {
      const key = `${t.specWidth}x${t.specHeight}_${t.specFormat}`
      if (!taskProgress[key]) {
        taskProgress[key] = { total: 0, completed: 0, pending: 0, inProgress: 0 }
      }
      taskProgress[key].total++
      if (t.status === '已完成') taskProgress[key].completed++
      else if (t.status === '制作中') taskProgress[key].inProgress++
      else taskProgress[key].pending++
    }
  }

  // Summary stats
  const totalSpecs = filteredSpecs.length
  const totalChannels = [...new Set(filteredSpecs.map(s => s.channel))].length
  const sharedSizes = sizeGroups.filter(sg => sg.channels.length > 1).length
  const uniqueSizes = sizeGroups.filter(sg => sg.channels.length === 1).length
  const sharedSpecs = sizeGroups
    .filter(sg => sg.channels.length > 1)
    .reduce((sum, sg) => sum + sg.taskCount, 0)
  const workSavings = totalSpecs > 0 ? Math.round(((totalSpecs - sizeGroups.length) / totalSpecs) * 100) : 0

  return NextResponse.json({
    summary: {
      totalSpecs,
      totalChannels,
      totalSizes: sizeGroups.length,
      sharedSizes,
      uniqueSizes,
      sharedSpecs,
      workSavings,
    },
    sizeGroups,
    dimensionGroups,
    taskProgress,
  })
}

// POST: Batch complete/start/reset all tasks of a specific size
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { batchId, sizeKey, action } = body

  if (!batchId || !sizeKey) {
    return NextResponse.json({ error: 'Missing batchId or sizeKey' }, { status: 400 })
  }

  // Parse sizeKey: "512x512_PNG"
  const parts = sizeKey.split('_')
  const dimension = parts[0]
  const format = parts.slice(1).join('_')
  const [widthStr, heightStr] = dimension.split('x')
  const width = parseInt(widthStr)
  const height = parseInt(heightStr)

  if (isNaN(width) || isNaN(height)) {
    return NextResponse.json({ error: 'Invalid sizeKey format' }, { status: 400 })
  }

  if (action === 'complete') {
    const result = await db.taskItem.updateMany({
      where: {
        batchId,
        specWidth: width,
        specHeight: height,
        specFormat: format,
        status: { not: '已完成' },
      },
      data: { status: '已完成' },
    })
    return NextResponse.json({
      updated: result.count,
      message: `已完成 ${sizeKey} 的 ${result.count} 个任务`,
    })
  }

  if (action === 'start') {
    const result = await db.taskItem.updateMany({
      where: {
        batchId,
        specWidth: width,
        specHeight: height,
        specFormat: format,
        status: '待制作',
      },
      data: { status: '制作中' },
    })
    return NextResponse.json({
      updated: result.count,
      message: `已开始制作 ${sizeKey} 的 ${result.count} 个任务`,
    })
  }

  if (action === 'reset') {
    const result = await db.taskItem.updateMany({
      where: {
        batchId,
        specWidth: width,
        specHeight: height,
        specFormat: format,
      },
      data: { status: '待制作' },
    })
    return NextResponse.json({
      updated: result.count,
      message: `已重置 ${sizeKey} 的 ${result.count} 个任务`,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
