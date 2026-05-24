'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Crop, PlusCircle, Minus, Move, Maximize2, Upload, X, Download, FileDown,
  RotateCw, RotateCcw, FlipHorizontal2, FlipVertical2, Eye, Palette,
  Layers, Database, Loader2, Check, Sparkles, CornerDownRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

// ========== Types ==========
interface UploadedFile {
  id: string
  file: File
  name: string
  width: number
  height: number
  size: number
  img: HTMLImageElement
  dataUrl: string
}

interface SizeOption {
  label: string
  width: number
  height: number
  group: string
}

type ScaleMode = 'contain' | 'cover' | 'stretch'
type ZipStructure = 'byFile' | 'bySize'
type Rotation = 0 | 90 | 180 | 270

// ========== Preset Sizes ==========
const APP_ICON_SIZES: SizeOption[] = [
  { label: '1024x1024', width: 1024, height: 1024, group: 'App Icon' },
  { label: '512x512', width: 512, height: 512, group: 'App Icon' },
  { label: '192x192', width: 192, height: 192, group: 'App Icon' },
  { label: '180x180', width: 180, height: 180, group: 'App Icon' },
  { label: '152x152', width: 152, height: 152, group: 'App Icon' },
  { label: '144x144', width: 144, height: 144, group: 'App Icon' },
  { label: '120x120', width: 120, height: 120, group: 'App Icon' },
  { label: '96x96', width: 96, height: 96, group: 'App Icon' },
  { label: '72x72', width: 72, height: 72, group: 'App Icon' },
  { label: '64x64', width: 64, height: 64, group: 'App Icon' },
  { label: '48x48', width: 48, height: 48, group: 'App Icon' },
  { label: '36x36', width: 36, height: 36, group: 'App Icon' },
]

const GAME_CHANNEL_SIZES: SizeOption[] = [
  { label: '512x512', width: 512, height: 512, group: '游戏渠道' },
  { label: '256x256', width: 256, height: 256, group: '游戏渠道' },
  { label: '200x200', width: 200, height: 200, group: '游戏渠道' },
  { label: '180x180', width: 180, height: 180, group: '游戏渠道' },
  { label: '167x167', width: 167, height: 167, group: '游戏渠道' },
  { label: '152x152', width: 152, height: 152, group: '游戏渠道' },
  { label: '144x144', width: 144, height: 144, group: '游戏渠道' },
  { label: '128x128', width: 128, height: 128, group: '游戏渠道' },
  { label: '120x120', width: 120, height: 120, group: '游戏渠道' },
  { label: '108x108', width: 108, height: 108, group: '游戏渠道' },
  { label: '96x96', width: 96, height: 96, group: '游戏渠道' },
  { label: '90x90', width: 90, height: 90, group: '游戏渠道' },
  { label: '80x80', width: 80, height: 80, group: '游戏渠道' },
  { label: '72x72', width: 72, height: 72, group: '游戏渠道' },
  { label: '64x64', width: 64, height: 64, group: '游戏渠道' },
  { label: '48x48', width: 48, height: 48, group: '游戏渠道' },
  { label: '36x36', width: 36, height: 36, group: '游戏渠道' },
]

const BANNER_SIZES: SizeOption[] = [
  { label: '1200x628', width: 1200, height: 628, group: 'Banner / 推广图' },
  { label: '1080x1920', width: 1080, height: 1920, group: 'Banner / 推广图' },
  { label: '750x1334', width: 750, height: 1334, group: 'Banner / 推广图' },
  { label: '1920x1080', width: 1920, height: 1080, group: 'Banner / 推广图' },
  { label: '1280x720', width: 1280, height: 720, group: 'Banner / 推广图' },
  { label: '960x540', width: 960, height: 540, group: 'Banner / 推广图' },
  { label: '800x480', width: 800, height: 480, group: 'Banner / 推广图' },
  { label: '640x960', width: 640, height: 960, group: 'Banner / 推广图' },
  { label: '480x800', width: 480, height: 800, group: 'Banner / 推广图' },
]

// ========== Core Image Processing ==========
function autoTrimImage(
  imageData: ImageData,
  tolerance: number,
  padding: number
): { trimmed: ImageData; originalBounds: { x: number; y: number; w: number; h: number }; trimmedBounds: { x: number; y: number; w: number; h: number } } {
  const { width, height, data } = imageData
  const threshold = tolerance * 5
  let top = height, bottom = 0, left = width, right = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = data[i + 3]
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const isBackground = a < threshold || (r > 255 - threshold && g > 255 - threshold && b > 255 - threshold)
      if (!isBackground) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }

  if (top > bottom || left > right) {
    top = 0; bottom = height - 1; left = 0; right = width - 1
  }

  const originalBounds = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }

  const padTop = Math.min(padding, top)
  const padBottom = Math.min(padding, height - 1 - bottom)
  const padLeft = Math.min(padding, left)
  const padRight = Math.min(padding, width - 1 - right)

  const tLeft = left - padLeft
  const tTop = top - padTop
  const tW = (right - left + 1) + padLeft + padRight
  const tH = (bottom - top + 1) + padTop + padBottom

  const trimmedBounds = { x: tLeft, y: tTop, w: tW, h: tH }

  const canvas = document.createElement('canvas')
  canvas.width = tW
  canvas.height = tH
  const ctx = canvas.getContext('2d')!
  const trimmed = ctx.createImageData(tW, tH)

  for (let y = 0; y < tH; y++) {
    for (let x = 0; x < tW; x++) {
      const srcIdx = ((tTop + y) * width + (tLeft + x)) * 4
      const dstIdx = (y * tW + x) * 4
      trimmed.data[dstIdx] = data[srcIdx]
      trimmed.data[dstIdx + 1] = data[srcIdx + 1]
      trimmed.data[dstIdx + 2] = data[srcIdx + 2]
      trimmed.data[dstIdx + 3] = data[srcIdx + 3]
    }
  }

  return { trimmed, originalBounds, trimmedBounds }
}

