'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Archive, CheckCircle2, ClipboardPaste, Download, FileArchive,
  ImagePlus, Loader2, PackageOpen, RefreshCw, Upload, X
} from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface TransitSize {
  key: string
  width: number
  height: number
}

interface TransitAsset {
  id: string
  file: File
  name: string
  width: number
  height: number
  size: number
  previewUrl: string
  assignedAt: string
  valid: boolean
}

interface TransitPreset {
  id: string
  label: string
  description: string
  sizes: string[]
}

const TRANSIT_PRESETS: TransitPreset[] = [
  {
    id: 'm7',
    label: 'M7 超宽条幅母版',
    description: '雷电、MuMu 的超宽顶部 / 预约 / 背景图',
    sizes: [
      '2000x360',
      '2000x263',
      '1600x440',
      '1600x280',
      '1440x600',
      '1440x472',
      '1440x216',
      '1344x383',
      '1032x342',
    ],
  },
  {
    id: 'm6',
    label: 'M6 常规横 Banner 母版',
    description: '233、当乐、百度、4399 部分 Banner',
    sizes: [
      '1280x620',
      '1200x534',
      '720x360',
      '720x350',
      '656x320',
      '640x320',
      '644x260',
    ],
  },
  {
    id: 'm5',
    label: 'M5 横版 Banner 5 尺寸',
    description: '常规横图和 3:2 横图组合',
    sizes: [
      '2100x1180',
      '1920x900',
      '1242x699',
      '1200x700',
      '984x654',
    ],
  },
]

function parseSize(key: string): TransitSize | null {
  const match = key.trim().match(/^(\d{2,5})\s*[xX*×]\s*(\d{2,5})$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return null
  return { key: `${width}x${height}`, width, height }
}

function parseSizeText(text: string): TransitSize[] {
  const seen = new Set<string>()
  const sizes: TransitSize[] = []
  for (const match of text.matchAll(/(\d{2,5})\s*[xX*×]\s*(\d{2,5})/g)) {
    const size = parseSize(`${match[1]}x${match[2]}`)
    if (!size || seen.has(size.key)) continue
    seen.add(size.key)
    sizes.push(size)
  }
  return sizes
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'asset'
}

function getExtension(fileName: string) {
  const match = fileName.match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : 'png'
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = url
  })
}

async function readTransitAsset(file: File, required?: TransitSize): Promise<TransitAsset> {
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
      width,
      height,
      size: file.size,
      previewUrl,
      assignedAt: new Date().toISOString(),
      valid: required ? width === required.width && height === required.height : true,
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error
  }
}

