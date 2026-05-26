import {
  findBestMasterGroupForSource,
  findMasterGroupForTargetSize,
  getAllMasterSizeKeys,
  type MasterGroup,
} from '@/lib/banner-master-groups'

export type OutputFormat = 'jpg' | 'png' | 'webp'
export type CropMode = 'cover' | 'contain'
export type FocalPoint = 'center' | 'top' | 'bottom' | 'left' | 'right'

export interface BannerSource {
  id: string
  file: File
  name: string
  baseName: string
  width: number
  height: number
  size: number
  previewUrl: string
}

export interface BannerSize {
  key: string
  width: number
  height: number
  label: string
}

export interface BannerOutput {
  id: string
  sourceId: string
  sourceBaseName: string
  masterGroup: string
  name: string
  path: string
  width: number
  height: number
  blob: Blob
  url: string
}

export interface BannerCropSettings {
  cropMode: CropMode
  focalPoint: FocalPoint
  outputFormat: OutputFormat
  quality: number
  backgroundColor: string
}

export interface BannerGenerationPlan {
  source: BannerSource
  group: MasterGroup
  sizes: BannerSize[]
}

const RAW_BANNER_SIZE_PRESETS = [
  '152x103', '166x185', '175x175', '222x254', '224x120', '238x165', '240x360',
  '256x150', '256x320', '270x310', '274x155', '278x372', '280x140', '280x168',
  '280x190', '280x197', '280x372', '280x380', '285x197', '295x125', '300x150',
  '300x151', '320x260', '320x480', '338x172', '348x238', '360x640', '369x209',
  '370x230', '376x166', '380x180', '386x270', '386x272', '450x270', '450x450',
  '477x270', '480x360', '496x292', '500x250', '538x230', '540x477', '540x756',
  '544x306', '560x480', '570x320', '580x834', '600x295', '600x300', '600x335',
  '600x336', '600x404', '600x450', '600x576', '640x360', '640x400', '640x640',
  '648x316', '650x422', '655x320', '656x242', '656x320', '656x344', '660x280',
  '660x320', '660x330', '660x370', '660x485', '670x546', '672x378', '673x265',
  '678x380', '680x300', '680x576', '686x842', '688x536', '690x308', '690x345',
  '690x375', '690x760', '700x360', '706x278', '710x180', '710x320', '720x300',
  '720x320', '720x350', '720x380', '720x400', '720x405', '720x406', '720x407',
  '720x500', '720x890', '720x1280', '720x1300', '720x1440', '730x370',
  '740x370', '750x240', '750x250', '750x262', '750x280', '750x300', '750x310',
  '750x320', '750x326', '750x422', '750x490', '750x540', '750x640', '750x750',
  '750x920', '750x1252', '750x1280', '750x1334', '750x1350', '800x300',
  '800x332', '800x450', '800x467', '800x480', '800x567', '800x800', '834x1236',
  '860x450', '875x275', '880x1200', '900x240', '900x402', '900x500',
  '900x502', '900x640', '900x1200', '906x632', '940x400', '948x534',
  '950x530', '960x480', '960x540', '960x720', '970x340', '978x549',
  '978x708', '980x600', '984x381', '984x480', '984x984', '990x557',
  '1000x260', '1000x650', '1008x300', '1008x372', '1008x567', '1008x960',
  '1008x1200', '1016x612', '1020x510', '1020x573', '1022x464', '1022x496',
  '1024x400', '1024x500', '1024x1024', '1080x417', '1080x480', '1080x530',
  '1080x598', '1080x608', '1080x660', '1080x750', '1080x1080', '1080x1140',
  '1080x1560', '1080x1672', '1080x1800', '1080x1920', '1080x2160',
  '1080x2333', '1080x2400', '1125x2076', '1200x300', '1200x380',
  '1200x400', '1200x466', '1200x900', '1260x400', '1280x560', '1280x720',
  '1440x450', '1817x738', '1920x270', '1920x320', '1920x400', '1920x433',
  '1920x452', '1920x500', '1920x542', '1920x600', '1920x640', '1920x680',
  '1920x756', '1920x814', '1920x909', '1920x1070', '1920x1080',
  '2000x1000', '2200x800', '2400x1000',
]

export const BANNER_SIZE_PRESETS: BannerSize[] = Array.from(new Set([
  ...RAW_BANNER_SIZE_PRESETS,
  ...getAllMasterSizeKeys(),
]))
  .map(label => {
    const [width, height] = label.split('x').map(Number)
    return { key: label, width, height, label }
  })
  .sort((a, b) => a.width - b.width || a.height - b.height)

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function getBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'banner'
}