function applyRotation(
  sourceCanvas: HTMLCanvasElement,
  rotation: Rotation,
  flipH: boolean,
  flipV: boolean
): HTMLCanvasElement {
  if (rotation === 0 && !flipH && !flipV) return sourceCanvas

  const srcW = sourceCanvas.width
  const srcH = sourceCanvas.height
  const isRotated = rotation === 90 || rotation === 270
  const outW = isRotated ? srcH : srcW
  const outH = isRotated ? srcW : srcH

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')!

  ctx.save()
  ctx.translate(outW / 2, outH / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  if (flipH) ctx.scale(-1, 1)
  if (flipV) ctx.scale(1, -1)
  ctx.drawImage(sourceCanvas, -srcW / 2, -srcH / 2)
  ctx.restore()

  return canvas
}

function applyRoundedCorners(
  sourceCanvas: HTMLCanvasElement,
  radius: number
): HTMLCanvasElement {
  if (radius <= 0) return sourceCanvas
  const { width, height } = sourceCanvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(width - r, 0)
  ctx.quadraticCurveTo(width, 0, width, r)
  ctx.lineTo(width, height - r)
  ctx.quadraticCurveTo(width, height, width - r, height)
  ctx.lineTo(r, height)
  ctx.quadraticCurveTo(0, height, 0, height - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(sourceCanvas, 0, 0)

  return canvas
}

function resizeImage(
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
  mode: ScaleMode,
  format: string,
  quality: number,
  bgColor: string
): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')!

    // Fill background
    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, targetWidth, targetHeight)
    } else if (format === 'image/png') {
      ctx.clearRect(0, 0, targetWidth, targetHeight)
    } else {
      // JPG/WebP with transparent bg => fill white
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, targetWidth, targetHeight)
    }

    const srcW = sourceCanvas.width
    const srcH = sourceCanvas.height

    // Enable high-quality downscaling
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    if (mode === 'stretch') {
      ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)
    } else if (mode === 'contain') {
      const scale = Math.min(targetWidth / srcW, targetHeight / srcH)
      const drawW = srcW * scale
      const drawH = srcH * scale
      const offsetX = (targetWidth - drawW) / 2
      const offsetY = (targetHeight - drawH) / 2
      ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH)
    } else {
      // cover
      const scale = Math.max(targetWidth / srcW, targetHeight / srcH)
      const drawW = srcW * scale
      const drawH = srcH * scale
      const offsetX = (targetWidth - drawW) / 2
      const offsetY = (targetHeight - drawH) / 2
      ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH)
    }

    canvas.toBlob(
      (blob) => resolve(blob!),
      format,
      quality
    )
  })
}

function getFormatExt(format: string) {
  if (format === 'image/png') return 'png'
  if (format === 'image/jpeg') return 'jpg'
  if (format === 'image/webp') return 'webp'
  return 'png'
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ========== Spec Import Button ==========
function SpecImportButton({ onImport }: { onImport: (sizes: SizeOption[]) => void }) {
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
        // Dedupe by size within channel
        const key = `${item.width}x${item.height}`
        if (!specMap[item.channel].find(s => `${s.width}x${s.height}` === key)) {
          specMap[item.channel].push({
            name: item.name,
            width: item.width,
            height: item.height,
            format: item.format,
          })
        }
      }
      setChannels(Array.from(channelSet).sort())
      ;(window as unknown as Record<string, unknown>).__specMap = specMap
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleOpen = () => {
    setOpen(true)
    if (channels.length === 0) loadChannels()
  }

  const handleSelectChannel = (ch: string) => {
    setSelectedChannel(ch)
    const specMap = (window as unknown as Record<string, unknown>).__specMap as Record<string, Array<{ name: string; width: number; height: number; format: string }>>
    if (specMap && specMap[ch]) {
      setSpecs(specMap[ch])
    } else {
      setSpecs([])
    }
  }

  const handleImportAll = () => {
    const sizes: SizeOption[] = specs.map(s => ({
      label: `${s.width}x${s.height}`,
      width: s.width,
      height: s.height,
      group: `规格库: ${selectedChannel}`,
    }))
    onImport(sizes)
    setOpen(false)
    setSelectedChannel('')
    setSpecs([])
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleOpen}>
        <Database className="h-3.5 w-3.5 mr-1" />
        从规格库导入
      </Button>
    )
  }

  return (
    <Card className="p-3 space-y-2">
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
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="选择渠道 ({channels.length} 个)" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {channels.map(ch => (
                <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>
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
                  {specs.slice(0, 30).map((s, i) => (
                    <Badge key={i} variant="outline" className="text-[9px] px-1 py-0">
                      {s.width}x{s.height}
                    </Badge>
                  ))}
                  {specs.length > 30 && (
                    <span className="text-[9px] text-muted-foreground">+{specs.length - 30} 个</span>
                  )}
                </div>
              </div>
              <Button size="sm" className="w-full h-7 text-xs" onClick={handleImportAll}>
                导入全部 {specs.length} 个尺寸
              </Button>
            </>
          )}
        </>
      )}
    </Card>
  )
}

