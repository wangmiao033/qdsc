'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, CheckCircle2, Crop, Download, FileArchive, ImagePlus, Loader2, RefreshCw,
  Search, Settings2, Upload, X
} from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'

type OutputFormat = 'jpg' | 'png' | 'webp'
type CropMode = 'cover' | 'contain'
type FocalPoint = 'center' | 'top' | 'bottom' | 'left' | 'right'
type SizeFilter = 'all' | 'landscape' | 'portrait' | 'square'
type OutputScope = 'autoMaster' | 'manual'

interface BannerSource {
  id: string
  file: File
  name: string
  baseName: string
  width: number
  height: number
  size: number
  previewUrl: string
}

interface BannerSize {
  key: string
  width: number
  height: number
  label: string
}

interface MasterGroup {
  id: string
  label: string
  master: string
  description: string
  sizes: string[]
}

interface BannerOutput {
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

const MASTER_GROUPS: MasterGroup[] = [
  {
    id: 'wide-16-9',
    label: '1920x1080 横版主图母版',
    master: '1920x1080',
    description: '16:9 横版，适合主视觉横图',
    sizes: ['640x360', '800x450', '960x540', '1024x576', '1080x608', '1280x720', '1920x1080'],
  },
  {
    id: 'long-banner',
    label: '1920x640 长条横幅母版',
    master: '1920x640',
    description: '长条横幅，适合顶部 Banner 和推广条',
    sizes: ['750x250', '900x300', '970x340', '1000x300', '1008x372', '1200x400', '1920x452', '1920x500', '1920x600', '1920x640'],
  },
  {
    id: 'portrait-9-16',
    label: '1080x1920 手机竖版母版',
    master: '1080x1920',
    description: '9:16 竖版，适合开屏和竖版投放',
    sizes: ['720x1280', '750x1334', '750x1350', '880x1200', '900x1200', '1080x1560', '1080x1920', '1080x2160', '1080x2400'],
  },
  {
    id: 'square',
    label: '1024x1024 方图母版',
    master: '1024x1024',
    description: '1:1 方图，适合图标式方形广告位',
    sizes: ['450x450', '640x640', '750x750', '800x800', '984x984', '1024x1024', '1080x1080'],
  },
  {
    id: 'wide-2-1',
    label: '2000x1000 2:1 宽横版母版',
    master: '2000x1000',
    description: '宽横版封面，介于 16:9 和长条之间',
    sizes: ['500x250', '600x300', '700x360', '720x350', '900x450', '1000x500', '2000x1000', '2400x1000'],
  },
  {
    id: 'portrait-medium',
    label: '1080x1440 中竖版母版',
    master: '1080x1440',
    description: '中竖版，适合 3:4 附近素材',
    sizes: ['720x890', '750x920', '750x1252', '834x1236', '880x1200', '900x1200', '1080x1440', '1080x1560'],
  },
]

const BANNER_SIZE_PRESETS: BannerSize[] = Array.from(new Set([
  ...RAW_BANNER_SIZE_PRESETS,
  ...MASTER_GROUPS.flatMap(group => [group.master, ...group.sizes]),
]))
  .map(label => {
    const [width, height] = label.split('x').map(Number)
    return { key: label, width, height, label }
  })
  .sort((a, b) => a.width - b.width || a.height - b.height)

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function getBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'banner'
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

function parseSize(label: string) {
  const [width, height] = label.split('x').map(Number)
  return { width, height }
}

function getMasterRatio(group: MasterGroup) {
  const master = parseSize(group.master)
  return master.width / master.height
}

function findBestMasterGroup(source: BannerSource) {
  const sourceKey = `${source.width}x${source.height}`
  const exactMatch = MASTER_GROUPS.find(group => group.master === sourceKey)
  if (exactMatch) return exactMatch

  const sourceRatio = source.width / source.height
  return MASTER_GROUPS.reduce((best, group) => {
    const bestDiff = Math.abs(sourceRatio - getMasterRatio(best))
    const groupDiff = Math.abs(sourceRatio - getMasterRatio(group))
    return groupDiff < bestDiff ? group : best
  }, MASTER_GROUPS[0])
}

function getUniquePath(path: string, usedPaths: Set<string>) {
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
  console.info('[BannerCrop] duplicated zip path renamed', {
    originalPath: path,
    outputPath: nextPath,
    reason: 'duplicated_zip_path',
  })
  return nextPath
}

function isSizeInFilter(size: BannerSize, filter: SizeFilter) {
  if (filter === 'landscape') return size.width > size.height
  if (filter === 'portrait') return size.width < size.height
  if (filter === 'square') return size.width === size.height
  return true
}

async function readSource(file: File): Promise<BannerSource> {
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

export default function BannerCropView() {
  const [sources, setSources] = useState<BannerSource[]>([])
  const [outputs, setOutputs] = useState<BannerOutput[]>([])
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(() => new Set(MASTER_GROUPS[0].sizes))
  const [outputScope, setOutputScope] = useState<OutputScope>('autoMaster')
  const [activeMasterGroupId, setActiveMasterGroupId] = useState(MASTER_GROUPS[0].id)
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all')
  const [sizeSearch, setSizeSearch] = useState('')
  const [customSize, setCustomSize] = useState('')
  const [extraSizes, setExtraSizes] = useState<BannerSize[]>([])
  const [cropMode, setCropMode] = useState<CropMode>('cover')
  const [focalPoint, setFocalPoint] = useState<FocalPoint>('center')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpg')
  const [quality, setQuality] = useState(92)
  const [backgroundColor, setBackgroundColor] = useState('#000000')
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const sourcesRef = useRef<BannerSource[]>([])
  const outputsRef = useRef<BannerOutput[]>([])
  const { toast } = useToast()

  const allSizes = useMemo(() => {
    const map = new Map<string, BannerSize>()
    BANNER_SIZE_PRESETS.forEach(size => map.set(size.key, size))
    extraSizes.forEach(size => map.set(size.key, size))
    return Array.from(map.values()).sort((a, b) => a.width - b.width || a.height - b.height)
  }, [extraSizes])

  const filteredSizes = useMemo(() => {
    const keyword = sizeSearch.trim().toLowerCase()
    return allSizes.filter(size => {
      if (!isSizeInFilter(size, sizeFilter)) return false
      return !keyword || size.label.toLowerCase().includes(keyword)
    })
  }, [allSizes, sizeFilter, sizeSearch])

  const selectedSizeList = useMemo(
    () => allSizes.filter(size => selectedSizes.has(size.key)),
    [allSizes, selectedSizes]
  )

  const sizeByKey = useMemo(() => new Map(allSizes.map(size => [size.key, size])), [allSizes])
  const getGroupSizes = (group: MasterGroup) => group.sizes
    .map(key => sizeByKey.get(key))
    .filter((size): size is BannerSize => Boolean(size))

  const sourcePlans = useMemo(() => sources.map(source => {
    const group = findBestMasterGroup(source)
    return { source, group, sizes: getGroupSizes(group) }
  }), [sources, sizeByKey])

  const activeMasterGroup = MASTER_GROUPS.find(group => group.id === activeMasterGroupId) || MASTER_GROUPS[0]
  const activeMasterGroupSizes = getGroupSizes(activeMasterGroup)
  const activeSizeList = outputScope === 'autoMaster' ? activeMasterGroupSizes : selectedSizeList
  const sourcePlanById = useMemo(() => new Map(sourcePlans.map(plan => [plan.source.id, plan])), [sourcePlans])
  const selectedLandscapeCount = activeSizeList.filter(size => size.width > size.height).length
  const selectedPortraitCount = activeSizeList.filter(size => size.width < size.height).length
  const selectedSquareCount = activeSizeList.filter(size => size.width === size.height).length
  const totalOutputCount = sources.length * activeSizeList.length
  const totalSourceSize = sources.reduce((sum, source) => sum + source.size, 0)
  const totalOutputSize = outputs.reduce((sum, output) => sum + output.blob.size, 0)

  useEffect(() => { sourcesRef.current = sources }, [sources])
  useEffect(() => { outputsRef.current = outputs }, [outputs])
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach(source => URL.revokeObjectURL(source.previewUrl))
      outputsRef.current.forEach(output => URL.revokeObjectURL(output.url))
    }
  }, [])

  useEffect(() => {
    if (outputScope !== 'autoMaster' || sources.length === 0) return
    const matchedGroup = findBestMasterGroup(sources[0])
    setActiveMasterGroupId(prev => prev === matchedGroup.id ? prev : matchedGroup.id)
    setSelectedSizes(new Set(matchedGroup.sizes))
  }, [sources, outputScope])

  const clearOutputs = () => {
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setOutputs([])
    setProgress(0)
  }

  const addFiles = async (fileList: FileList | File[]) => {
    const imageFiles = Array.from(fileList).filter(file =>
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
    )

    if (imageFiles.length === 0) {
      toast({ title: '请选择图片文件', description: '支持 PNG/JPG/WebP/GIF/BMP', variant: 'destructive' })
      return
    }

    setIsReading(true)
    clearOutputs()
    const nextSources: BannerSource[] = []
    const skipped: Array<{ name: string; reason: string }> = []

    for (const file of imageFiles) {
      try {
        nextSources.push(await readSource(file))
      } catch (error) {
        const reason = error instanceof Error ? error.message : '图片读取失败'
        skipped.push({ name: file.name, reason })
        console.warn('[BannerCrop] skipped source image', { fileName: file.name, reason })
      }
    }

    setSources(prev => [...prev, ...nextSources])
    if (nextSources.length > 0) {
      const matchedGroup = findBestMasterGroup(nextSources[0])
      setOutputScope('autoMaster')
      setActiveMasterGroupId(matchedGroup.id)
      setSelectedSizes(new Set(matchedGroup.sizes))
    }
    setIsReading(false)

    if (nextSources.length > 0) {
      toast({ title: `已添加 ${nextSources.length} 张 Banner 原图` })
    }
    if (skipped.length > 0) {
      toast({ title: `跳过 ${skipped.length} 个文件`, description: skipped[0].reason, variant: 'destructive' })
    }
  }

  const removeSource = (id: string) => {
    clearOutputs()
    setSources(prev => {
      const target = prev.find(source => source.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter(source => source.id !== id)
    })
  }

  const resetAll = () => {
    sources.forEach(source => URL.revokeObjectURL(source.previewUrl))
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setSources([])
    setOutputs([])
    setOutputScope('autoMaster')
    setActiveMasterGroupId(MASTER_GROUPS[0].id)
    setSelectedSizes(new Set(MASTER_GROUPS[0].sizes))
    setProgress(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  const toggleSize = (key: string) => {
    clearOutputs()
    setOutputScope('manual')
    setSelectedSizes(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectFilteredSizes = () => {
    clearOutputs()
    setOutputScope('manual')
    setSelectedSizes(prev => {
      const next = new Set(prev)
      filteredSizes.forEach(size => next.add(size.key))
      return next
    })
  }

  const clearFilteredSizes = () => {
    clearOutputs()
    setOutputScope('manual')
    setSelectedSizes(prev => {
      const next = new Set(prev)
      filteredSizes.forEach(size => next.delete(size.key))
      return next
    })
  }

  const addCustomSize = () => {
    const match = customSize.trim().match(/^(\d{2,5})\s*[xX*×]\s*(\d{2,5})$/)
    if (!match) {
      toast({ title: '尺寸格式不正确', description: '请输入类似 1920x680 的格式', variant: 'destructive' })
      return
    }
    const width = Number(match[1])
    const height = Number(match[2])
    const key = `${width}x${height}`
    const newSize = { key, width, height, label: key }
    setExtraSizes(prev => prev.some(size => size.key === key) ? prev : [...prev, newSize])
    setOutputScope('manual')
    setSelectedSizes(prev => new Set(prev).add(key))
    setCustomSize('')
  }

  const selectMasterGroup = (group: MasterGroup) => {
    clearOutputs()
    setOutputScope('manual')
    setActiveMasterGroupId(group.id)
    setSelectedSizes(new Set(group.sizes))
    setSizeFilter('all')
    setSizeSearch('')
  }

  const enableAutoMasterMode = () => {
    clearOutputs()
    setOutputScope('autoMaster')
    if (sources.length > 0) {
      const matchedGroup = findBestMasterGroup(sources[0])
      setActiveMasterGroupId(matchedGroup.id)
      setSelectedSizes(new Set(matchedGroup.sizes))
    }
  }

  const drawBanner = async (source: BannerSource, target: BannerSize) => {
    const image = await loadImage(source.previewUrl)
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 初始化失败')

    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, target.width, target.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    if (cropMode === 'contain') {
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
      const ratio = getFocalRatio(focalPoint)

      if (sourceRatio > targetRatio) {
        sw = source.height * targetRatio
        sx = (source.width - sw) * (focalPoint === 'left' ? 0 : focalPoint === 'right' ? 1 : ratio)
      } else {
        sh = source.width / targetRatio
        sy = (source.height - sh) * (focalPoint === 'top' ? 0 : focalPoint === 'bottom' ? 1 : ratio)
      }
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, target.width, target.height)
    }

    return canvasToBlob(canvas, getMimeType(outputFormat), quality / 100)
  }

  const handleGenerate = async () => {
    if (sources.length === 0 || totalOutputCount === 0 || isGenerating) return

    clearOutputs()
    setIsGenerating(true)
    setProgress(0)

    const nextOutputs: BannerOutput[] = []
    const usedPaths = new Set<string>()
    const outputExt = getExtension(outputFormat)
    const total = totalOutputCount
    let done = 0

    const groupSizes = getGroupSizes(activeMasterGroup)
    const isExactGroupSelection = selectedSizeList.length === groupSizes.length
      && groupSizes.every(size => selectedSizes.has(size.key))
    const outputGroup = outputScope === 'autoMaster' || isExactGroupSelection
      ? activeMasterGroup
      : { id: 'manual', label: '手动尺寸', master: 'manual', description: '', sizes: activeSizeList.map(size => size.key) }
    const plans = sources.map(source => ({
      source,
      group: outputGroup,
      sizes: activeSizeList,
    }))

    for (const plan of plans) {
      const { source, group, sizes } = plan
      for (const size of sizes) {
        try {
          const blob = await drawBanner(source, size)
          const safeBaseName = sanitizeName(source.baseName)
          const fileName = `${safeBaseName}_${size.label}.${outputExt}`
          const groupFolder = sanitizeName(group.label)
          const rawPath = sources.length > 1 || outputScope === 'autoMaster'
            ? `${groupFolder}/${safeBaseName}/${fileName}`
            : fileName
          const path = getUniquePath(rawPath, usedPaths)
          const url = URL.createObjectURL(blob)
          nextOutputs.push({
            id: `${source.id}-${size.key}`,
            sourceId: source.id,
            sourceBaseName: safeBaseName,
            masterGroup: group.label,
            name: path.split('/').pop() || fileName,
            path,
            width: size.width,
            height: size.height,
            blob,
            url,
          })
        } catch (error) {
          const reason = error instanceof Error ? error.message : '生成失败'
          console.warn('[BannerCrop] skipped output', {
            fileName: source.name,
            size: size.label,
            reason,
          })
        } finally {
          done += 1
          setProgress(Math.round((done / total) * 100))
        }
      }
    }

    setOutputs(nextOutputs)
    setIsGenerating(false)
    toast({ title: `生成完成: ${nextOutputs.length} 个文件` })
  }

  const downloadZip = async () => {
    if (outputs.length === 0) return
    const zip = new JSZip()
    outputs.forEach(output => zip.file(output.path, output.blob))
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `banner_crop_${outputs.length}_files.zip`)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files)
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Crop className="h-5 w-5 text-primary" />
            Banner 裁剪
          </h2>
          <p className="text-xs text-muted-foreground">按渠道 Banner 尺寸批量裁切输出</p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll} disabled={sources.length === 0 && outputs.length === 0}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          重置
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" />
                上传原图
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/20'
                }`}
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setIsDragging(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setIsDragging(false)
                }}
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  className="hidden"
                  onChange={(event) => {
                    addFiles(event.target.files || [])
                    event.target.value = ''
                  }}
                />
                {isReading ? (
                  <>
                    <Loader2 className="h-9 w-9 mx-auto text-primary animate-spin" />
                    <div className="text-sm font-medium mt-3">读取中...</div>
                  </>
                ) : sources.length > 0 ? (
                  <>
                    <ImagePlus className="h-9 w-9 mx-auto text-emerald-500" />
                    <div className="text-sm font-medium mt-3">已选择 {sources.length} 张原图</div>
                    <div className="text-xs text-muted-foreground mt-1">点击或拖入继续添加</div>
                  </>
                ) : (
                  <>
                    <Upload className="h-9 w-9 mx-auto text-muted-foreground" />
                    <div className="text-sm font-medium mt-3">拖入 Banner 原图或点击选择</div>
                    <div className="text-xs text-muted-foreground mt-1">PNG / JPG / WebP / GIF / BMP</div>
                  </>
                )}
              </div>

              {sources.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  <Card className="p-2.5 text-center">
                    <div className="text-lg font-bold">{sources.length}</div>
                    <div className="text-[10px] text-muted-foreground">原图</div>
                  </Card>
                  <Card className="p-2.5 text-center">
                    <div className="text-lg font-bold">{activeSizeList.length}</div>
                    <div className="text-[10px] text-muted-foreground">{outputScope === 'autoMaster' ? '分类尺寸' : '手选尺寸'}</div>
                  </Card>
                  <Card className="p-2.5 text-center">
                    <div className="text-lg font-bold">{totalOutputCount}</div>
                    <div className="text-[10px] text-muted-foreground">预计输出</div>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                裁剪设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">裁剪模式</Label>
                <Select value={cropMode} onValueChange={(value) => setCropMode(value as CropMode)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">等比填充裁剪</SelectItem>
                    <SelectItem value="contain">等比完整留边</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">裁剪焦点</Label>
                <Select value={focalPoint} onValueChange={(value) => setFocalPoint(value as FocalPoint)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center">居中</SelectItem>
                    <SelectItem value="top">靠上</SelectItem>
                    <SelectItem value="bottom">靠下</SelectItem>
                    <SelectItem value="left">靠左</SelectItem>
                    <SelectItem value="right">靠右</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">输出格式</Label>
                  <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as OutputFormat)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jpg">JPG</SelectItem>
                      <SelectItem value="png">PNG</SelectItem>
                      <SelectItem value="webp">WebP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">留边颜色</Label>
                  <Input
                    type="color"
                    className="h-9 p-1"
                    value={backgroundColor}
                    onChange={event => setBackgroundColor(event.target.value)}
                  />
                </div>
              </div>

              {(outputFormat === 'jpg' || outputFormat === 'webp') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">质量</Label>
                    <span className="text-xs font-mono text-muted-foreground">{quality}%</span>
                  </div>
                  <Slider value={[quality]} min={50} max={100} step={1} onValueChange={value => setQuality(value[0])} />
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={sources.length === 0 || totalOutputCount === 0 || isGenerating || isReading}
              >
                {isGenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Crop className="h-4 w-4 mr-1" />}
                {isGenerating ? '生成中...' : `生成 Banner (${totalOutputCount} 个文件)`}
              </Button>
              {isGenerating && <Progress value={progress} className="h-2" />}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-8 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileArchive className="h-4 w-4" />
                    母版分类
                  </CardTitle>
                  <CardDescription className="text-xs">
                    当前母版：{activeMasterGroup.label}。默认按上传图片比例自动匹配，只输出该母版可覆盖的尺寸。
                  </CardDescription>
                </div>
                <Button
                  variant={outputScope === 'autoMaster' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={enableAutoMasterMode}
                >
                  自动匹配
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {MASTER_GROUPS.map(group => {
                  const groupSizes = getGroupSizes(group)
                  const ratio = getMasterRatio(group)
                  const isActiveGroup = activeMasterGroupId === group.id
                  const isManualGroupSelected = outputScope === 'manual'
                    && groupSizes.length > 0
                    && groupSizes.every(size => selectedSizes.has(size.key))
                    && selectedSizeList.length === groupSizes.length
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => selectMasterGroup(group)}
                      className={`text-left rounded-md border p-3 transition-colors ${
                        isActiveGroup || isManualGroupSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{group.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{group.description}</div>
                        </div>
                        <Badge variant={isActiveGroup ? 'default' : 'secondary'} className="font-mono text-[10px] px-1.5 shrink-0">{group.master}</Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{groupSizes.length} 个尺寸</span>
                        <span className="font-mono">{ratio.toFixed(2)}:1</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {groupSizes.slice(0, 6).map(size => (
                          <Badge key={size.key} variant="outline" className="font-mono text-[10px] px-1.5">
                            {size.label}
                          </Badge>
                        ))}
                        {groupSizes.length > 6 && (
                          <Badge variant="outline" className="text-[10px] px-1.5">+{groupSizes.length - 6}</Badge>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Crop className="h-4 w-4" />
                    尺寸预设
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {allSizes.length} 个唯一尺寸 · {outputScope === 'autoMaster' ? `当前分类覆盖 ${activeSizeList.length} 个` : `手动已选 ${selectedSizeList.length} 个`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={selectFilteredSizes}>
                    全选当前
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilteredSizes}>
                    取消当前
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-2.5 text-center">
                  <div className="text-lg font-bold">{selectedLandscapeCount}</div>
                  <div className="text-[10px] text-muted-foreground">横版</div>
                </Card>
                <Card className="p-2.5 text-center">
                  <div className="text-lg font-bold">{selectedPortraitCount}</div>
                  <div className="text-[10px] text-muted-foreground">竖版</div>
                </Card>
                <Card className="p-2.5 text-center">
                  <div className="text-lg font-bold">{selectedSquareCount}</div>
                  <div className="text-[10px] text-muted-foreground">方图</div>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_160px] gap-2">
                <Select value={sizeFilter} onValueChange={(value) => setSizeFilter(value as SizeFilter)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部尺寸</SelectItem>
                    <SelectItem value="landscape">只看横版</SelectItem>
                    <SelectItem value="portrait">只看竖版</SelectItem>
                    <SelectItem value="square">只看方图</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8 text-xs"
                    value={sizeSearch}
                    onChange={event => setSizeSearch(event.target.value)}
                    placeholder="搜索 1920x680"
                  />
                </div>
                <div className="flex gap-1">
                  <Input
                    className="h-9 text-xs"
                    value={customSize}
                    onChange={event => setCustomSize(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') addCustomSize() }}
                    placeholder="宽x高"
                  />
                  <Button variant="outline" size="sm" className="h-9 px-2 text-xs" onClick={addCustomSize}>
                    添加
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-80 overflow-y-auto pr-1">
                {filteredSizes.map(size => {
                  const checked = outputScope === 'autoMaster'
                    ? activeSizeList.some(activeSize => activeSize.key === size.key)
                    : selectedSizes.has(size.key)
                  return (
                    <button
                      key={size.key}
                      type="button"
                      onClick={() => toggleSize(size.key)}
                      className={`h-9 px-2 rounded-md border text-xs flex items-center justify-between gap-2 transition-colors ${
                        checked ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'
                      }`}
                    >
                      <span className="font-mono truncate">{size.label}</span>
                      <span className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                      }`}>
                        {checked && <Check className="h-2.5 w-2.5" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ImagePlus className="h-4 w-4" />
                    原图预览
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {sources.length > 0 ? `${sources.length} 张 · ${formatBytes(totalSourceSize)}` : '尚未上传原图'}
                  </CardDescription>
                </div>
                {sources.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetAll}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    清空
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sources.length === 0 ? (
                <div className="h-56 flex items-center justify-center border rounded-lg bg-muted/20 text-sm text-muted-foreground">
                  先上传一张 Banner 原图
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
                  {sources.map(source => (
                    <div key={source.id} className="relative group border rounded-md overflow-hidden bg-card">
                      <div className="aspect-video bg-muted/30 flex items-center justify-center">
                        <img src={source.previewUrl} alt={source.name} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="p-2 space-y-1">
                        <div className="text-xs font-medium truncate" title={source.name}>{source.name}</div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Badge variant="secondary" className="font-mono text-[10px] px-1.5">{source.width}x{source.height}</Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5">
                            {outputScope === 'autoMaster'
                              ? sourcePlanById.get(source.id)?.group.label || activeMasterGroup.label
                              : activeMasterGroup.label}
                          </Badge>
                          <span>{formatBytes(source.size)}</span>
                        </div>
                      </div>
                      <button
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        onClick={() => removeSource(source.id)}
                        aria-label={`移除 ${source.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {outputs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      裁剪结果
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {outputs.length} 个文件 · {formatBytes(totalOutputSize)}
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={downloadZip}>
                    <FileArchive className="h-4 w-4 mr-1" />
                    打包下载 ZIP（{outputs.length} 个文件）
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
                  {outputs.slice(0, 80).map(output => (
                    <div key={output.id} className="flex items-center gap-3 border rounded-md p-2">
                      <div className="h-14 w-20 rounded bg-muted/30 border flex items-center justify-center overflow-hidden shrink-0">
                        <img src={output.url} alt={output.name} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate" title={output.path}>{output.name}</div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5">{output.width}x{output.height}</Badge>
                          <span>{formatBytes(output.blob.size)}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => saveAs(output.blob, output.name)}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        下载
                      </Button>
                    </div>
                  ))}
                </div>
                {outputs.length > 80 && (
                  <div className="text-xs text-muted-foreground text-center mt-3">
                    已生成 {outputs.length} 个文件，列表仅预览前 80 个，ZIP 会包含全部文件。
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