function sortSizeLabel(a: string, b: string) {
  const [aw, ah] = a.split('x').map(Number)
  const [bw, bh] = b.split('x').map(Number)
  return aw - bw || ah - bh
}

export function buildBannerZipFileName(outputs: BannerOutput[], options?: { flatPack?: boolean }) {
  if (outputs.length === 0) return 'banner_crop_batch.zip'

  const uniqueSizes = [...new Set(outputs.map(output => `${output.width}x${output.height}`))]
    .sort(sortSizeLabel)
  const uniqueSources = [...new Set(outputs.map(output => output.sourceBaseName))]
  const isFlatPack = options?.flatPack ?? outputs.every(output => !output.path.includes('/'))

  if (isFlatPack) {
    if (uniqueSources.length > 1) {
      return `banner_crop_${outputs.length}files_${uniqueSizes.length}sizes.zip`
    }
    return `banner_crop_${outputs.length}files.zip`
  }

  const prefix = uniqueSources.length === 1
    ? sanitizeName(uniqueSources[0])
    : `banner_batch_${uniqueSources.length}src`
  const masterMatch = outputs[0]?.masterGroup.match(/\d+x\d+/)
  const masterTag = masterMatch?.[0]

  let sizeTag: string
  if (uniqueSizes.length <= 5) {
    sizeTag = uniqueSizes.join('+')
  } else if (masterTag) {
    sizeTag = `${masterTag}_${uniqueSizes.length}sizes`
  } else {
    sizeTag = `${uniqueSizes[0]}_to_${uniqueSizes[uniqueSizes.length - 1]}_${uniqueSizes.length}sizes`
  }

  let fileName = `${prefix}_${sizeTag}_${outputs.length}files.zip`
  if (fileName.length > 220) {
    fileName = `${prefix}_${uniqueSizes.length}sizes_${outputs.length}files.zip`
  }
  return fileName
}

function getMimeType(format: OutputFormat) {
  if (format === 'png') return 'image/png'
  if (format === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function getExtension(format: OutputFormat) {
  return format === 'jpg' ? 'jpg' : format
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('图片编码失败'))
    }, mimeType, quality)
  })
}

function getFocalRatio(point: FocalPoint) {
  if (point === 'top' || point === 'left') return 0
  if (point === 'bottom' || point === 'right') return 1
  return 0.5
}

export type BannerOutputLayout = 'bySource' | 'flat'

export function getUniquePath(path: string, usedPaths: Set<string>) {
  if (!usedPaths.has(path)) {
    usedPaths.add(path)
    return path
  }

  const slashIndex = path.lastIndexOf('/')
  const dir = slashIndex >= 0 ? `${path.slice(0, slashIndex + 1)}` : ''
  const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path
  const dotIndex = fileName.lastIndexOf('.')
  const stem = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex) : ''
  let index = 2
  let nextPath = `${dir}${stem} (${index})${ext}`
  while (usedPaths.has(nextPath)) {
    index += 1
    nextPath = `${dir}${stem} (${index})${ext}`
  }
  usedPaths.add(nextPath)
  return nextPath
}

/** 平铺命名：640x360.jpg，冲突时为 750x300-2.jpg（对齐素材包习惯） */
export function getUniqueFlatPath(sizeLabel: string, outputExt: string, usedPaths: Set<string>, folder = '') {
  const prefix = folder ? `${folder}/` : ''
  let path = `${prefix}${sizeLabel}.${outputExt}`
  if (!usedPaths.has(path)) {
    usedPaths.add(path)
    return path
  }
  let index = 2
  while (usedPaths.has(`${prefix}${sizeLabel}-${index}.${outputExt}`)) {
    index += 1
  }
  path = `${prefix}${sizeLabel}-${index}.${outputExt}`
  usedPaths.add(path)
  return path
}

export function findBestMasterGroup(source: BannerSource) {
  return findBestMasterGroupForSource(source.width, source.height)
}

