import masterGroupsJson from '@/data/banner-master-groups.json'

export interface MasterGroup {
  id: string
  code: string
  label: string
  master: string
  ratioLabel: string
  usage: string
  masterFileName: string
  description: string
  sizes: string[]
}

export const MASTER_GROUPS = masterGroupsJson as MasterGroup[]

export function parseSize(label: string) {
  const [width, height] = label.split('x').map(Number)
  return { width, height }
}

export function getMasterRatio(group: MasterGroup) {
  const master = parseSize(group.master)
  return master.width / master.height
}

export function getMasterGroupById(id: string) {
  return MASTER_GROUPS.find(group => group.id === id) || MASTER_GROUPS[0]
}

export function matchMasterGroupByRatio(width: number, height: number): MasterGroup | null {
  if (width === 750 && height === 1252) return getMasterGroupById('750x1252')
  if (width === 280 && height === 1403) return getMasterGroupById('280x1403')
  if (width === 1080 && height === 2400) return getMasterGroupById('1080x2400')

  const ratio = width / height
  if (ratio < 0.50) return getMasterGroupById('1080x2400')
  if (ratio >= 0.50 && ratio < 0.62) return getMasterGroupById('1080x1920')
  if (ratio >= 0.62 && ratio < 0.72) return getMasterGroupById('1080x1600')
  if (ratio >= 0.72 && ratio < 0.86) return getMasterGroupById('1080x1440')
  if (ratio >= 0.86 && ratio < 0.95) return getMasterGroupById('1080x1200')
  if (ratio >= 0.95 && ratio <= 1.08) return getMasterGroupById('1024x1024')
  if (ratio > 1.08 && ratio < 1.25) return getMasterGroupById('1080x1200')
  if (ratio >= 1.25 && ratio < 1.45) return getMasterGroupById('1200x900')
  if (ratio >= 1.45 && ratio < 1.60) return getMasterGroupById('1500x1000')
  if (ratio >= 1.60 && ratio < 1.90) return getMasterGroupById('1920x1080')
  if (ratio >= 1.90 && ratio < 2.20) return getMasterGroupById('2000x1000')
  if (ratio >= 2.20 && ratio < 2.55) return getMasterGroupById('2400x1000')
  if (ratio >= 2.55 && ratio < 3.25) return getMasterGroupById('1920x640')
  if (ratio >= 3.25 && ratio < 4.20) return getMasterGroupById('1920x500')
  if (ratio >= 4.20) return getMasterGroupById('1920x320')
  return null
}

export function findMasterGroupForTargetSize(width: number, height: number) {
  const sizeKey = `${width}x${height}`
  const owner = MASTER_GROUPS.find(group => group.sizes.includes(sizeKey))
  if (owner) return owner

  const exactMaster = MASTER_GROUPS.find(group => group.master === sizeKey)
  if (exactMaster) return exactMaster

  const ratioMatch = matchMasterGroupByRatio(width, height)
  if (ratioMatch) return ratioMatch

  return MASTER_GROUPS.reduce((best, group) => {
    const targetRatio = width / height
    const bestDiff = Math.abs(targetRatio - getMasterRatio(best))
    const groupDiff = Math.abs(targetRatio - getMasterRatio(group))
    return groupDiff < bestDiff ? group : best
  }, MASTER_GROUPS[0])
}

export function findBestMasterGroupForSource(width: number, height: number) {
  const sourceKey = `${width}x${height}`
  const exactMaster = MASTER_GROUPS.find(group => group.master === sourceKey)
  if (exactMaster) return exactMaster

  const owner = MASTER_GROUPS.find(group => group.sizes.includes(sourceKey))
  if (owner) return owner

  const ratioMatch = matchMasterGroupByRatio(width, height)
  if (ratioMatch) return ratioMatch

  const sourceRatio = width / height
  return MASTER_GROUPS.reduce((best, group) => {
    const bestDiff = Math.abs(sourceRatio - getMasterRatio(best))
    const groupDiff = Math.abs(sourceRatio - getMasterRatio(group))
    return groupDiff < bestDiff ? group : best
  }, MASTER_GROUPS[0])
}

export function getAllMasterSizeKeys() {
  return Array.from(new Set(MASTER_GROUPS.flatMap(group => [group.master, ...group.sizes])))
}
