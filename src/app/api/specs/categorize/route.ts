import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

interface AssetGroup {
  key: string
  name: string
  normalized: string
  width: number
  height: number
  format: string
  channels: string[]
  specIds: string[]
  isRequired: boolean
  totalSpecs: number
}

/** 标准化素材名称，用于归类 */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_\s]/g, '').replace(/图$/g, '')
}

export async function GET() {
  const all = await db.materialSpec.findMany({
    orderBy: [{ channel: 'asc' }, { name: 'asc' }],
  })

  // ========== 1. 按 (normalized_name + size + format) 分组 ==========
  const groups = new Map<string, AssetGroup>()

  for (const spec of all) {
    const norm = normalize(spec.name)
    const key = norm + '|' + spec.width + 'x' + spec.height + '|' + spec.format

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: spec.name,
        normalized: norm,
        width: spec.width,
        height: spec.height,
        format: spec.format,
        channels: [],
        specIds: [],
        isRequired: spec.isRequired,
        totalSpecs: 0,
      })
    }

    const group = groups.get(key)!
    if (!group.channels.includes(spec.channel)) {
      group.channels.push(spec.channel)
    }
    group.specIds.push(spec.id)
    if (spec.isRequired) group.isRequired = true
    group.totalSpecs++
  }

  const assetGroups = [...groups.values()].sort((a, b) => b.channels.length - a.channels.length)

  // ========== 2. 按素材类型归类（不含尺寸细分） ==========
  const typeGroups = new Map<string, {
    name: string
    normalized: string
    sizes: { w: number; h: number; format: string; channels: string[]; count: number }[]
    totalSpecs: number
    uniqueSizes: number
    totalChannels: number
  }>()

  for (const spec of all) {
    const norm = normalize(spec.name)
    if (!typeGroups.has(norm)) {
      typeGroups.set(norm, {
        name: spec.name,
        normalized: norm,
        sizes: [],
        totalSpecs: 0,
        uniqueSizes: 0,
        totalChannels: new Set<string>().size,
      })
    }
    const tg = typeGroups.get(norm)!
    tg.totalSpecs++

    // 找到该 size+format 组
    const sizeKey = spec.width + 'x' + spec.height + '|' + spec.format
    let sizeEntry = tg.sizes.find(s => s.w === spec.width && s.h === spec.height && s.format === spec.format)
    if (!sizeEntry) {
      sizeEntry = { w: spec.width, h: spec.height, format: spec.format, channels: [], count: 0 }
      tg.sizes.push(sizeEntry)
    }
    if (!sizeEntry.channels.includes(spec.channel)) {
      sizeEntry.channels.push(spec.channel)
    }
    sizeEntry.count++
  }

  // 计算每个类型组的汇总数据
  const materialTypes = [...typeGroups.values()].map(tg => {
    const allChannels = new Set<string>()
    for (const s of tg.sizes) {
      for (const c of s.channels) allChannels.add(c)
    }
    return {
      ...tg,
      uniqueSizes: tg.sizes.length,
      totalChannels: allChannels.size,
    }
  }).sort((a, b) => b.totalSpecs - a.totalSpecs)

  // ========== 3. 按共享尺寸归类 ==========
  const sizeGroups = new Map<string, {
    width: number
    height: number
    materialNames: string[]
    channels: string[]
    totalSpecs: number
  }>()

  for (const spec of all) {
    if (spec.width === 0 || spec.height === 0) continue
    const key = spec.width + 'x' + spec.height
    if (!sizeGroups.has(key)) {
      sizeGroups.set(key, {
        width: spec.width,
        height: spec.height,
        materialNames: [],
        channels: [],
        totalSpecs: 0,
      })
    }
    const sg = sizeGroups.get(key)!
    if (!sg.materialNames.includes(spec.name)) sg.materialNames.push(spec.name)
    if (!sg.channels.includes(spec.channel)) sg.channels.push(spec.channel)
    sg.totalSpecs++
  }

  const sharedSizes = [...sizeGroups.values()]
    .sort((a, b) => b.totalSpecs - a.totalSpecs)
    .filter(s => s.materialNames.length >= 2 || s.channels.length >= 5)

  // ========== 4. 工作量节省统计 ==========
  const totalSpecs = all.length
  const withDimensions = all.filter(s => s.width > 0 && s.height > 0).length
  const uniqueAssets = assetGroups.length
  const reusableAssets = assetGroups.filter(g => g.channels.length >= 2)
  const savedWork = totalSpecs - uniqueAssets
  const savedPercent = totalSpecs > 0 ? Math.round((savedWork / totalSpecs) * 100) : 0

  // 高优先级素材（多渠道共享 + 必做）
  const highPriority = assetGroups
    .filter(g => g.channels.length >= 3 && g.isRequired && g.width > 0)
    .slice(0, 30)

  return NextResponse.json({
    summary: {
      totalSpecs,
      withDimensions,
      uniqueAssets,
      reusableAssets: reusableAssets.length,
      savedWork,
      savedPercent,
      totalChannels: typeGroups.size,
    },
    materialTypes,        // 按素材类型分组
    sharedSizes,           // 按共享尺寸分组
    assetGroups: assetGroups.slice(0, 100), // 可复用资产（前100个）
    highPriority,          // 高优先级（必做 + 多渠道共享）
  })
}
