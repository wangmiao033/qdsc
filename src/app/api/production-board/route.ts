import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// Check if a DB channel name matches any of the target channel names (fuzzy matching)
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

  // Get all channels with their spec counts and types
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

  // Group by channel
  const channelMap = new Map<string, {
    channel: string
    specCount: number
    types: string[]
    requiredCount: number
    highPriorityCount: number
    specs: Array<{
      id: string
      name: string
      width: number
      height: number
      format: string
      isRequired: boolean
      priority: string
      maxSize: number
    }>
  }>()

  for (const spec of allSpecs) {
    if (!channelMap.has(spec.channel)) {
      channelMap.set(spec.channel, {
        channel: spec.channel,
        specCount: 0,
        types: [],
        requiredCount: 0,
        highPriorityCount: 0,
        specs: [],
      })
    }
    const ch = channelMap.get(spec.channel)!
    ch.specCount++
    if (!ch.types.includes(spec.name)) ch.types.push(spec.name)
    if (spec.isRequired) ch.requiredCount++
    if (spec.priority === '高') ch.highPriorityCount++
    ch.specs.push(spec)
  }

  // If channels filter provided, use fuzzy matching to find relevant DB channels
  let targetNames: string[] | null = null
  let matchedDbChannels: Set<string> | null = null
  if (channelsParam) {
    targetNames = channelsParam.split(',').map(c => c.trim()).filter(Boolean)
    matchedDbChannels = new Set<string>()
    for (const dbCh of channelMap.keys()) {
      if (channelMatches(dbCh, targetNames)) {
        matchedDbChannels.add(dbCh)
      }
    }
  }

  // Build size-based grouping for reuse analysis
  const sizeGroups = new Map<string, {
    key: string
    width: number
    height: number
    format: string
    channels: string[]
    names: string[]
    taskCount: number
    requiredCount: number
  }>()

  for (const spec of allSpecs) {
    if (matchedDbChannels && !matchedDbChannels.has(spec.channel)) continue
    const key = `${spec.width}x${spec.height}_${spec.format}`
    if (!sizeGroups.has(key)) {
      sizeGroups.set(key, {
        key,
        width: spec.width,
        height: spec.height,
        format: spec.format,
        channels: [],
        names: [],
        taskCount: 0,
        requiredCount: 0,
      })
    }
    const sg = sizeGroups.get(key)!
    if (!sg.channels.includes(spec.channel)) sg.channels.push(spec.channel)
    if (!sg.names.includes(spec.name)) sg.names.push(spec.name)
    sg.taskCount++
    if (spec.isRequired) sg.requiredCount++
  }

  // Sort size groups: shared sizes first (most channels), then by size
  const sizeGroupArray = [...sizeGroups.values()].sort((a, b) => {
    if (b.channels.length !== a.channels.length) return b.channels.length - a.channels.length
    if (b.requiredCount !== a.requiredCount) return b.requiredCount - a.requiredCount
    return (b.width * b.height) - (a.width * b.height)
  })

  // Build channel data
  const channelData = [...channelMap.values()]
    .filter(ch => !matchedDbChannels || matchedDbChannels.has(ch.channel))
    .sort((a, b) => b.specCount - a.specCount)

  // Stats
  const totalSpecs = channelData.reduce((sum, ch) => sum + ch.specCount, 0)
  const totalChannels = channelData.length
  const totalRequired = channelData.reduce((sum, ch) => sum + ch.requiredCount, 0)
  const totalSizes = sizeGroupArray.length
  const sharedSizes = sizeGroupArray.filter(sg => sg.channels.length > 1).length
  const uniqueSizes = sizeGroupArray.filter(sg => sg.channels.length === 1).length

  return NextResponse.json({
    summary: {
      totalSpecs,
      totalChannels,
      totalRequired,
      totalSizes,
      sharedSizes,
      uniqueSizes,
    },
    channels: channelData,
    sizeGroups: sizeGroupArray,
  })
}
