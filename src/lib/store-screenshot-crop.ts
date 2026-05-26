import {
  STORE_OUTPUT_SIZES,
  STORE_SCREENSHOT_SLOTS,
  STORE_ZIP_ROOT,
  type StoreOutputSize,
} from '@/data/store-screenshot-spec'

export interface StoreCropAdjust {
  /** 裁剪中心点（源图归一化 0~1） */
  focusX: number
  focusY: number
  /** 放大倍数，>=1，越大裁切区域越小 */
  zoom: number
}

export const DEFAULT_STORE_CROP_ADJUST: StoreCropAdjust = {
  focusX: 0.5,
  focusY: 0.5,
  zoom: 1,
}

export interface StoreScreenshotSource {
  slotIndex: number
  file: File
  name: string
  width: number
  height: number
  size: number
  previewUrl: string
  image: HTMLImageElement
}

export interface StoreScreenshotOutput {
  id: string
  slotIndex: number
  sizeKey: string
  width: number
  height: number
  path: string
  name: string
  blob: Blob
  url: string
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = url
  })
}

export function clampCropAdjust(adjust: StoreCropAdjust): StoreCropAdjust {
  return {
    focusX: Math.min(1, Math.max(0, adjust.focusX)),
    focusY: Math.min(1, Math.max(0, adjust.focusY)),
    zoom: Math.min(4, Math.max(1, adjust.zoom)),
  }
}

/** cover 铺满，无留边；按焦点与缩放裁切源图区域 */
export function computeCoverSourceRect(
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
  adjust: StoreCropAdjust
) {
  const targetRatio = targetW / targetH
  const sourceRatio = sourceW / sourceH
  let cropW: number
  let cropH: number

  if (sourceRatio > targetRatio) {
    cropH = sourceH
    cropW = cropH * targetRatio
  } else {
    cropW = sourceW
    cropH = cropW / targetRatio
  }

  const zoom = Math.max(1, adjust.zoom)
  cropW /= zoom
  cropH /= zoom

  let sx = adjust.focusX * sourceW - cropW / 2
  let sy = adjust.focusY * sourceH - cropH / 2
  sx = Math.max(0, Math.min(sourceW - cropW, sx))
  sy = Math.max(0, Math.min(sourceH - cropH, sy))

  return { sx, sy, sw: cropW, sh: cropH }
}

export function drawStoreScreenshotCrop(
  image: HTMLImageElement,
  target: StoreOutputSize,
  adjust: StoreCropAdjust
) {
  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 初始化失败')

  const rect = computeCoverSourceRect(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    target.width,
    target.height,
    clampCropAdjust(adjust)
  )

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, target.width, target.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    target.width,
    target.height
  )

  return canvas
}

export function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('PNG 编码失败'))
    }, 'image/png')
  })
}

export async function readStoreScreenshotSource(
  slotIndex: number,
  file: File
): Promise<StoreScreenshotSource> {
  const previewUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(previewUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('无法读取图片尺寸')
    return {
      slotIndex,
      file,
      name: file.name,
      width,
      height,
      size: file.size,
      previewUrl,
      image,
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error
  }
}

export function buildStoreOutputPath(sizeKey: string, slotFileName: string) {
  return `${STORE_ZIP_ROOT}/${sizeKey}/${slotFileName}.png`
}

function sortSizeLabel(a: string, b: string) {
  const [aw, ah] = a.split('x').map(Number)
  const [bw, bh] = b.split('x').map(Number)
  return aw - bw || ah - bh
}

/** ZIP 文件名按所含尺寸命名，例如 store-screenshot_1080x1920_360x640+720x1280_20files.zip */
export function buildStoreScreenshotZipFileName(
  outputs: StoreScreenshotOutput[],
  options?: { masterKey?: string }
) {
  if (outputs.length === 0) return `${STORE_ZIP_ROOT}.zip`

  const uniqueSizes = [...new Set(outputs.map(output => output.sizeKey))].sort(sortSizeLabel)
  const count = outputs.length

  let sizeTag: string
  if (uniqueSizes.length <= 5) {
    sizeTag = uniqueSizes.join('+')
  } else {
    sizeTag = `${uniqueSizes[0]}_to_${uniqueSizes[uniqueSizes.length - 1]}_${uniqueSizes.length}sizes`
  }

  const masterTag = options?.masterKey ? `_${options.masterKey}` : ''
  let fileName = `store-screenshot${masterTag}_${sizeTag}_${count}files.zip`

  if (fileName.length > 220) {
    fileName = `store-screenshot${masterTag}_${uniqueSizes.length}sizes_${count}files.zip`
  }

  return fileName
}

export async function generateStoreScreenshotOutputs(
  sources: StoreScreenshotSource[],
  adjusts: Record<number, StoreCropAdjust>,
  targetSizes: StoreOutputSize[],
  onProgress?: (percent: number) => void
) {
  const outputs: StoreScreenshotOutput[] = []
  let failed = 0
  const total = targetSizes.length * sources.length
  let done = 0

  const orderedSources = [...sources].sort((a, b) => a.slotIndex - b.slotIndex)

  for (const source of orderedSources) {
    const adjust = clampCropAdjust(adjusts[source.slotIndex] || DEFAULT_STORE_CROP_ADJUST)
    const slotMeta = STORE_SCREENSHOT_SLOTS.find(slot => slot.index === source.slotIndex)
    const fileStem = slotMeta?.fileName || String(source.slotIndex).padStart(2, '0')

    for (const size of targetSizes) {
      try {
        const canvas = drawStoreScreenshotCrop(source.image, size, adjust)
        const blob = await canvasToPngBlob(canvas)
        const path = buildStoreOutputPath(size.key, fileStem)
        const url = URL.createObjectURL(blob)
        outputs.push({
          id: `${source.slotIndex}-${size.key}`,
          slotIndex: source.slotIndex,
          sizeKey: size.key,
          width: size.width,
          height: size.height,
          path,
          name: `${fileStem}.png`,
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

  return { outputs, failed }
}

/** 生成全部 12 个 Store Screenshot 尺寸 */
export async function generateAllStoreScreenshotOutputs(
  sources: StoreScreenshotSource[],
  adjusts: Record<number, StoreCropAdjust>,
  onProgress?: (percent: number) => void
) {
  return generateStoreScreenshotOutputs(sources, adjusts, STORE_OUTPUT_SIZES, onProgress)
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
