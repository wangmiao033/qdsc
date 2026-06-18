'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2, Download, FileArchive, ImagePlus, Loader2, RefreshCw,
  Settings2, Upload, X, Zap
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

type ResizeMode = 'cover' | 'contain' | 'stretch'
type OutputFormat = 'png' | 'jpeg' | 'webp'
type BackgroundMode = 'transparent' | 'white' | 'black' | 'custom'
type NamingMode = 'suffix' | 'replace'

interface SourceImage {
  id: string
  file: File
  name: string
  baseName: string
  sourceFormat: string
  width: number
  height: number
  size: number
  previewUrl: string
}

interface ResizeOutput {
  id: string
  sourceId: string
  name: string
  width: number
  height: number
  format: OutputFormat
  size: number
  blob: Blob
  url: string
}

interface FailedImage {
  sourceName: string
  message: string
}

const FORMAT_LABELS: Record<OutputFormat, string> = {
  png: 'PNG',
  jpeg: 'JPG',
  webp: 'WebP',
}

const SIZE_PRESETS = [
  '512x512',
  '800x450',
  '1080x608',
  '1280x720',
  '1920x1080',
  '750x1334',
  '1080x1920',
  '1024x1024',
]

function getBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

function getFileExtension(name: string) {
  return name.split('.').pop()?.toUpperCase() || '未知'
}

function getMimeType(format: OutputFormat) {
  if (format === 'png') return 'image/png'
  if (format === 'jpeg') return 'image/jpeg'
  return 'image/webp'
}

function getExtension(format: OutputFormat) {
  return format === 'jpeg' ? 'jpg' : format
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = url
  })
}

async function readSourceImage(file: File): Promise<SourceImage> {
  const previewUrl = URL.createObjectURL(file)
  try {
    const image = await loadImageElement(previewUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('无法读取图片尺寸')
    return {
      id: `${file.name}-${file.lastModified}-${file.size}-${crypto.randomUUID()}`,
      file,
      name: file.name,
      baseName: getBaseName(file.name),
      sourceFormat: getFileExtension(file.name),
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

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('图片编码失败'))
    }, mimeType, quality)
  })
}

function getUniqueName(name: string, usedNames: Set<string>) {
  if (!usedNames.has(name)) {
    usedNames.add(name)
    return name
  }
  const dotIndex = name.lastIndexOf('.')
  const stem = dotIndex >= 0 ? name.slice(0, dotIndex) : name
  const ext = dotIndex >= 0 ? name.slice(dotIndex) : ''
  let index = 2
  let nextName = `${stem} (${index})${ext}`
  while (usedNames.has(nextName)) {
    index += 1
    nextName = `${stem} (${index})${ext}`
  }
  usedNames.add(nextName)
  console.info('[QuickResize] duplicated output name renamed', { originalName: name, outputName: nextName })
  return nextName
}

