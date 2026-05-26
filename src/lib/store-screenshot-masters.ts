import {
  STORE_OUTPUT_SIZES,
  STORE_SCREENSHOT_MASTERS,
  type StoreOutputSize,
  type StoreScreenshotMaster,
} from '@/data/store-screenshot-spec'

function parseSize(key: string) {
  const [width, height] = key.split('x').map(Number)
  return { width, height }
}

export function getStoreMasterRatio(master: StoreScreenshotMaster) {
  const { width, height } = parseSize(master.master)
  return width / height
}

export function getStoreMasterByKey(masterKey: string) {
  return STORE_SCREENSHOT_MASTERS.find(group => group.master === masterKey) || STORE_SCREENSHOT_MASTERS[0]
}

export function getSizesForStoreMaster(master: StoreScreenshotMaster): StoreOutputSize[] {
  return master.sizes
    .map(key => STORE_OUTPUT_SIZES.find(size => size.key === key))
    .filter((size): size is StoreOutputSize => Boolean(size))
}

/**
 * 根据原图尺寸匹配 Store Screenshot 母版（4 套，与 Banner 无关）
 */
export function findBestStoreMasterForSource(width: number, height: number): StoreScreenshotMaster {
  const sourceKey = `${width}x${height}`

  const exactMaster = STORE_SCREENSHOT_MASTERS.find(group => group.master === sourceKey)
  if (exactMaster) return exactMaster

  const owner = STORE_SCREENSHOT_MASTERS.find(group => group.sizes.includes(sourceKey))
  if (owner) return owner

  if (width === 750 && height === 1350) return getStoreMasterByKey('750x1350')
  if (width === 480 && height === 835) return getStoreMasterByKey('750x1350')

  if (width === 640 && height === 960) return getStoreMasterByKey('640x960')

  const sourceRatio = width / height
  return STORE_SCREENSHOT_MASTERS.reduce((best, group) => {
    const bestDiff = Math.abs(sourceRatio - getStoreMasterRatio(best))
    const groupDiff = Math.abs(sourceRatio - getStoreMasterRatio(group))
    return groupDiff < bestDiff ? group : best
  }, STORE_SCREENSHOT_MASTERS[0])
}

export function formatStoreMasterLabel(master: StoreScreenshotMaster) {
  return `${master.master}｜${master.ratioLabel} ${master.label}`
}

/** ZIP 文件名 / 包内根目录：以母版命名 */
export function getStoreMasterZipBasename(master: StoreScreenshotMaster) {
  const ratio = master.ratioLabel.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '')
  const label = master.label.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '')
  return `${master.master}_${ratio}_${label}`
}