// ========== Main Component ==========
export default function IconCropView() {
  const { toast } = useToast()

  // File state
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)

  // Trim settings
  const [padding, setPadding] = useState(0)
  const [tolerance, setTolerance] = useState(10)
  const [enableAutoTrim, setEnableAutoTrim] = useState(true)

  // Transform settings
  const [rotation, setRotation] = useState<Rotation>(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)

  // Output settings
  const [outputFormat, setOutputFormat] = useState('image/png')
  const [outputQuality, setOutputQuality] = useState(0.92)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('contain')
  const [bgColor, setBgColor] = useState('transparent')
  const [enableRoundedCorners, setEnableRoundedCorners] = useState(false)
  const [cornerRadius, setCornerRadius] = useState(22)

  // Size settings
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set())
  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')
  const [customSizes, setCustomSizes] = useState<SizeOption[]>([])
  const [specSizes, setSpecSizes] = useState<SizeOption[]>([])
  const [zipStructure, setZipStructure] = useState<ZipStructure>('byFile')

  // Read preset sizes from production board (localStorage bridge)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('qdsc_crop_sizes')
      if (stored) {
        const sizes: Array<{width: number; height: number; format?: string}> = JSON.parse(stored)
        if (Array.isArray(sizes) && sizes.length > 0) {
          const newSizes: SizeOption[] = sizes
            .filter(s => s.width > 0 && s.height > 0)
            .map(s => ({
              label: `${s.width}x${s.height}`,
              width: s.width,
              height: s.height,
              group: '生产看板预设',
            }))
          setCustomSizes(prev => {
            const existingLabels = new Set(prev.map(s => s.label))
            const unique = newSizes.filter(s => !existingLabels.has(s.label))
            return unique.length > 0 ? [...prev, ...unique] : prev
          })
          localStorage.removeItem('qdsc_crop_sizes') // Clean up after reading
          toast({
            title: `已加载 ${newSizes.length} 个预设尺寸`,
            description: '来自生产看板的尺寸已添加到输出列表',
          })
        }
      }
    } catch {}
  }, [])

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const allSizes = useMemo(() =>
    [...APP_ICON_SIZES, ...GAME_CHANNEL_SIZES, ...BANNER_SIZES, ...customSizes, ...specSizes],
    [customSizes, specSizes]
  )

  const sizeGroups = useMemo(() => {
    const groups: Record<string, SizeOption[]> = {}
    const seen = new Set<string>()
    for (const s of allSizes) {
      if (!groups[s.group]) groups[s.group] = []
      const dedupeKey = `${s.group}:${s.label}`
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey)
        groups[s.group].push(s)
      }
    }
    return groups
  }, [allSizes])

  // File handlers
  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const accepted = Array.from(fileList).filter(f =>
      ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type)
    )
    const newFiles: UploadedFile[] = []
    for (const file of accepted) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const img = await new Promise<HTMLImageElement>((resolve) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.src = dataUrl
      })
      newFiles.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: file.size,
        img,
        dataUrl,
      })
    }
    setFiles(prev => [...prev, ...newFiles])
    if (newFiles.length > 0) {
      setSelectedFileIds(prev => {
        const next = new Set(prev)
        for (const f of newFiles) next.add(f.id)
        return next
      })
      setPreviewFileId(prev => prev || newFiles[0].id)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
    setSelectedFileIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setPreviewFileId(prev => prev === id ? null : prev)
  }, [])

  const toggleSelectFile = useCallback((id: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Size handlers
  const toggleSize = useCallback((key: string) => {
    setSelectedSizes(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAllGroup = useCallback((group: string) => {
    setSelectedSizes(prev => {
      const next = new Set(prev)
      const groupSizes = allSizes.filter(s => s.group === group)
      const allSelected = groupSizes.every(s => next.has(s.label))
      for (const s of groupSizes) {
        if (allSelected) next.delete(s.label)
        else next.add(s.label)
      }
      return next
    })
  }, [allSizes])

  const addCustomSize = useCallback(() => {
    const w = parseInt(customWidth)
    const h = parseInt(customHeight)
    if (!w || !h || w <= 0 || h <= 0) {
      toast({ title: '请输入有效的宽高', variant: 'destructive' })
      return
    }
    const label = `${w}x${h}`
    if (customSizes.find(s => s.label === label)) {
      toast({ title: '该尺寸已存在', variant: 'destructive' })
      return
    }
    setCustomSizes(prev => [...prev, { label, width: w, height: h, group: '自定义尺寸' }])
    setCustomWidth('')
    setCustomHeight('')
  }, [customWidth, customHeight, customSizes, toast])

  const removeCustomSize = useCallback((label: string) => {
    setCustomSizes(prev => prev.filter(s => s.label !== label))
    setSelectedSizes(prev => {
      const next = new Set(prev)
      next.delete(label)
      return next
    })
  }, [])

  const handleSpecImport = useCallback((sizes: SizeOption[]) => {
    setSpecSizes(prev => {
      const existing = new Set(prev.map(s => s.label))
      const newOnes = sizes.filter(s => !existing.has(s.label))
      if (newOnes.length === 0) {
        toast({ title: '所有尺寸已存在', variant: 'destructive' })
        return prev
      }
      toast({ title: `已导入 ${newOnes.length} 个尺寸` })
      return [...prev, ...newOnes]
    })
    // Auto-select all imported sizes
    setSelectedSizes(prev => {
      const next = new Set(prev)
      for (const s of sizes) next.add(s.label)
      return next
    })
  }, [toast])

  // Transform handlers
  const rotateCW = useCallback(() => {
    setRotation(prev => ((prev + 90) % 360) as Rotation)
  }, [])
  const rotateCCW = useCallback(() => {
    setRotation(prev => ((prev + 270) % 360) as Rotation)
  }, [])
  const toggleFlipH = useCallback(() => setFlipH(prev => !prev), [])
  const toggleFlipV = useCallback(() => setFlipV(prev => !prev), [])
  const resetTransform = useCallback(() => {
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
  }, [])

  // Compute trimmed canvas for a file (with rotation applied)
  const getProcessedCanvas = useCallback((f: UploadedFile) => {
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = f.width
    srcCanvas.height = f.height
    const ctx = srcCanvas.getContext('2d')!
    ctx.drawImage(f.img, 0, 0)

    // Apply rotation/flip
    const rotated = applyRotation(srcCanvas, rotation, flipH, flipV)

    if (enableAutoTrim) {
      const rCtx = rotated.getContext('2d')!
      const imageData = rCtx.getImageData(0, 0, rotated.width, rotated.height)
      const { trimmed } = autoTrimImage(imageData, tolerance, padding)

      const trimmedCanvas = document.createElement('canvas')
      trimmedCanvas.width = trimmed.width
      trimmedCanvas.height = trimmed.height
      const tCtx = trimmedCanvas.getContext('2d')!
      tCtx.putImageData(trimmed, 0, 0)
      return trimmedCanvas
    }

    return rotated
  }, [rotation, flipH, flipV, enableAutoTrim, tolerance, padding])

  // Preview trim result
  const trimResult = useMemo(() => {
    if (!previewFileId) return null
    const f = files.find(x => x.id === previewFileId)
    if (!f) return null

    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = f.width
    srcCanvas.height = f.height
    const ctx = srcCanvas.getContext('2d')!
    ctx.drawImage(f.img, 0, 0)

    const rotated = applyRotation(srcCanvas, rotation, flipH, flipV)

    if (!enableAutoTrim) {
      return {
        originalBounds: { x: 0, y: 0, w: rotated.width, h: rotated.height },
        trimmedBounds: { x: 0, y: 0, w: rotated.width, h: rotated.height },
        rotatedWidth: rotated.width,
        rotatedHeight: rotated.height,
      }
    }

    const rCtx = rotated.getContext('2d')!
    const imageData = rCtx.getImageData(0, 0, rotated.width, rotated.height)
    const result = autoTrimImage(imageData, tolerance, padding)
    return {
      originalBounds: result.originalBounds,
      trimmedBounds: result.trimmedBounds,
      rotatedWidth: rotated.width,
      rotatedHeight: rotated.height,
    }
  }, [previewFileId, files, rotation, flipH, flipV, enableAutoTrim, tolerance, padding])

  // Generate outputs
  const handleGenerate = useCallback(async () => {
    const selectedFiles = files.filter(f => selectedFileIds.has(f.id))
    const selectedSizeOptions = allSizes.filter(s => selectedSizes.has(s.label))
    if (selectedFiles.length === 0) {
      toast({ title: '请至少选择一张图片', variant: 'destructive' })
      return
    }
    if (selectedSizeOptions.length === 0) {
      toast({ title: '请至少选择一个输出尺寸', variant: 'destructive' })
      return
    }

    setGenerating(true)
    const totalOps = selectedFiles.length * selectedSizeOptions.length
    setProgressTotal(totalOps)
    setProgress(0)

    try {
      if (totalOps === 1) {
        const f = selectedFiles[0]
        const s = selectedSizeOptions[0]
        let processedCanvas = getProcessedCanvas(f)
        if (enableRoundedCorners) {
          processedCanvas = applyRoundedCorners(processedCanvas, cornerRadius * Math.min(s.width, s.height) / 100)
        }
        const blob = await resizeImage(processedCanvas, s.width, s.height, scaleMode, outputFormat, outputQuality, bgColor)
        const ext = getFormatExt(outputFormat)
        const baseName = f.name.replace(/\.[^.]+$/, '')
        saveAs(blob, `${baseName}_${s.width}x${s.height}.${ext}`)
        toast({ title: '下载完成' })
      } else {
        const zip = new JSZip()
        let done = 0

        for (const f of selectedFiles) {
          let processedCanvas = getProcessedCanvas(f)
          const baseName = f.name.replace(/\.[^.]+$/, '')

          for (const s of selectedSizeOptions) {
            let canvas = processedCanvas
            if (enableRoundedCorners) {
              canvas = applyRoundedCorners(canvas, cornerRadius * Math.min(s.width, s.height) / 100)
            }
            const blob = await resizeImage(canvas, s.width, s.height, scaleMode, outputFormat, outputQuality, bgColor)
            const ext = getFormatExt(outputFormat)

            if (zipStructure === 'byFile') {
              zip.file(`${baseName}/${baseName}_${s.width}x${s.height}.${ext}`, blob)
            } else {
              zip.file(`${s.width}x${s.height}/${baseName}_${s.width}x${s.height}.${ext}`, blob)
            }
            done++
            setProgress(done)
          }
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        saveAs(zipBlob, `icon_crop_${Date.now()}.zip`)
        toast({ title: `已生成 ${done} 个文件并打包下载` })
      }
    } catch (err) {
      toast({ title: '生成失败', description: String(err), variant: 'destructive' })
    }
    setGenerating(false)
    setProgress(0)
    setProgressTotal(0)
  }, [files, selectedFileIds, selectedSizes, allSizes, getProcessedCanvas, enableRoundedCorners, cornerRadius, scaleMode, outputFormat, outputQuality, bgColor, zipStructure, toast])

  const selectedFiles = files.filter(f => selectedFileIds.has(f.id))
  const selectedSizeOptions = allSizes.filter(s => selectedSizes.has(s.label))
  const totalOutput = selectedFiles.length * selectedSizeOptions.length

  // Preview file
  const previewFile = files.find(f => f.id === previewFileId)

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Crop className="h-5 w-5 text-primary" />
            Icon 裁剪
          </h2>
          <p className="text-xs text-muted-foreground">上传图标，自动去除透明/白色边框，批量输出多尺寸</p>
        </div>
        {files.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {selectedFiles.length} 图 / {selectedSizeOptions.length} 尺寸 / {totalOutput} 输出
            </Badge>
          </div>
        )}
      </div>

      {files.length === 0 ? (
        /* ========== Empty State ========== */
        <Card className="p-8">
          <div
            className="border-2 border-dashed rounded-xl p-16 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <div className="text-base font-medium">拖拽图片到此处，或点击上传</div>
            <div className="text-sm text-muted-foreground mt-2">支持 PNG / JPG / WebP / GIF，可多选</div>
            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Crop className="h-3.5 w-3.5" /> 自动裁剪</span>
              <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> 圆角输出</span>
              <span className="flex items-center gap-1"><RotateCw className="h-3.5 w-3.5" /> 旋转翻转</span>
              <span className="flex items-center gap-1"><Database className="h-3.5 w-3.5" /> 规格库导入</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </Card>
      ) : (
        /* ========== Working State ========== */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left Column: File List */}
          <div className="xl:col-span-3 space-y-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">图片列表 ({files.length})</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={() => fileInputRef.current?.click()}>
                      <PlusCircle className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-1.5"
                      onClick={() => { setFiles([]); setSelectedFileIds(new Set()); setPreviewFileId(null) }}
                    >
                      清空
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="max-h-[calc(100vh-280px)] overflow-y-auto space-y-1.5 pr-1">
                  {files.map(f => (
                    <div
                      key={f.id}
                      className={`flex items-center gap-2 p-1.5 rounded-md border cursor-pointer transition-colors text-xs ${
                        previewFileId === f.id
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                      onClick={() => setPreviewFileId(f.id)}
                    >
                      <Checkbox
                        checked={selectedFileIds.has(f.id)}
                        onCheckedChange={() => toggleSelectFile(f.id)}
                        onClick={e => e.stopPropagation()}
                        className="shrink-0"
                      />
                      <img
                        src={f.dataUrl}
                        alt={f.name}
                        className="w-8 h-8 object-contain rounded border bg-muted/30 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{f.name}</div>
                        <div className="text-muted-foreground text-[10px]">{f.width}x{f.height} · {formatFileSize(f.size)}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 shrink-0"
                        onClick={e => { e.stopPropagation(); removeFile(f.id) }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Middle Column: Settings */}
          <div className="xl:col-span-5 space-y-4">
            {/* Auto-Trim + Transform */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Crop className="h-4 w-4" />
                  裁剪 & 变换
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {/* Auto-trim toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-medium">自动裁剪</Label>
                    <p className="text-[10px] text-muted-foreground">去除透明/白色边框</p>
                  </div>
                  <Switch checked={enableAutoTrim} onCheckedChange={setEnableAutoTrim} />
                </div>

                {enableAutoTrim && (
                  <div className="space-y-3 pl-2 border-l-2 border-primary/20 ml-1">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">内边距 (Padding)</Label>
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 rounded">{padding}px</span>
                      </div>
                      <Slider value={[padding]} min={0} max={50} step={1} onValueChange={v => setPadding(v[0])} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">容差 (Tolerance)</Label>
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 rounded">{tolerance}</span>
                      </div>
                      <Slider value={[tolerance]} min={1} max={50} step={1} onValueChange={v => setTolerance(v[0])} />
                      <p className="text-[10px] text-muted-foreground">越高越积极去除边框背景色</p>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Rotation & Flip */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">旋转 & 翻转</Label>
                    {(rotation !== 0 || flipH || flipV) && (
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={resetTransform}>
                        重置
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant={rotation !== 0 ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={rotateCCW}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">逆时针旋转</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant={rotation !== 0 ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={rotateCW}>
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">顺时针旋转</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant={flipH ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={toggleFlipH}>
                            <FlipHorizontal2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">水平翻转</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant={flipV ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={toggleFlipV}>
                            <FlipVertical2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">垂直翻转</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {rotation !== 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">{rotation}°</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Output Settings */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Maximize2 className="h-4 w-4" />
                  输出设置
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {/* Scale mode */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">缩放模式</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { value: 'contain' as const, label: '等比适应', icon: '☐' },
                      { value: 'cover' as const, label: '等比填充', icon: '▣' },
                      { value: 'stretch' as const, label: '拉伸填充', icon: '▩' },
                    ]).map(m => (
                      <button
                        key={m.value}
                        onClick={() => setScaleMode(m.value)}
                        className={`p-2 rounded-md border text-xs transition-colors text-center ${
                          scaleMode === m.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-muted hover:bg-muted/50'
                        }`}
                      >
                        <div className="text-lg leading-none mb-1">{m.icon}</div>
                        <div className="font-medium">{m.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Background color */}
                {scaleMode === 'contain' && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">背景色</Label>
                    <div className="flex items-center gap-2">
                      {[
                        { value: 'transparent', label: '透明', color: 'bg-[conic-gradient(#ccc_25%,#fff_25%_50%,#ccc_50%_75%,#fff_75%)]' },
                        { value: '#ffffff', label: '白色', color: 'bg-white border' },
                        { value: '#000000', label: '黑色', color: 'bg-black' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setBgColor(opt.value)}
                          className={`w-7 h-7 rounded-md ${opt.color} ${bgColor === opt.value ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                          title={opt.label}
                        />
                      ))}
                      <div className="relative">
                        <input
                          type="color"
                          value={bgColor.startsWith('#') ? bgColor : '#ffffff'}
                          onChange={e => setBgColor(e.target.value)}
                          className="absolute inset-0 w-7 h-7 opacity-0 cursor-pointer"
                        />
                        <div
                          className={`w-7 h-7 rounded-md border ${bgColor.startsWith('#') && !['#ffffff', '#000000'].includes(bgColor) ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                          style={{ backgroundColor: bgColor.startsWith('#') ? bgColor : '#ff0000' }}
                          title="自定义颜色"
                        >
                          <Palette className="h-3 w-3 text-white/70 mx-auto mt-1.5" />
                        </div>
                      </div>
                      {bgColor.startsWith('#') && !['#ffffff', '#000000'].includes(bgColor) && (
                        <span className="text-[10px] font-mono text-muted-foreground">{bgColor}</span>
                      )}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Rounded corners */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium">圆角输出</Label>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">App Icon</Badge>
                    </div>
                    <Switch checked={enableRoundedCorners} onCheckedChange={setEnableRoundedCorners} />
                  </div>
                  {enableRoundedCorners && (
                    <div className="space-y-1.5 pl-2 border-l-2 border-primary/20 ml-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">圆角半径</Label>
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 rounded">{cornerRadius}%</span>
                      </div>
                      <Slider value={[cornerRadius]} min={5} max={50} step={1} onValueChange={v => setCornerRadius(v[0])} />
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>方角 5%</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full relative">
                          <div className="absolute left-0 top-0 h-full bg-primary rounded-full" style={{ width: `${((cornerRadius - 5) / 45) * 100}%` }} />
                        </div>
                        <span>圆形 50%</span>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Format & Quality */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">输出格式</Label>
                    <Select value={outputFormat} onValueChange={v => setOutputFormat(v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image/png">PNG (无损)</SelectItem>
                        <SelectItem value="image/jpeg">JPG (有损)</SelectItem>
                        <SelectItem value="image/webp">WebP (高效)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {outputFormat !== 'image/png' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">质量</Label>
                        <span className="text-xs font-mono text-muted-foreground">{Math.round(outputQuality * 100)}%</span>
                      </div>
                      <Slider value={[outputQuality]} min={0.1} max={1} step={0.05} onValueChange={v => setOutputQuality(v[0])} />
                    </div>
                  )}
                </div>

                <Separator />

                {/* ZIP structure */}
                <div className="space-y-1.5">
                  <Label className="text-xs">ZIP 打包方式</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { value: 'byFile' as const, label: '按文件分组', desc: 'icon/icon_512x512.png' },
                      { value: 'bySize' as const, label: '按尺寸分组', desc: '512x512/icon_512x512.png' },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setZipStructure(opt.value)}
                        className={`p-2 rounded-md border text-xs text-left transition-colors ${
                          zipStructure === opt.value
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:bg-muted/50'
                        }`}
                      >
                        <div className="font-medium">{opt.label}</div>
                        <div className="text-muted-foreground text-[10px]">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Output Sizes & Actions */}
          <div className="xl:col-span-4 space-y-4">
            {/* Output Sizes */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">输出尺寸</CardTitle>
                    <CardDescription className="text-xs">已选 {selectedSizes.size} 个尺寸</CardDescription>
                  </div>
                  <SpecImportButton onImport={handleSpecImport} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="max-h-[calc(100vh-520px)] overflow-y-auto space-y-3 pr-1">
                  {Object.entries(sizeGroups).map(([group, sizes]) => (
                    <div key={group}>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs font-medium">{group}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[10px] px-1.5"
                          onClick={() => selectAllGroup(group)}
                        >
                          {sizes.every(s => selectedSizes.has(s.label)) ? '取消全选' : '全选'}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sizes.map(s => (
                          <Badge
                            key={`${s.group}-${s.label}`}
                            variant={selectedSizes.has(s.label) ? 'default' : 'outline'}
                            className="cursor-pointer text-[10px] px-1.5 py-0 select-none transition-colors"
                            onClick={() => toggleSize(s.label)}
                          >
                            {s.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Custom size input */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">自定义尺寸</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      className="h-7 text-xs w-20"
                      placeholder="宽"
                      value={customWidth}
                      onChange={e => setCustomWidth(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && addCustomSize()}
                    />
                    <span className="text-xs text-muted-foreground font-medium">x</span>
                    <Input
                      className="h-7 text-xs w-20"
                      placeholder="高"
                      value={customHeight}
                      onChange={e => setCustomHeight(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && addCustomSize()}
                    />
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={addCustomSize}>
                      <PlusCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {customSizes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {customSizes.map(s => (
                        <Badge
                          key={s.label}
                          variant={selectedSizes.has(s.label) ? 'default' : 'outline'}
                          className="cursor-pointer text-[10px] px-1.5 py-0 select-none"
                          onClick={() => toggleSize(s.label)}
                        >
                          {s.label}
                          <X
                            className="h-2.5 w-2.5 ml-1 cursor-pointer"
                            onClick={e => { e.stopPropagation(); removeCustomSize(s.label) }}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Generate Button */}
            <Card className="p-4">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <div className="text-lg font-bold">{selectedFiles.length}</div>
                    <div className="text-[10px] text-muted-foreground">图片</div>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50">
                    <div className="text-lg font-bold">{selectedSizeOptions.length}</div>
                    <div className="text-[10px] text-muted-foreground">尺寸</div>
                  </div>
                  <div className="p-2 rounded-lg bg-primary/10">
                    <div className="text-lg font-bold text-primary">{totalOutput}</div>
                    <div className="text-[10px] text-muted-foreground">输出</div>
                  </div>
                </div>
                {generating && progressTotal > 0 && (
                  <div className="space-y-1">
                    <Progress value={(progress / progressTotal) * 100} className="h-1.5" />
                    <div className="text-[10px] text-muted-foreground text-center">
                      处理中 {progress}/{progressTotal}
                    </div>
                  </div>
                )}
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating || selectedFiles.length === 0 || selectedSizeOptions.length === 0}
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      生成中...
                    </>
                  ) : totalOutput <= 1 ? (
                    <>
                      <Download className="h-4 w-4 mr-1" />
                      直接下载
                    </>
                  ) : (
                    <>
                      <FileDown className="h-4 w-4 mr-1" />
                      打包下载 ZIP ({totalOutput} 个文件)
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ========== Preview Section ========== */}
      {previewFile && trimResult && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              裁剪预览 · {previewFile.name}
              {enableRoundedCorners && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                  <CornerDownRight className="h-2.5 w-2.5 mr-0.5" /> 圆角 {cornerRadius}%
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Original with trim area */}
              <div className="space-y-2">
                <div className="text-xs font-medium">原始 + 裁剪区域</div>
                <div className="border rounded-md p-2 bg-muted/30">
                  <canvas
                    ref={canvasEl => {
                      if (!canvasEl) return
                      const f = previewFile
                      const srcCanvas = document.createElement('canvas')
                      srcCanvas.width = f.width
                      srcCanvas.height = f.height
                      const ctx = srcCanvas.getContext('2d')!
                      ctx.drawImage(f.img, 0, 0)
                      const rotated = applyRotation(srcCanvas, rotation, flipH, flipV)

                      canvasEl.width = rotated.width
                      canvasEl.height = rotated.height
                      const canvasCtx = canvasEl.getContext('2d')!
                      canvasCtx.drawImage(rotated, 0, 0)

                      if (enableAutoTrim) {
                        canvasCtx.strokeStyle = '#ef4444'
                        canvasCtx.lineWidth = Math.max(2, Math.round(Math.min(rotated.width, rotated.height) / 200))
                        canvasCtx.setLineDash([8, 4])
                        const tb = trimResult.trimmedBounds
                        canvasCtx.strokeRect(tb.x, tb.y, tb.w, tb.h)
                      }
                    }}
                    className="max-w-full max-h-48 object-contain mx-auto"
                  />
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  {trimResult.rotatedWidth} x {trimResult.rotatedHeight}
                  {rotation !== 0 && <span className="ml-1 text-primary">({rotation}°)</span>}
                </div>
              </div>

              {/* Trimmed result */}
              <div className="space-y-2">
                <div className="text-xs font-medium">裁剪结果</div>
                <div className="border rounded-md p-2 bg-muted/30">
                  <canvas
                    ref={canvasEl => {
                      if (!canvasEl) return
                      const f = previewFile
                      const srcCanvas = document.createElement('canvas')
                      srcCanvas.width = f.width
                      srcCanvas.height = f.height
                      const ctx = srcCanvas.getContext('2d')!
                      ctx.drawImage(f.img, 0, 0)
                      const rotated = applyRotation(srcCanvas, rotation, flipH, flipV)
                      const processedCanvas = getProcessedCanvas(f)

                      canvasEl.width = processedCanvas.width
                      canvasEl.height = processedCanvas.height
                      const canvasCtx = canvasEl.getContext('2d')!
                      canvasCtx.drawImage(processedCanvas, 0, 0)
                    }}
                    className="max-w-full max-h-48 object-contain mx-auto"
                  />
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  {trimResult.trimmedBounds.w} x {trimResult.trimmedBounds.h}
                </div>
              </div>

              {/* Output preview + stats */}
              <div className="space-y-2">
                <div className="text-xs font-medium">输出预览</div>
                <div className="border rounded-md p-2 bg-muted/30">
                  {selectedSizeOptions.length > 0 ? (() => {
                    const previewSize = selectedSizeOptions[0]
                    return (
                      <canvas
                        ref={async (canvasEl) => {
                          if (!canvasEl) return
                          const f = previewFile
                          let processedCanvas = getProcessedCanvas(f)
                          if (enableRoundedCorners) {
                            processedCanvas = applyRoundedCorners(processedCanvas, cornerRadius * Math.min(previewSize.width, previewSize.height) / 100)
                          }
                          const blob = await resizeImage(processedCanvas, previewSize.width, previewSize.height, scaleMode, outputFormat, outputQuality, bgColor)
                          const url = URL.createObjectURL(blob)
                          const img = new Image()
                          img.onload = () => {
                            canvasEl.width = img.naturalWidth
                            canvasEl.height = img.naturalHeight
                            const ctx = canvasEl.getContext('2d')!
                            ctx.drawImage(img, 0, 0)
                            URL.revokeObjectURL(url)
                          }
                          img.src = url
                        }}
                        className="max-w-full max-h-48 object-contain mx-auto"
                      />
                    )
                  })() : (
                    <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
                      请选择输出尺寸
                    </div>
                  )}
                </div>
                {selectedSizeOptions.length > 0 && (
                  <div className="text-xs text-muted-foreground text-center">
                    {selectedSizeOptions[0].width}x{selectedSizeOptions[0].height}
                    {selectedSizeOptions.length > 1 && <span className="text-muted-foreground"> +{selectedSizeOptions.length - 1}</span>}
                  </div>
                )}

                {/* Stats */}
                <div className="p-2 rounded bg-muted/50 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">原始尺寸</span>
                    <span className="font-mono">{trimResult.rotatedWidth} x {trimResult.rotatedHeight}</span>
                  </div>
                  {enableAutoTrim && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">内容区域</span>
                        <span className="font-mono">{trimResult.originalBounds.w} x {trimResult.originalBounds.h}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">裁剪结果</span>
                        <span className="font-mono">{trimResult.trimmedBounds.w} x {trimResult.trimmedBounds.h}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">像素节省</span>
                        {(() => {
                          const originalPixels = trimResult.rotatedWidth * trimResult.rotatedHeight
                          const trimmedPixels = trimResult.trimmedBounds.w * trimResult.trimmedBounds.h
                          const savedPct = originalPixels > 0 ? Math.round((1 - trimmedPixels / originalPixels) * 100) : 0
                          return (
                            <span className={`font-bold ${savedPct > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {Math.max(savedPct, 0)}%
                            </span>
                          )
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