export default function AssetTransitStationView() {
  const defaultPreset = TRANSIT_PRESETS[0]
  const [presetId, setPresetId] = useState(defaultPreset.id)
  const [customSizeText, setCustomSizeText] = useState(defaultPreset.sizes.join('\n'))
  const [slots, setSlots] = useState<Record<string, TransitAsset>>({})
  const [unmatched, setUnmatched] = useState<TransitAsset[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isZipping, setIsZipping] = useState(false)
  const bulkInputRef = useRef<HTMLInputElement | null>(null)
  const slotInputRef = useRef<HTMLInputElement | null>(null)
  const pendingSlotRef = useRef<string | null>(null)
  const slotsRef = useRef(slots)
  const unmatchedRef = useRef(unmatched)
  const dragCounterRef = useRef(0)
  const { toast } = useToast()

  const targetSizes = useMemo(() => {
    const sizes = parseSizeText(customSizeText)
    return sizes.length > 0 ? sizes : parseSizeText(defaultPreset.sizes.join('\n'))
  }, [customSizeText, defaultPreset.sizes])

  const sizeByKey = useMemo(() => new Map(targetSizes.map(size => [size.key, size])), [targetSizes])
  const filledCount = targetSizes.filter(size => slots[size.key]).length
  const validCount = targetSizes.filter(size => slots[size.key]?.valid).length
  const invalidCount = targetSizes.filter(size => slots[size.key] && !slots[size.key].valid).length
  const missingCount = Math.max(0, targetSizes.length - filledCount)
  const totalSize = Object.values(slots).reduce((sum, asset) => sum + asset.size, 0)

  useEffect(() => { slotsRef.current = slots }, [slots])
  useEffect(() => { unmatchedRef.current = unmatched }, [unmatched])
  useEffect(() => {
    return () => {
      Object.values(slotsRef.current).forEach(asset => URL.revokeObjectURL(asset.previewUrl))
      unmatchedRef.current.forEach(asset => URL.revokeObjectURL(asset.previewUrl))
    }
  }, [])

  const revokeAsset = (asset?: TransitAsset) => {
    if (asset) URL.revokeObjectURL(asset.previewUrl)
  }

  const clearAll = () => {
    Object.values(slots).forEach(revokeAsset)
    unmatched.forEach(revokeAsset)
    setSlots({})
    setUnmatched([])
  }

  const applyPreset = (nextPresetId: string) => {
    const preset = TRANSIT_PRESETS.find(item => item.id === nextPresetId) || defaultPreset
    setPresetId(preset.id)
    setCustomSizeText(preset.sizes.join('\n'))
    clearAll()
  }

  const resetFileInputs = () => {
    if (bulkInputRef.current) bulkInputRef.current.value = ''
    if (slotInputRef.current) slotInputRef.current.value = ''
  }

  const getFilesFromDataTransfer = (dataTransfer: DataTransfer) => {
    if (dataTransfer.files?.length > 0) return Array.from(dataTransfer.files)
    const files: File[] = []
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
    return files
  }

  const assignFiles = async (files: File[], forcedSlotKey?: string) => {
    const imageFiles = files.filter(file =>
      file.type.startsWith('image/') || /\.(png|jpe?g|jpeg|webp|gif|bmp)$/i.test(file.name)
    )

    if (imageFiles.length === 0) {
      toast({ title: '未识别到图片', description: '支持 PNG / JPG / WebP / GIF / BMP', variant: 'destructive' })
      resetFileInputs()
      return
    }

    setIsReading(true)
    let matched = 0
    let replaced = 0
    let invalid = 0
    const nextSlots = { ...slots }
    const nextUnmatched = [...unmatched]
    const errors: string[] = []

    for (const file of imageFiles) {
      try {
        const forcedSize = forcedSlotKey ? sizeByKey.get(forcedSlotKey) : undefined
        const asset = await readTransitAsset(file, forcedSize)
        const targetKey = forcedSlotKey || `${asset.width}x${asset.height}`
        const target = sizeByKey.get(targetKey)

        if (target) {
          asset.valid = asset.width === target.width && asset.height === target.height
          if (nextSlots[target.key]) {
            revokeAsset(nextSlots[target.key])
            replaced += 1
          }
          nextSlots[target.key] = asset
          matched += 1
          if (!asset.valid) invalid += 1
        } else {
          nextUnmatched.push(asset)
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : '读取失败'
        errors.push(`${file.name}: ${reason}`)
      }
    }

    setSlots(nextSlots)
    setUnmatched(nextUnmatched)
    setIsReading(false)
    resetFileInputs()

    toast({
      title: `已处理 ${imageFiles.length} 张`,
      description: `匹配 ${matched} 张${replaced ? `，替换 ${replaced} 张` : ''}${invalid ? `，${invalid} 张尺寸不符` : ''}${nextUnmatched.length ? `，未匹配 ${nextUnmatched.length} 张` : ''}`,
      variant: invalid || errors.length > 0 ? 'destructive' : undefined,
    })

    if (errors.length > 0) {
      toast({ title: `${errors.length} 张读取失败`, description: errors.slice(0, 2).join('；'), variant: 'destructive' })
    }
  }

  const openBulkPicker = () => {
    resetFileInputs()
    bulkInputRef.current?.click()
  }

  const openSlotPicker = (slotKey: string) => {
    pendingSlotRef.current = slotKey
    resetFileInputs()
    slotInputRef.current?.click()
  }

  const removeSlot = (slotKey: string) => {
    setSlots(prev => {
      const next = { ...prev }
      revokeAsset(next[slotKey])
      delete next[slotKey]
      return next
    })
  }

  const removeUnmatched = (assetId: string) => {
    setUnmatched(prev => {
      const target = prev.find(asset => asset.id === assetId)
      revokeAsset(target)
      return prev.filter(asset => asset.id !== assetId)
    })
  }

  const downloadZip = async () => {
    const validEntries = targetSizes
      .map(size => ({ size, asset: slots[size.key] }))
      .filter((entry): entry is { size: TransitSize; asset: TransitAsset } => Boolean(entry.asset && entry.asset.valid))

    if (validEntries.length === 0) {
      toast({ title: '没有可打包的素材', description: '请先上传尺寸匹配的图片', variant: 'destructive' })
      return
    }

    setIsZipping(true)
    try {
      const zip = new JSZip()
      for (const { size, asset } of validEntries) {
        const ext = getExtension(asset.name)
        zip.file(`${size.key}.${ext}`, asset.file)
      }

      const missing = targetSizes.filter(size => !slots[size.key]).map(size => size.key)
      const invalid = targetSizes
        .filter(size => slots[size.key] && !slots[size.key].valid)
        .map(size => `${size.key}: 当前 ${slots[size.key].width}x${slots[size.key].height}`)

      if (missing.length > 0 || invalid.length > 0 || unmatched.length > 0) {
        zip.file('_中转站检查结果.txt', [
          `已打包: ${validEntries.length} / ${targetSizes.length}`,
          missing.length ? `缺失尺寸:\n${missing.join('\n')}` : '',
          invalid.length ? `尺寸不符:\n${invalid.join('\n')}` : '',
          unmatched.length ? `未匹配文件:\n${unmatched.map(asset => `${asset.name} (${asset.width}x${asset.height})`).join('\n')}` : '',
        ].filter(Boolean).join('\n\n'))
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const preset = TRANSIT_PRESETS.find(item => item.id === presetId)
      saveAs(blob, `${sanitizeName(preset?.label || '素材中转站')}_${validEntries.length}files.zip`)
      toast({ title: `已打包 ${validEntries.length} 个素材`, description: missing.length ? `还有 ${missing.length} 个尺寸未上传` : undefined })
    } finally {
      setIsZipping(false)
    }
  }

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragCounterRef.current += 1
    setIsDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsDragging(false)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    void assignFiles(getFilesFromDataTransfer(event.dataTransfer))
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] px-4 py-5 space-y-4 min-[1440px]:px-6">
      <input
        ref={bulkInputRef}
        type="file"
        className="sr-only"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp"
        multiple
        onChange={event => void assignFiles(Array.from(event.target.files || []))}
      />
      <input
        ref={slotInputRef}
        type="file"
        className="sr-only"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp"
        onChange={event => {
          const slotKey = pendingSlotRef.current
          if (slotKey) void assignFiles(Array.from(event.target.files || []), slotKey)
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-foreground" />
            素材中转站
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            做好的素材先放到对应尺寸槽位，自动校验尺寸，再统一打包交付。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80" onClick={clearAll} disabled={filledCount === 0 && unmatched.length === 0}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            清空
          </Button>
          <Button size="sm" className="h-8 rounded-lg bg-foreground text-background hover:bg-foreground/90" onClick={downloadZip} disabled={validCount === 0 || isZipping}>
            {isZipping ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileArchive className="h-3.5 w-3.5 mr-1" />}
            打包下载 ZIP
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1440px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 min-[1440px]:sticky min-[1440px]:top-4 min-[1440px]:self-start">
          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Archive className="h-4 w-4 text-muted-foreground" />
                尺寸组
              </CardTitle>
              <CardDescription className="text-xs">默认 M7，也可以粘贴临时尺寸</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">常用模板</Label>
                <Select value={presetId} onValueChange={applyPreset}>
                  <SelectTrigger className="h-8 text-xs rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSIT_PRESETS.map(preset => (
                      <SelectItem key={preset.id} value={preset.id} className="text-xs">
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom" className="text-xs">自定义尺寸组</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">目标尺寸</Label>
                <Textarea
                  className="min-h-32 text-xs font-mono rounded-lg"
                  value={customSizeText}
                  onChange={event => {
                    clearAll()
                    setPresetId('custom')
                    setCustomSizeText(event.target.value)
                  }}
                />
              </div>
              <Button className="w-full h-9 rounded-lg" onClick={openBulkPicker} disabled={isReading}>
                {isReading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                批量选择图片
              </Button>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
                  <div className="text-lg font-semibold tabular-nums">{filledCount}/{targetSizes.length}</div>
                  <div className="text-[10px] text-muted-foreground">已上传</div>
                </div>
                <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
                  <div className="text-lg font-semibold tabular-nums text-emerald-600">{validCount}</div>
                  <div className="text-[10px] text-muted-foreground">可打包</div>
                </div>
                <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
                  <div className="text-lg font-semibold tabular-nums text-amber-600">{missingCount + invalidCount}</div>
                  <div className="text-[10px] text-muted-foreground">待处理</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                当前文件体积：<span className="font-mono text-foreground">{formatBytes(totalSize)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardContent className="p-4">
              <div
                className={cn(
                  'rounded-xl border border-dashed p-6 text-center transition-all',
                  isDragging ? 'border-foreground bg-muted/50' : 'border-border bg-muted/20 hover:border-foreground/40'
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Upload className="h-7 w-7 mx-auto text-muted-foreground" />
                <div className="text-sm font-medium mt-2">拖入做好的素材，自动按真实尺寸归位</div>
                <div className="text-xs text-muted-foreground mt-1">
                  例如 2000×360 的图片会自动放到 2000x360 槽位；尺寸不在清单里会进入未匹配区。
                </div>
                <Button variant="outline" size="sm" className="mt-3 h-8 rounded-lg border-border/80" onClick={openBulkPicker}>
                  <ImagePlus className="h-3.5 w-3.5 mr-1" />
                  选择图片
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">尺寸槽位</CardTitle>
                  <CardDescription className="text-xs">
                    绿色为尺寸匹配，红色为放错图或图尺寸不对。
                  </CardDescription>
                </div>
                <Badge variant="outline" className="rounded-full text-xs">
                  {validCount} 个可打包
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {targetSizes.map(size => {
                  const asset = slots[size.key]
                  const status = !asset ? 'missing' : asset.valid ? 'valid' : 'invalid'
                  return (
                    <div
                      key={size.key}
                      className={cn(
                        'rounded-xl border bg-card overflow-hidden shadow-sm',
                        status === 'valid' && 'border-emerald-500/45',
                        status === 'invalid' && 'border-destructive/60',
                        status === 'missing' && 'border-border/80'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                        <div className="font-mono text-sm font-semibold">{size.key}</div>
                        <Badge
                          variant={status === 'missing' ? 'outline' : 'secondary'}
                          className={cn(
                            'text-[10px] rounded-full',
                            status === 'valid' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
                            status === 'invalid' && 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          )}
                        >
                          {status === 'valid' ? '已匹配' : status === 'invalid' ? '尺寸不符' : '待上传'}
                        </Badge>
                      </div>
                      <div
                        className="h-32 bg-muted/30 flex items-center justify-center p-2 cursor-pointer"
                        onClick={() => openSlotPicker(size.key)}
                        onDragOver={handleDragOver}
                        onDrop={event => {
                          event.preventDefault()
                          event.stopPropagation()
                          void assignFiles(getFilesFromDataTransfer(event.dataTransfer), size.key)
                        }}
                      >
                        {asset ? (
                          <img src={asset.previewUrl} alt={asset.name} className="max-w-full max-h-full object-contain rounded-md" />
                        ) : (
                          <div className="text-center text-xs text-muted-foreground">
                            <ClipboardPaste className="h-5 w-5 mx-auto mb-1" />
                            点击或拖入此尺寸图片
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        {asset ? (
                          <>
                            <div className="text-xs font-medium truncate" title={asset.name}>{asset.name}</div>
                            <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                              <span className="font-mono rounded border border-border px-1.5 py-0.5">{asset.width}x{asset.height}</span>
                              <span className="rounded border border-border px-1.5 py-0.5">{formatBytes(asset.size)}</span>
                              {!asset.valid && (
                                <span className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  要求 {size.key}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-7 flex-1 text-xs rounded-lg border-border/80" onClick={() => openSlotPicker(size.key)}>
                                替换
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs rounded-lg border-border/80" onClick={() => removeSlot(size.key)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <Button variant="outline" size="sm" className="w-full h-7 text-xs rounded-lg border-border/80" onClick={() => openSlotPicker(size.key)}>
                            上传此尺寸
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {unmatched.length > 0 && (
            <Card className="rounded-xl border border-amber-500/30 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  未匹配素材
                </CardTitle>
                <CardDescription className="text-xs">
                  这些图片尺寸不在当前尺寸组里，不会进入 ZIP。
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {unmatched.map(asset => (
                    <div key={asset.id} className="flex items-center gap-3 rounded-lg border border-border/80 bg-card p-2">
                      <div className="h-12 w-20 rounded bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={asset.previewUrl} alt={asset.name} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate" title={asset.name}>{asset.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{asset.width}x{asset.height}</div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeUnmatched(asset.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {validCount} 个尺寸已就绪
              </span>
              <span className="text-muted-foreground">{missingCount} 个缺失</span>
              {invalidCount > 0 && <span className="text-destructive">{invalidCount} 个尺寸不符</span>}
            </div>
            <Button size="sm" className="h-8 rounded-lg bg-foreground text-background hover:bg-foreground/90" onClick={downloadZip} disabled={validCount === 0 || isZipping}>
              {isZipping ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              打包 {validCount} 个
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