function sanitizeArchiveName(name: string) {
  return name
    .replace(/\.zip$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function QuickResizeView() {
  const [files, setFiles] = useState<SourceImage[]>([])
  const [outputs, setOutputs] = useState<ResizeOutput[]>([])
  const [failed, setFailed] = useState<FailedImage[]>([])
  const [targetWidth, setTargetWidth] = useState(1920)
  const [targetHeight, setTargetHeight] = useState(1080)
  const [resizeMode, setResizeMode] = useState<ResizeMode>('cover')
  const [targetFormat, setTargetFormat] = useState<OutputFormat>('jpeg')
  const [quality, setQuality] = useState(92)
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('black')
  const [customBackground, setCustomBackground] = useState('#000000')
  const [namingMode, setNamingMode] = useState<NamingMode>('suffix')
  const [suffix, setSuffix] = useState('resize')
  const [zipFileName, setZipFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const filesRef = useRef<SourceImage[]>([])
  const outputsRef = useRef<ResizeOutput[]>([])
  const { toast } = useToast()

  const totalInputSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files])
  const totalOutputSize = useMemo(() => outputs.reduce((sum, file) => sum + file.size, 0), [outputs])
  const hasLossyQuality = targetFormat === 'jpeg' || targetFormat === 'webp'

  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => { outputsRef.current = outputs }, [outputs])
  useEffect(() => {
    return () => {
      filesRef.current.forEach(file => URL.revokeObjectURL(file.previewUrl))
      outputsRef.current.forEach(output => URL.revokeObjectURL(output.url))
    }
  }, [])

  const clearOutputs = () => {
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setOutputs([])
    setFailed([])
    setProgress(0)
  }

  const resetAll = () => {
    files.forEach(file => URL.revokeObjectURL(file.previewUrl))
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setFiles([])
    setOutputs([])
    setFailed([])
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const addFiles = async (fileList: FileList | File[]) => {
    const imageFiles = Array.from(fileList).filter(file =>
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)
    )
    if (imageFiles.length === 0) {
      toast({ title: '请选择图片文件', description: '支持 PNG/JPG/WebP/GIF/BMP/SVG', variant: 'destructive' })
      return
    }

    setIsReading(true)
    clearOutputs()
    const nextFiles: SourceImage[] = []
    const failedReads: FailedImage[] = []

    for (const file of imageFiles) {
      try {
        nextFiles.push(await readSourceImage(file))
      } catch (error) {
        const message = error instanceof Error ? error.message : '图片读取失败'
        failedReads.push({ sourceName: file.name, message })
        console.warn('[QuickResize] skipped source image', { fileName: file.name, reason: message })
      }
    }

    setFiles(prev => [...prev, ...nextFiles])
    setFailed(failedReads)
    setIsReading(false)
    if (nextFiles.length > 0) toast({ title: `已添加 ${nextFiles.length} 张图片` })
  }

  const removeFile = (id: string) => {
    clearOutputs()
    setFiles(prev => {
      const target = prev.find(file => file.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter(file => file.id !== id)
    })
  }

  const getBackgroundFill = () => {
    if (targetFormat === 'jpeg' && backgroundMode === 'transparent') return '#ffffff'
    if (backgroundMode === 'transparent') return null
    if (backgroundMode === 'white') return '#ffffff'
    if (backgroundMode === 'black') return '#000000'
    return customBackground
  }

  const getOutputName = (source: SourceImage) => {
    const ext = getExtension(targetFormat)
    const cleanSuffix = suffix.trim() || `${targetWidth}x${targetHeight}`
    return namingMode === 'suffix'
      ? `${source.baseName}_${cleanSuffix}_${targetWidth}x${targetHeight}.${ext}`
      : `${source.baseName}.${ext}`
  }

  const resizeOne = async (source: SourceImage, outputName: string): Promise<ResizeOutput> => {
    const image = await loadImageElement(source.previewUrl)
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 初始化失败')

    const fill = getBackgroundFill()
    if (fill) {
      ctx.fillStyle = fill
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    let drawX = 0
    let drawY = 0
    let drawWidth = targetWidth
    let drawHeight = targetHeight

    if (resizeMode !== 'stretch') {
      const scale = resizeMode === 'cover'
        ? Math.max(targetWidth / source.width, targetHeight / source.height)
        : Math.min(targetWidth / source.width, targetHeight / source.height)
      drawWidth = source.width * scale
      drawHeight = source.height * scale
      drawX = (targetWidth - drawWidth) / 2
      drawY = (targetHeight - drawHeight) / 2
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)

    const blob = await canvasToBlob(canvas, getMimeType(targetFormat), quality / 100)
    const url = URL.createObjectURL(blob)
    return {
      id: `${source.id}-${targetWidth}x${targetHeight}-${targetFormat}`,
      sourceId: source.id,
      name: outputName,
      width: targetWidth,
      height: targetHeight,
      format: targetFormat,
      size: blob.size,
      blob,
      url,
    }
  }

  const handleResize = async () => {
    if (files.length === 0 || isProcessing) return
    if (targetWidth <= 0 || targetHeight <= 0) {
      toast({ title: '请输入有效尺寸', variant: 'destructive' })
      return
    }

    clearOutputs()
    setIsProcessing(true)
    setProgress(0)
    const usedNames = new Set<string>()
    const nextOutputs: ResizeOutput[] = []
    const nextFailed: FailedImage[] = []

    for (let i = 0; i < files.length; i += 1) {
      const source = files[i]
      try {
        const outputName = getUniqueName(getOutputName(source), usedNames)
        nextOutputs.push(await resizeOne(source, outputName))
      } catch (error) {
        const message = error instanceof Error ? error.message : '改图失败'
        nextFailed.push({ sourceName: source.name, message })
        console.warn('[QuickResize] skipped resize', { fileName: source.name, reason: message })
      } finally {
        setProgress(Math.round(((i + 1) / files.length) * 100))
      }
    }

    setOutputs(nextOutputs)
    setFailed(nextFailed)
    setIsProcessing(false)
    if (nextOutputs.length > 0) {
      toast({ title: `快速改图完成: ${nextOutputs.length} 个文件` })
    } else {
      toast({ title: '没有成功输出的文件', variant: 'destructive' })
    }
  }

  const downloadOne = (output: ResizeOutput) => {
    saveAs(output.blob, output.name)
  }

  const downloadZip = async () => {
    if (outputs.length === 0) return
    const zip = new JSZip()
    outputs.forEach(output => zip.file(output.name, output.blob))
    const blob = await zip.generateAsync({ type: 'blob' })
    const archiveName = sanitizeArchiveName(zipFileName) || `quick_resize_${targetWidth}x${targetHeight}_${outputs.length}files`
    saveAs(blob, `${archiveName}.zip`)
  }

  const applyPreset = (preset: string) => {
    const [width, height] = preset.split('x').map(Number)
    setTargetWidth(width)
    setTargetHeight(height)
    clearOutputs()
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files)
  }

  return (
    <div className="p-4 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            快速改图
          </h2>
          <p className="text-xs text-muted-foreground">多图一次性改成同一个尺寸，支持裁剪、留边和拉伸</p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll} disabled={files.length === 0 && outputs.length === 0}>
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
                上传图片
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
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
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
                ) : files.length > 0 ? (
                  <>
                    <ImagePlus className="h-9 w-9 mx-auto text-emerald-500" />
                    <div className="text-sm font-medium mt-3">已选择 {files.length} 张图片</div>
                    <div className="text-xs text-muted-foreground mt-1">点击或拖入继续添加</div>
                  </>
                ) : (
                  <>
                    <Upload className="h-9 w-9 mx-auto text-muted-foreground" />
                    <div className="text-sm font-medium mt-3">拖入一批图片</div>
                    <div className="text-xs text-muted-foreground mt-1">PNG / JPG / WebP / GIF / BMP / SVG</div>
                  </>
                )}
              </div>

              {files.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  <Card className="p-2.5 text-center">
                    <div className="text-lg font-bold">{files.length}</div>
                    <div className="text-[10px] text-muted-foreground">图片</div>
                  </Card>
                  <Card className="p-2.5 text-center">
                    <div className="text-lg font-bold">{outputs.length}</div>
                    <div className="text-[10px] text-muted-foreground">输出</div>
                  </Card>
                  <Card className="p-2.5 text-center">
                    <div className="text-sm font-bold mt-1">{formatBytes(totalInputSize)}</div>
                    <div className="text-[10px] text-muted-foreground">原始大小</div>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                目标尺寸
              </CardTitle>
              <CardDescription className="text-xs">所有图片都会输出成这个尺寸</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">宽度</Label>
                  <Input
                    className="h-9 font-mono"
                    type="number"
                    min={1}
                    value={targetWidth}
                    onChange={event => {
                      setTargetWidth(Number(event.target.value) || 0)
                      clearOutputs()
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">高度</Label>
                  <Input
                    className="h-9 font-mono"
                    type="number"
                    min={1}
                    value={targetHeight}
                    onChange={event => {
                      setTargetHeight(Number(event.target.value) || 0)
                      clearOutputs()
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SIZE_PRESETS.map(preset => (
                  <Button
                    key={preset}
                    type="button"
                    variant={`${targetWidth}x${targetHeight}` === preset ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-[11px] px-2 font-mono"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">改图方式</Label>
                <Select value={resizeMode} onValueChange={(value) => {
                  setResizeMode(value as ResizeMode)
                  clearOutputs()
                }}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">等比填充裁剪</SelectItem>
                    <SelectItem value="contain">完整显示留边</SelectItem>
                    <SelectItem value="stretch">拉伸铺满</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">输出格式</Label>
                  <Select value={targetFormat} onValueChange={(value) => {
                    setTargetFormat(value as OutputFormat)
                    clearOutputs()
                  }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jpeg">JPG</SelectItem>
                      <SelectItem value="png">PNG</SelectItem>
                      <SelectItem value="webp">WebP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">背景色</Label>
                  <Select value={backgroundMode} onValueChange={(value) => {
                    setBackgroundMode(value as BackgroundMode)
                    clearOutputs()
                  }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="black">黑色</SelectItem>
                      <SelectItem value="white">白色</SelectItem>
                      <SelectItem value="transparent">透明</SelectItem>
                      <SelectItem value="custom">自定义</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {backgroundMode === 'custom' && (
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-9 w-12 p-1"
                    value={customBackground}
                    onChange={event => {
                      setCustomBackground(event.target.value)
                      clearOutputs()
                    }}
                  />
                  <Input
                    className="h-9 font-mono text-xs"
                    value={customBackground}
                    onChange={event => {
                      setCustomBackground(event.target.value)
                      clearOutputs()
                    }}
                  />
                </div>
              )}

              {hasLossyQuality && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">质量</Label>
                    <span className="text-xs font-mono text-muted-foreground">{quality}%</span>
                  </div>
                  <Slider value={[quality]} min={10} max={100} step={1} onValueChange={value => {
                    setQuality(value[0])
                    clearOutputs()
                  }} />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">文件名</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={namingMode} onValueChange={(value) => {
                    setNamingMode(value as NamingMode)
                    clearOutputs()
                  }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="suffix">追加后缀</SelectItem>
                      <SelectItem value="replace">覆盖命名</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9 text-xs"
                    value={suffix}
                    disabled={namingMode !== 'suffix'}
                    onChange={event => {
                      setSuffix(event.target.value)
                      clearOutputs()
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">ZIP 压缩包名称</Label>
                <Input
                  className="h-9 text-xs"
                  value={zipFileName}
                  onChange={event => setZipFileName(event.target.value)}
                  placeholder={`quick_resize_${targetWidth}x${targetHeight}_${outputs.length || files.length || 0}files`}
                />
                <div className="text-[10px] text-muted-foreground">
                  不用写 .zip；为空时自动按尺寸和文件数命名
                </div>
              </div>

              <Button className="w-full" onClick={handleResize} disabled={files.length === 0 || isProcessing || isReading}>
                {isProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                {isProcessing ? '处理中...' : `批量改图 (${files.length} 个文件)`}
              </Button>
              {isProcessing && <Progress value={progress} className="h-2" />}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-8 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ImagePlus className="h-4 w-4" />
                    待处理图片
                  </CardTitle>
                  <CardDescription className="text-xs">会统一输出为 {targetWidth}x{targetHeight}</CardDescription>
                </div>
                {files.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetAll}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    清空
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
                  还没有图片
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[470px] overflow-y-auto pr-1">
                  {files.map(file => (
                    <div key={file.id} className="group relative border rounded-md overflow-hidden bg-card">
                      <div className="aspect-square bg-muted/30 flex items-center justify-center">
                        <img src={file.previewUrl} alt={file.name} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="p-2 space-y-1">
                        <div className="text-xs font-medium truncate" title={file.name}>{file.name}</div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="font-mono">{file.width}x{file.height}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5">{file.sourceFormat}</Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</div>
                      </div>
                      <button
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        onClick={() => removeFile(file.id)}
                        aria-label={`移除 ${file.name}`}
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
                      改图结果
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {outputs.length} 个文件 · {targetWidth}x{targetHeight} · {formatBytes(totalOutputSize)}
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={downloadZip}>
                    <FileArchive className="h-4 w-4 mr-1" />
                    打包下载 ZIP（{outputs.length} 个文件）
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {outputs.map(output => (
                    <div key={output.id} className="flex items-center gap-3 border rounded-md p-2">
                      <div className="h-14 w-14 rounded bg-muted/30 border flex items-center justify-center overflow-hidden shrink-0">
                        <img src={output.url} alt={output.name} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate" title={output.name}>{output.name}</div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                          <span className="font-mono">{output.width}x{output.height}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5">{FORMAT_LABELS[output.format]}</Badge>
                          <span>{formatBytes(output.size)}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => downloadOne(output)}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        下载
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {failed.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">跳过的文件</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-1">
                  {failed.map(item => (
                    <div key={`${item.sourceName}-${item.message}`} className="text-xs text-amber-700">
                      {item.sourceName}: {item.message}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
