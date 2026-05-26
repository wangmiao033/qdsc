export type AssetCategory = '图标' | '横幅' | '截图' | '启动页' | '其他'
export type CropTool = 'icon' | 'banner'

export function categorizeAssetSize(name: string, width: number, height: number): AssetCategory {
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

export function resolveCropTool(names: string[], width: number, height: number): CropTool {
  const categories = names.map(name => categorizeAssetSize(name, width, height))
  if (categories.some(category => category === '横幅')) return 'banner'
  if (categories.some(category => category === '启动页' || category === '截图')) return 'banner'
  if (categories.every(category => category === '图标')) return 'icon'
  if (width === height && Math.max(width, height) <= 512) return 'icon'
  return 'banner'
}

export function parseStoredOutputFormat(format?: string): 'jpg' | 'png' | 'webp' | null {
  if (!format) return null
  const normalized = format.toLowerCase()
  if (normalized === 'png') return 'png'
  if (normalized === 'webp') return 'webp'
  if (normalized === 'jpg' || normalized === 'jpeg') return 'jpg'
  return null
}