export async function readBannerSource(file: File): Promise<BannerSource> {
  const previewUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(previewUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('无法读取图片尺寸')
    return {
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      name: file.name,
      baseName: getBaseName(file.name),
      width,
      height,
      size: file.size,
      previewUrl,
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error
  }
}

export function buildSizeByKey(extraSizes: BannerSize[] = []) {
  const map = new Map<string, BannerSize>()
  BANNER_SIZE_PRESETS.forEach(size => map.set(size.key, size))
  extraSizes.forEach(size => map.set(size.key, size))
  return map
}

export function getGroupSizes(group: MasterGroup, sizeByKey: Map<string, BannerSize>) {
  return group.sizes
    .map(key => sizeByKey.get(key))
    .filter((size): size is BannerSize => Boolean(size))
}

/** 批量模式：每张原图各自匹配母版，生成该分类下全部尺寸 */
export function buildBatchGenerationPlans(
  sources: BannerSource[],
  sizeByKey: Map<string, BannerSize>
): BannerGenerationPlan[] {
  return sources.map(source => {
    const group = findBestMasterGroup(source)
    const sizes = getGroupSizes(group, sizeByKey)
    return { source, group, sizes }
  }).filter(plan => plan.sizes.length > 0)
}

export async function drawBannerCrop(
  source: BannerSource,
  target: BannerSize,
  settings: BannerCropSettings
) {
  const image = await loadImage(source.previewUrl)
  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 初始化失败')

  ctx.fillStyle = settings.backgroundColor
  ctx.fillRect(0, 0, target.width, target.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  if (settings.cropMode === 'contain') {
    const scale = Math.min(target.width / source.width, target.height / source.height)
    const drawWidth = source.width * scale
    const drawHeight = source.height * scale
    const dx = (target.width - drawWidth) / 2
    const dy = (target.height - drawHeight) / 2
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight)
  } else {
    const sourceRatio = source.width / source.height
    const targetRatio = target.width / target.height
    let sx = 0
    let sy = 0
    let sw = source.width
    let sh = source.height
    const ratio = getFocalRatio(settings.focalPoint)

    if (sourceRatio > targetRatio) {
      sw = source.height * targetRatio
      sx = (source.width - sw) * (
        settings.focalPoint === 'left' ? 0 : settings.focalPoint === 'right' ? 1 : ratio
      )
    } else {
      sh = source.width / targetRatio
      sy = (source.height - sh) * (
        settings.focalPoint === 'top' ? 0 : settings.focalPoint === 'bottom' ? 1 : ratio
      )
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, target.width, target.height)
  }

  return canvasToBlob(canvas, getMimeType(settings.outputFormat), settings.quality / 100)
}

export interface GenerateBannerOutputsResult {
  outputs: BannerOutput[]
  failed: number
}

export interface GenerateBannerOutputsOptions {
  /** flat：全部放入同一目录，文件名为 宽x高.ext（参考批量素材包） */
  layout?: BannerOutputLayout
  /** flat 时是否放入格式子目录，如 jpg/152x103.jpg */
  useFormatFolder?: boolean
}

export async function generateBannerOutputs(
  plans: BannerGenerationPlan[],
  settings: BannerCropSettings,
  onProgress?: (percent: number) => void,
  options: GenerateBannerOutputsOptions = {}
): Promise<GenerateBannerOutputsResult> {
  const layout = options.layout ?? 'bySource'
  const useFormatFolder = options.useFormatFolder ?? layout === 'flat'
  const nextOutputs: BannerOutput[] = []
  const usedPaths = new Set<string>()
  const outputExt = getExtension(settings.outputFormat)
  const formatFolder = useFormatFolder ? outputExt : ''
  let done = 0
  let failed = 0
  const total = plans.reduce((sum, plan) => sum + plan.sizes.length, 0)

  for (const plan of plans) {
    const { source, group, sizes } = plan
    const sourceFolder = sanitizeName(source.baseName)

    for (const size of sizes) {
      try {
        const blob = await drawBannerCrop(source, size, settings)
        const sizeGroup = findMasterGroupForTargetSize(size.width, size.height)
        let path: string
        if (layout === 'flat') {
          path = getUniqueFlatPath(size.label, outputExt, usedPaths, formatFolder)
        } else {
          const fileName = `${sizeGroup.code}_${size.label}.${outputExt}`
          const rawPath = plans.length > 1 || sizes.length > 1
            ? `${sourceFolder}/${fileName}`
            : fileName
          path = getUniquePath(rawPath, usedPaths)
        }
        const url = URL.createObjectURL(blob)

        if (blob.size === 0) throw new Error('输出文件为空')

        nextOutputs.push({
          id: `${source.id}-${size.key}`,
          sourceId: source.id,
          sourceBaseName: sanitizeName(source.baseName),
          masterGroup: sizeGroup.label,
          name: path.split('/').pop() || `${size.label}.${outputExt}`,
          path,
          width: size.width,
          height: size.height,
          blob,
          url,
        })
      } catch {
        failed += 1
      } finally {
        done += 1
        if (total > 0) onProgress?.(Math.round((done / total) * 100))
      }
    }
  }

  return { outputs: nextOutputs, failed }
}
