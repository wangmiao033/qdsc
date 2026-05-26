'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, CheckCircle2, Crop, Database, Download, FileArchive, ImagePlus, Loader2, RefreshCw,
  Search, Settings2, Upload, X
} from 'lucide-react'
import { parseStoredOutputFormat } from '@/lib/crop-utils'
import {
  findBestMasterGroupForSource,
  findMasterGroupForTargetSize,
  getAllMasterSizeKeys,
  getMasterRatio,
  MASTER_GROUPS,
  type MasterGroup,
} from '@/lib/banner-master-groups'
import { cn } from '@/lib/utils'
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

const BANNER_SIZE_PRESETS: BannerSize[] = Array.from(new Set([
  ...RAW_BANNER_SIZE_PRESETS,
  ...getAllMasterSizeKeys(),
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

function sortSizeLabel(a: string, b: string) {
  const [aw, ah] = a.split('x').map(Number)
  const [bw, bh] = b.split('x').map(Number)
  return aw - bw || ah - bh
}

function buildBannerZipFileName(outputs: BannerOutput[]) {
  if (outputs.length === 0) return 'banner_crop.zip'

  const uniqueSizes = [...new Set(outputs.map(output => `${output.width}x${output.height}`))]
    .sort(sortSizeLabel)
  const uniqueSources = [...new Set(outputs.map(output => output.sourceBaseName))]
  const prefix = uniqueSources.length === 1 ? sanitizeName(uniqueSources[0]) : 'banner_crop'
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

function findBestMasterGroup(source: BannerSource) {
  return findBestMasterGroupForSource(source.width, source.height)
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

function BannerSpecImportButton({ onImport }: { onImport: (sizes: BannerSize[]) => void }) {
  const [open, setOpen] = useState(false)
  const [channels, setChannels] = useState<string[]>([])
  const [selectedChannel, setSelectedChannel] = useState('')
  const [specs, setSpecs] = useState<Array<{ name: string; width: number; height: number; format: string }>>([])
  const [loading, setLoading] = useState(false)

  const loadChannels = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/specs?pageSize=5000')
      const data = await res.json()
      const channelSet = new Set<string>()
      const specMap: Record<string, Array<{ name: string; width: number; height: number; format: string }>> = {}
      for (const item of data.items || []) {
        channelSet.add(item.channel)
        if (!specMap[item.channel]) specMap[item.channel] = []
        const key = `${item.width}x${item.height}`
        if (!specMap[item.channel].find(spec => `${spec.width}x${spec.height}` === key)) {
          specMap[item.channel].push({
            name: item.name,
            width: item.width,
            height: item.height,
            format: item.format,
          })
        }
      }
      setChannels(Array.from(channelSet).sort())
      ;(window as unknown as Record<string, unknown>).__bannerSpecMap = specMap
    } catch {
      /* ignore */
    }
    setLoading(false)
  }

  const handleOpen = () => {
    setOpen(true)
    if (channels.length === 0) loadChannels()
  }

  const handleSelectChannel = (channel: string) => {
    setSelectedChannel(channel)
    const specMap = (window as unknown as Record<string, unknown>).__bannerSpecMap as Record<string, Array<{ name: string; width: number; height: number; format: string }>>
    setSpecs(specMap?.[channel] || [])
  }

  const handleImportAll = () => {
    const sizes: BannerSize[] = specs.map(spec => ({
      key: `${spec.width}x${spec.height}`,
      width: spec.width,
      height: spec.height,
      label: `${spec.width}x${spec.height}`,
    }))
    onImport(sizes)
    setOpen(false)
    setSelectedChannel('')
    setSpecs([])
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-border/80" onClick={handleOpen}>
        <Database className="h-3.5 w-3.5 mr-1" />
        从规格库导入
      </Button>
    )
  }

  return (
    <Card className="rounded-xl border border-border/80 p-3 space-y-2 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">从规格库导入尺寸</span>
        <Button variant="ghost" size="sm" className="h-5 text-xs px-1.5" onClick={() => { setOpen(false); setSelectedChannel(''); setSpecs([]) }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载中...
        </div>
      ) : (
        <>
          <Select value={selectedChannel} onValueChange={handleSelectChannel}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={`选择渠道 (${channels.length} 个)`} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {channels.map(channel => (
                <SelectItem key={channel} value={channel} className="text-xs">{channel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedChannel && specs.length > 0 && (
            <>
              <div className="text-[10px] text-muted-foreground">
                {selectedChannel}: {specs.length} 个尺寸
              </div>
              <div className="max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {specs.slice(0, 30).map((spec, index) => (
                    <Badge key={index} variant="outline" className="text-[9px] px-1 py-0">
                      {spec.width}x{spec.height}
                    </Badge>
                  ))}
                  {specs.length > 30 && (
                    <span className="text-[9px] text-muted-foreground">+{specs.length - 30} 个</span>
                  )}
                </div>
              </div>
              <Button size="sm" className="w-full h-8 text-xs" onClick={handleImportAll}>
                导入全部 {specs.length} 个尺寸
              </Button>
            </>
          )}
        </>
      )}
    </Card>
  )
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

  const selectedSizeList = useMemo(
    () => allSizes.filter(size => selectedSizes.has(size.key)),
    [allSizes, selectedSizes]
  )

  const sizeByKey = useMemo(() => new Map(allSizes.map(size => [size.key, size])), [allSizes])
  const getGroupSizes = (group: MasterGroup) => group.sizes
    .map(key => sizeByKey.get(key))
    .filter((size): size is BannerSize => Boolean(size))

  const sourcePlans = useMemo(() => sources.map(source => ({
    source,
    group: findBestMasterGroup(source),
  })), [sources])

  const activeMasterGroup = MASTER_GROUPS.find(group => group.id === activeMasterGroupId) || MASTER_GROUPS[0]
  const activeMasterGroupSizes = getGroupSizes(activeMasterGroup)
  const activeSizeList = useMemo(() => {
    if (outputScope === 'autoMaster') return activeMasterGroupSizes
    return selectedSizeList.filter(size =>
      activeMasterGroup.sizes.includes(size.key)
      || findMasterGroupForTargetSize(size.width, size.height).id === activeMasterGroup.id
    )
  }, [outputScope, activeMasterGroupSizes, activeMasterGroup, selectedSizeList])
  const sourcePlanById = useMemo(() => new Map(sourcePlans.map(plan => [plan.source.id, plan])), [sourcePlans])

  const getMasterSourceForGroup = (group: MasterGroup) => {
    const groupSources = sources.filter(source => findBestMasterGroup(source).id === group.id)
    return groupSources.find(source => `${source.width}x${source.height}` === group.master) || groupSources[0]
  }

  const generationPlans = useMemo(() => {
    if (sources.length === 0) return []

    if (outputScope === 'autoMaster') {
      return MASTER_GROUPS.flatMap(group => {
        const sizes = getGroupSizes(group)
        if (sizes.length === 0) return []
        const source = getMasterSourceForGroup(group)
        if (!source) return []
        return [{ source, group, sizes }]
      })
    }

    const sizes = activeSizeList
    if (sizes.length === 0) return []
    const source = getMasterSourceForGroup(activeMasterGroup)
    if (!source) return []
    return [{ source, group: activeMasterGroup, sizes }]
  }, [sources, outputScope, activeMasterGroup, activeSizeList, sizeByKey])

  const scopeSizes = useMemo(() => activeMasterGroupSizes, [activeMasterGroupSizes])

  const filteredSizes = useMemo(() => {
    const keyword = sizeSearch.trim().toLowerCase()
    return scopeSizes.filter(size => {
      if (!isSizeInFilter(size, sizeFilter)) return false
      return !keyword || size.label.toLowerCase().includes(keyword)
    })
  }, [scopeSizes, sizeFilter, sizeSearch])

  const selectedLandscapeCount = activeSizeList.filter(size => size.width > size.height).length
  const selectedPortraitCount = activeSizeList.filter(size => size.width < size.height).length
  const selectedSquareCount = activeSizeList.filter(size => size.width === size.height).length
  const totalOutputCount = useMemo(
    () => generationPlans.reduce((sum, plan) => sum + plan.sizes.length, 0),
    [generationPlans]
  )
  const missingMasterGroups = useMemo(() => {
    if (sources.length === 0) return []
    if (outputScope === 'autoMaster') {
      return MASTER_GROUPS.filter(group => getGroupSizes(group).length > 0 && !getMasterSourceForGroup(group))
    }
    return getMasterSourceForGroup(activeMasterGroup) ? [] : [activeMasterGroup]
  }, [sources, outputScope, activeMasterGroup, sizeByKey])
  const hasMixedMasterGroups = outputScope === 'autoMaster'
    && sources.length > 1
    && new Set(sourcePlans.map(plan => plan.group.id)).size > 1
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem('qdsc_banner_crop_sizes')
      if (!stored) return
      const sizes: Array<{ width: number; height: number; format?: string }> = JSON.parse(stored)
      if (!Array.isArray(sizes) || sizes.length === 0) return

      const importedSizes: BannerSize[] = sizes
        .filter(size => size.width > 0 && size.height > 0)
        .map(size => ({
          key: `${size.width}x${size.height}`,
          width: size.width,
          height: size.height,
          label: `${size.width}x${size.height}`,
        }))

      if (importedSizes.length === 0) return

      setExtraSizes(prev => {
        const existingKeys = new Set(prev.map(size => size.key))
        const unique = importedSizes.filter(size => !existingKeys.has(size.key))
        return unique.length > 0 ? [...prev, ...unique] : prev
      })
      setOutputScope('manual')
      setSelectedSizes(prev => {
        const next = new Set(prev)
        importedSizes.forEach(size => next.add(size.key))
        return next
      })

      const firstFormat = parseStoredOutputFormat(sizes.find(size => size.format)?.format)
      if (firstFormat) setOutputFormat(firstFormat)

      localStorage.removeItem('qdsc_banner_crop_sizes')
      toast({
        title: `已加载 ${importedSizes.length} 个预设尺寸`,
        description: '来自生产看板的 Banner 尺寸已添加到输出列表',
      })
    } catch {
      /* ignore */
    }
  }, [toast])

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

  const handleSpecImport = (sizes: BannerSize[]) => {
    clearOutputs()
    setExtraSizes(prev => {
      const existingKeys = new Set(prev.map(size => size.key))
      const unique = sizes.filter(size => !existingKeys.has(size.key))
      return unique.length > 0 ? [...prev, ...unique] : prev
    })
    setOutputScope('manual')
    setSelectedSizes(prev => {
      const next = new Set(prev)
      sizes.forEach(size => next.add(size.key))
      return next
    })
    toast({
      title: `已导入 ${sizes.length} 个规格库尺寸`,
      description: '已切换为手动尺寸模式',
    })
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
    if (sources.length === 0 || isGenerating) return

    const plans = generationPlans
    if (plans.length === 0 || totalOutputCount === 0) {
      const missingLabels = missingMasterGroups.map(group => group.label)
      toast({
        title: '缺少母版图',
        description: missingLabels.length > 0
          ? `请先上传对应母版：${missingLabels.slice(0, 3).join('、')}${missingLabels.length > 3 ? ` 等 ${missingLabels.length} 类` : ''}`
          : '请先上传与当前分类匹配的母版原图',
        variant: 'destructive',
      })
      return
    }

    clearOutputs()
    setIsGenerating(true)
    setProgress(0)

    const nextOutputs: BannerOutput[] = []
    const usedPaths = new Set<string>()
    const outputExt = getExtension(outputFormat)
    let done = 0
    let failed = 0
    const total = plans.reduce((sum, plan) => sum + plan.sizes.length, 0)

    for (const plan of plans) {
      const { source, group, sizes } = plan
      for (const size of sizes) {
        try {
          const blob = await drawBanner(source, size)
          const safeBaseName = sanitizeName(source.baseName)
          const sizeGroup = findMasterGroupForTargetSize(size.width, size.height)
          const fileName = `${sizeGroup.code}_${size.label}.${outputExt}`
          const groupFolder = sanitizeName(group.label)
          const useNestedPath = plans.length > 1 || sizes.length > 1
          const rawPath = useNestedPath
            ? `${groupFolder}/${fileName}`
            : fileName
          const path = getUniquePath(rawPath, usedPaths)
          const url = URL.createObjectURL(blob)

          if (blob.size === 0) throw new Error('输出文件为空')

          nextOutputs.push({
            id: `${source.id}-${size.key}`,
            sourceId: source.id,
            sourceBaseName: safeBaseName,
            masterGroup: sizeGroup.label,
            name: path.split('/').pop() || fileName,
            path,
            width: size.width,
            height: size.height,
            blob,
            url,
          })
        } catch (error) {
          failed += 1
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

    const skippedCount = missingMasterGroups.length
    if (failed > 0) {
      toast({
        title: `生成完成: ${nextOutputs.length} 个文件，${failed} 个失败`,
        description: skippedCount > 0 ? `另有 ${skippedCount} 个分类因缺少母版未生成` : undefined,
        variant: 'destructive',
      })
    } else if (skippedCount > 0) {
      toast({
        title: `生成完成: ${nextOutputs.length} 个文件`,
        description: `${skippedCount} 个分类因缺少母版已跳过`,
      })
    } else {
      toast({ title: `生成完成: ${nextOutputs.length} 个文件` })
    }
  }

  const downloadZip = async () => {
    if (outputs.length === 0) return
    const zip = new JSZip()
    outputs.forEach(output => zip.file(output.path, output.blob))
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, buildBannerZipFileName(outputs))
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files)
    }
  }

  const downloadBtnClass = 'h-8 rounded-lg text-xs shrink-0'

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 space-y-5 min-[1440px]:px-6">
      <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Crop className="h-5 w-5 text-foreground" />
            Banner 裁剪
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">按渠道 Banner 尺寸批量裁切输出</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-border/80"
          onClick={resetAll}
          disabled={sources.length === 0 && outputs.length === 0}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          重置
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1440px]:grid-cols-[300px_minmax(0,1fr)] min-[1728px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 min-[1440px]:sticky min-[1440px]:top-4 min-[1440px]:self-start">
          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" />
                上传原图
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div
                className={cn(
                  'relative border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all',
                  isDragging
                    ? 'border-foreground bg-muted/50'
                    : 'border-border hover:border-foreground/40 hover:bg-muted/30'
                )}
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
                    <Loader2 className="h-7 w-7 mx-auto text-foreground animate-spin" />
                    <div className="text-sm font-medium mt-2">读取中...</div>
                  </>
                ) : sources.length > 0 ? (
                  <>
                    <ImagePlus className="h-7 w-7 mx-auto text-foreground/70" />
                    <div className="text-sm font-medium mt-2">已选择 {sources.length} 张原图</div>
                    <div className="text-xs text-muted-foreground mt-0.5">点击或拖入继续添加</div>
                  </>
                ) : (
                  <>
                    <Upload className="h-7 w-7 mx-auto text-muted-foreground" />
                    <div className="text-sm font-medium mt-2">拖入 Banner 原图或点击选择</div>
                    <div className="text-xs text-muted-foreground mt-0.5">PNG / JPG / WebP / GIF / BMP</div>
                  </>
                )}
              </div>

              {sources.length > 0 && (
                <div className="flex items-stretch divide-x divide-border rounded-lg border border-border/80 bg-muted/20 text-center">
                  <div className="flex-1 py-2 px-1">
                    <div className="text-base font-semibold tabular-nums">{sources.length}</div>
                    <div className="text-[10px] text-muted-foreground">原图</div>
                  </div>
                  <div className="flex-1 py-2 px-1">
                    <div className="text-base font-semibold tabular-nums">{activeSizeList.length}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {outputScope === 'autoMaster' ? '分类尺寸' : '手选尺寸'}
                    </div>
                  </div>
                  <div className="flex-1 py-2 px-1">
                    <div className="text-base font-semibold tabular-nums">{totalOutputCount}</div>
                    <div className="text-[10px] text-muted-foreground">预计输出</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                裁剪设置
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">裁剪模式</Label>
                <Select value={cropMode} onValueChange={(value) => setCropMode(value as CropMode)}>
                  <SelectTrigger className="h-8 rounded-lg text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">等比填充裁剪</SelectItem>
                    <SelectItem value="contain">等比完整留边</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">裁剪焦点</Label>
                <Select value={focalPoint} onValueChange={(value) => setFocalPoint(value as FocalPoint)}>
                  <SelectTrigger className="h-8 rounded-lg text-xs">
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
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">输出格式</Label>
                  <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as OutputFormat)}>
                    <SelectTrigger className="h-8 rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jpg">JPG</SelectItem>
                      <SelectItem value="png">PNG</SelectItem>
                      <SelectItem value="webp">WebP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">留边颜色</Label>
                  <Input
                    type="color"
                    className="h-8 p-1 rounded-lg"
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
                className="w-full h-9 rounded-lg bg-foreground text-background hover:bg-foreground/90"
                onClick={handleGenerate}
                disabled={sources.length === 0 || totalOutputCount === 0 || isGenerating || isReading}
              >
                {isGenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Crop className="h-4 w-4 mr-1" />}
                {isGenerating ? '生成中...' : `生成 Banner (${totalOutputCount} 个文件)`}
              </Button>
              {isGenerating && <Progress value={progress} className="h-1.5 rounded-full" />}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileArchive className="h-4 w-4 text-muted-foreground" />
                    母版分类
                    <span className="text-xs font-normal text-muted-foreground">共 {MASTER_GROUPS.length} 类</span>
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    当前：<span className="font-medium text-foreground">{activeMasterGroup.label}</span>
                    {hasMixedMasterGroups && ' · 多原图将按各自母版分别输出'}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 text-xs rounded-lg shrink-0',
                    outputScope === 'autoMaster' && 'bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background'
                  )}
                  onClick={enableAutoMasterMode}
                >
                  自动匹配
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 min-[1440px]:grid-cols-3 min-[1728px]:grid-cols-4 gap-3">
                {MASTER_GROUPS.map(group => {
                  const groupSizes = getGroupSizes(group)
                  const ratio = getMasterRatio(group)
                  const hasMaster = Boolean(getMasterSourceForGroup(group))
                  const isSelected = activeMasterGroupId === group.id
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => selectMasterGroup(group)}
                      title={`建议母版文件：${group.masterFileName}`}
                      className={cn(
                        'text-left rounded-xl border p-3.5 transition-all',
                        isSelected
                          ? 'border-foreground bg-foreground text-background shadow-md ring-1 ring-foreground'
                          : 'border-border/80 bg-card hover:border-foreground/35 hover:shadow-sm'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className={cn(
                            'text-[10px] font-semibold tracking-wider',
                            isSelected ? 'text-background/70' : 'text-muted-foreground'
                          )}>
                            {group.code}_{group.master}
                          </div>
                          <div className={cn(
                            'text-sm font-medium mt-0.5 leading-snug',
                            isSelected ? 'text-background' : 'text-foreground'
                          )}>
                            {group.label}
                          </div>
                        </div>
                        <span className={cn(
                          'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border',
                          hasMaster
                            ? isSelected ? 'border-background/40 bg-background/20' : 'border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : isSelected ? 'border-background/40 bg-background/20' : 'border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                        )}>
                          {hasMaster ? '已有母版' : '缺母版'}
                        </span>
                      </div>
                      <p className={cn(
                        'text-[11px] leading-relaxed',
                        isSelected ? 'text-background/85' : 'text-muted-foreground'
                      )}>
                        <span className="block">比例：{group.ratioLabel}（{ratio.toFixed(2)} : 1）</span>
                        <span className="block mt-0.5">用途：{group.usage}</span>
                      </p>
                      <div className={cn(
                        'mt-2 text-[10px] font-medium',
                        isSelected ? 'text-background/80' : 'text-muted-foreground'
                      )}>
                        覆盖 {groupSizes.length} 个目标尺寸
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {groupSizes.slice(0, 6).map(size => (
                          <span
                            key={size.key}
                            className={cn(
                              'inline-flex font-mono text-[10px] px-1.5 py-0.5 rounded border',
                              isSelected
                                ? 'border-background/30 bg-background/15'
                                : 'border-border bg-muted/40 text-muted-foreground'
                            )}
                          >
                            {size.label}
                          </span>
                        ))}
                        {groupSizes.length > 6 && (
                          <span className={cn(
                            'inline-flex text-[10px] px-1.5 py-0.5 rounded border',
                            isSelected ? 'border-background/30 bg-background/15' : 'border-border text-muted-foreground'
                          )}>
                            +{groupSizes.length - 6}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Crop className="h-4 w-4 text-muted-foreground" />
                    尺寸预设
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {activeMasterGroup.label} · {scopeSizes.length} 个尺寸
                    {outputScope === 'manual' && ` · 已选 ${activeSizeList.length} 个`}
                    {' · '}预计输出 {totalOutputCount} 个
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <BannerSpecImportButton onImport={handleSpecImport} />
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-border/80" onClick={selectFilteredSizes}>
                    全选当前
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-border/80" onClick={clearFilteredSizes}>
                    取消当前
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs">
                <span className="text-muted-foreground">已选统计</span>
                <span><span className="font-semibold tabular-nums text-foreground">{selectedLandscapeCount}</span> 横版</span>
                <span className="text-border">|</span>
                <span><span className="font-semibold tabular-nums text-foreground">{selectedPortraitCount}</span> 竖版</span>
                <span className="text-border">|</span>
                <span><span className="font-semibold tabular-nums text-foreground">{selectedSquareCount}</span> 方图</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 items-center">
                <Select value={sizeFilter} onValueChange={(value) => setSizeFilter(value as SizeFilter)}>
                  <SelectTrigger className="h-8 rounded-lg text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部尺寸</SelectItem>
                    <SelectItem value="landscape">只看横版</SelectItem>
                    <SelectItem value="portrait">只看竖版</SelectItem>
                    <SelectItem value="square">只看方图</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative min-w-0">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-xs rounded-lg"
                    value={sizeSearch}
                    onChange={event => setSizeSearch(event.target.value)}
                    placeholder="搜索 1920x680"
                  />
                </div>
                <div className="flex gap-2 min-w-[140px]">
                  <Input
                    className="h-8 text-xs rounded-lg flex-1 min-w-0"
                    value={customSize}
                    onChange={event => setCustomSize(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') addCustomSize() }}
                    placeholder="宽x高"
                  />
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg shrink-0 border-border/80" onClick={addCustomSize}>
                    添加
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 min-[1728px]:grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredSizes.map(size => {
                  const checked = outputScope === 'autoMaster'
                    ? activeMasterGroup.sizes.includes(size.key)
                    : selectedSizes.has(size.key)
                  return (
                    <button
                      key={size.key}
                      type="button"
                      onClick={() => toggleSize(size.key)}
                      className={cn(
                        'h-8 px-2.5 rounded-lg border text-xs flex items-center justify-between gap-1.5 transition-all font-mono',
                        checked
                          ? 'border-foreground bg-foreground text-background shadow-sm'
                          : 'border-border/80 bg-card hover:border-foreground/40 hover:shadow-sm'
                      )}
                    >
                      <span className="truncate">{size.label}</span>
                      {checked && <Check className="h-3 w-3 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-muted-foreground" />
                    原图预览
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {sources.length > 0 ? (
                      <span className="tabular-nums">
                        <span className="font-medium text-foreground">{sources.length}</span> 张
                        <span className="mx-1.5 text-border">·</span>
                        {formatBytes(totalSourceSize)}
                      </span>
                    ) : '尚未上传原图'}
                  </CardDescription>
                </div>
                {sources.length > 0 && (
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-border/80" onClick={resetAll}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    清空
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {sources.length === 0 ? (
                <div className="h-48 flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                  先上传一张 Banner 原图
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 min-[1440px]:grid-cols-2 min-[1728px]:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
                  {sources.map(source => (
                    <div
                      key={source.id}
                      className="relative group rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden transition-shadow hover:shadow-md"
                    >
                      <div className="aspect-video bg-muted/40 flex items-center justify-center p-2">
                        <img src={source.previewUrl} alt={source.name} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="p-2.5 space-y-1.5 border-t border-border/60 bg-muted/10">
                        <div className="text-xs font-medium truncate" title={source.name}>{source.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="font-mono px-1.5 py-0.5 rounded border border-border bg-background">{source.width}×{source.height}</span>
                          <span className="truncate max-w-[120px] px-1.5 py-0.5 rounded border border-border bg-background" title={sourcePlanById.get(source.id)?.group.label || activeMasterGroup.label}>
                            {sourcePlanById.get(source.id)?.group.label || activeMasterGroup.label}
                          </span>
                          <span className="tabular-nums">{formatBytes(source.size)}</span>
                        </div>
                      </div>
                      <button
                        className="absolute top-2 right-2 h-6 w-6 rounded-full bg-foreground/80 text-background opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-sm"
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
            <Card className="rounded-xl border border-border/80 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-foreground" />
                      裁剪结果
                    </CardTitle>
                    <CardDescription className="text-xs tabular-nums">
                      <span className="font-medium text-foreground">{outputs.length}</span> 个文件
                      <span className="mx-1.5 text-border">·</span>
                      {formatBytes(totalOutputSize)}
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    className={cn(downloadBtnClass, 'bg-foreground text-background hover:bg-foreground/90')}
                    onClick={downloadZip}
                  >
                    <FileArchive className="h-3.5 w-3.5 mr-1.5" />
                    打包下载 ZIP（{outputs.length}）
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
                  {outputs.slice(0, 80).map(output => (
                    <div
                      key={output.id}
                      className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="h-14 w-20 rounded-lg bg-muted/40 border border-border/80 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={output.url} alt={output.name} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate font-mono" title={output.path}>{output.name}</div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground tabular-nums">
                          <span className="font-mono px-1 py-0.5 rounded border border-border">{output.width}×{output.height}</span>
                          <span>{formatBytes(output.blob.size)}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(downloadBtnClass, 'border-border/80')}
                        onClick={() => saveAs(output.blob, output.name)}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        下载
                      </Button>
                    </div>
                  ))}
                </div>
                {outputs.length > 80 && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    已生成 {outputs.length} 个文件，列表仅预览前 80 个，ZIP 包含全部。
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
