'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2, Download, FileArchive, ImagePlus, Layers, Loader2, RefreshCw,
  Trash2, Upload
} from 'lucide-react'
import { MASTER_GROUPS } from '@/lib/banner-master-groups'
import {
  buildBannerZipFileName,
  buildBatchGenerationPlans,
  buildSizeByKey,
  findBestMasterGroup,
  formatBytes,
  generateBannerOutputs,
  readBannerSource,
  type BannerCropSettings,
  type BannerOutput,
  type BannerSource,
  type CropMode,
  type FocalPoint,
  type OutputFormat,
} from '@/lib/banner-crop-engine'
import { cn } from '@/lib/utils'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'

function getFilesFromDataTransfer(dataTransfer: DataTransfer) {
  if (dataTransfer.files?.length > 0) {
    return Array.from(dataTransfer.files)
  }
  const files: File[] = []
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

export default function BannerCropBatchView() {
  const [sources, setSources] = useState<BannerSource[]>([])
  const [outputs, setOutputs] = useState<BannerOutput[]>([])
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
  const dragCounterRef = useRef(0)
  const sourcesRef = useRef<BannerSource[]>([])
  const outputsRef = useRef<BannerOutput[]>([])
  const { toast } = useToast()

  const sizeByKey = useMemo(() => buildSizeByKey(), [])
  const sourcePlans = useMemo(
    () => sources.map(source => ({ source, group: findBestMasterGroup(source) })),
    [sources]
  )
  const generationPlans = useMemo(
    () => buildBatchGenerationPlans(sources, sizeByKey),
    [sources, sizeByKey]
  )
  const totalOutputCount = useMemo(
    () => generationPlans.reduce((sum, plan) => sum + plan.sizes.length, 0),
    [generationPlans]
  )
  const coveredGroupIds = useMemo(
    () => new Set(sourcePlans.map(plan => plan.group.id)),
    [sourcePlans]
  )
  const totalSourceSize = sources.reduce((sum, source) => sum + source.size, 0)
  const totalOutputSize = outputs.reduce((sum, output) => sum + output.blob.size, 0)

  const cropSettings: BannerCropSettings = {
    cropMode,
    focalPoint,
    outputFormat,
    quality,
    backgroundColor,
  }

  const resetFileInput = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  useEffect(() => { sourcesRef.current = sources }, [sources])
  useEffect(() => { outputsRef.current = outputs }, [outputs])
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach(source => URL.revokeObjectURL(source.previewUrl))
      outputsRef.current.forEach(output => URL.revokeObjectURL(output.url))
    }
  }, [])

  const clearOutputs = () => {
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setOutputs([])
    setProgress(0)
  }

  const addSources = async (fileList: FileList | File[] | null | undefined) => {
    if (!fileList || fileList.length === 0) return

    const imageFiles = Array.from(fileList).filter(file =>
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
    )

    if (imageFiles.length === 0) {
      toast({ title: '请选择图片文件', description: '支持 PNG/JPG/WebP/GIF/BMP', variant: 'destructive' })
      resetFileInput()
      return
    }

    setIsReading(true)
    clearOutputs()

    const existingKeys = new Set(sources.map(source => `${source.name}-${source.size}-${source.file.lastModified}`))
    const toRead = imageFiles.filter(file => !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`))
    const skipped = imageFiles.length - toRead.length

    const nextSources: BannerSource[] = []
    const errors: string[] = []

    for (const file of toRead) {
      try {
        nextSources.push(await readBannerSource(file))
      } catch (error) {
        const reason = error instanceof Error ? error.message : '读取失败'
        errors.push(`${file.name}: ${reason}`)
      }
    }

    if (nextSources.length > 0) {
      setSources(prev => [...prev, ...nextSources])
    }

    setIsReading(false)
    resetFileInput()

    if (nextSources.length > 0) {
      toast({
        title: `已添加 ${nextSources.length} 张母版原图`,
        description: skipped > 0 ? `跳过 ${skipped} 张重复文件` : '每张将自动匹配各自母版分类',
      })
    } else if (skipped > 0) {
      toast({ title: '均为重复文件', description: '这些图片已在列表中' })
    }

    if (errors.length > 0) {
      toast({
        title: `${errors.length} 张读取失败`,
        description: errors.slice(0, 2).join('；'),
        variant: 'destructive',
      })
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
    setProgress(0)
    resetFileInput()
  }

  const handleGenerate = async () => {
    if (sources.length === 0 || isGenerating) return

    const plans = generationPlans
    if (plans.length === 0 || totalOutputCount === 0) {
      toast({
        title: '无法生成',
        description: '请上传至少 1 张可匹配母版的原图',
        variant: 'destructive',
      })
      return
    }

    clearOutputs()
    setIsGenerating(true)
    setProgress(0)

    const { outputs: nextOutputs, failed } = await generateBannerOutputs(
      plans,
      cropSettings,
      setProgress
    )

    setOutputs(nextOutputs)
    setIsGenerating(false)

    if (failed > 0) {
      toast({
        title: `生成完成: ${nextOutputs.length} 个文件，${failed} 个失败`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: `生成完成: ${nextOutputs.length} 个文件`,
        description: `来自 ${sources.length} 张母版原图`,
      })
    }
  }

  const downloadZip = async () => {
    if (outputs.length === 0) return
    const zip = new JSZip()
    outputs.forEach(output => zip.file(output.path, output.blob))
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, buildBannerZipFileName(outputs))
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
    const files = getFilesFromDataTransfer(event.dataTransfer)
    if (files.length > 0) {
      void addSources(files)
    } else {
      toast({ title: '未识别到图片', description: '请拖入 PNG/JPG/WebP/GIF/BMP 文件', variant: 'destructive' })
    }
  }

  const openFilePicker = () => {
    resetFileInput()
    inputRef.current?.click()
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 space-y-5 min-[1440px]:px-6">
      <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Layers className="h-5 w-5 text-foreground" />
            Banner 裁剪（批量）
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            一次上传多张母版原图，每张自动匹配母版分类并批量裁切；单张精修请用「Banner 裁剪」
          </p>
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
                批量上传母版
              </CardTitle>
              <CardDescription className="text-xs">支持多选/拖拽，每张独立匹配 16 类母版</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div
                className={cn(
                  'relative border border-dashed rounded-xl p-4 text-center transition-all',
                  isDragging
                    ? 'border-foreground bg-muted/50'
                    : 'border-border hover:border-foreground/40 hover:bg-muted/30',
                  isReading ? 'opacity-70' : 'cursor-pointer'
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={openFilePicker}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  aria-label="批量选择母版原图"
                  className="hidden"
                  onChange={event => {
                    void addSources(event.target.files)
                  }}
                />
                <div className="pointer-events-none space-y-2">
                  {isReading ? (
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                  ) : (
                    <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground" />
                  )}
                  <p className="text-sm font-medium">
                    {sources.length > 0 ? `已添加 ${sources.length} 张原图` : '拖入或点击选择多张图片'}
                  </p>
                  <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                    <span><span className="font-medium text-foreground">{sources.length}</span> 原图</span>
                    <span><span className="font-medium text-foreground">{coveredGroupIds.size}</span> 类母版</span>
                    <span><span className="font-medium text-foreground">{totalOutputCount}</span> 预计输出</span>
                  </div>
                </div>
              </div>

              {sources.length > 0 && (
                <Button variant="outline" size="sm" className="w-full h-8 text-xs rounded-lg" onClick={openFilePicker}>
                  继续添加原图
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm font-medium">裁剪设置</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">裁剪模式</Label>
                <Select value={cropMode} onValueChange={value => { clearOutputs(); setCropMode(value as CropMode) }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover" className="text-xs">等比填充（cover）</SelectItem>
                    <SelectItem value="contain" className="text-xs">等比完整（contain）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">锚点</Label>
                <Select value={focalPoint} onValueChange={value => { clearOutputs(); setFocalPoint(value as FocalPoint) }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center" className="text-xs">居中</SelectItem>
                    <SelectItem value="top" className="text-xs">上</SelectItem>
                    <SelectItem value="bottom" className="text-xs">下</SelectItem>
                    <SelectItem value="left" className="text-xs">左</SelectItem>
                    <SelectItem value="right" className="text-xs">右</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">导出格式</Label>
                <div className="flex gap-2 items-center">
                  <Select value={outputFormat} onValueChange={value => { clearOutputs(); setOutputFormat(value as OutputFormat) }}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jpg" className="text-xs">JPG</SelectItem>
                      <SelectItem value="png" className="text-xs">PNG</SelectItem>
                      <SelectItem value="webp" className="text-xs">WebP</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={event => { clearOutputs(); setBackgroundColor(event.target.value) }}
                    className="h-8 w-10 rounded border cursor-pointer"
                    title="背景色"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs text-muted-foreground">质量</Label>
                  <span className="text-xs font-mono">{quality}%</span>
                </div>
                <Slider
                  value={[quality]}
                  min={60}
                  max={100}
                  step={1}
                  onValueChange={([value]) => { clearOutputs(); setQuality(value) }}
                />
              </div>
            </CardContent>
          </Card>

          {(isGenerating || progress > 0) && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-center">{progress}%</p>
            </div>
          )}

          <Button
            className="w-full h-10 rounded-xl"
            disabled={sources.length === 0 || isGenerating || totalOutputCount === 0}
            onClick={() => void handleGenerate()}
          >
            {isGenerating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中...</>
            ) : (
              <>生成 Banner（{totalOutputCount} 个文件）</>
            )}
          </Button>

          {outputs.length > 0 && (
            <Button variant="outline" className="w-full h-9 rounded-xl text-xs" onClick={() => void downloadZip()}>
              <FileArchive className="h-3.5 w-3.5 mr-1.5" />
              下载 ZIP（{outputs.length} 个 · {formatBytes(totalOutputSize)}）
            </Button>
          )}

          {sources.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              原图合计 {formatBytes(totalSourceSize)}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">原图队列 · 自动匹配</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  已覆盖 {coveredGroupIds.size}/{MASTER_GROUPS.length} 类
                </Badge>
              </div>
              <CardDescription className="text-xs">
                每张原图按宽高比匹配母版，仅生成该分类下的全部目标尺寸
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {sources.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  上传多张不同比例的母版原图，例如横版 1920×1080、方图 1024×1024 等
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {sourcePlans.map(({ source, group }) => {
                    const sizeCount = group.sizes.length
                    return (
                      <div
                        key={source.id}
                        className="flex items-center gap-3 rounded-lg border border-border/80 p-2.5 bg-card"
                      >
                        <img
                          src={source.previewUrl}
                          alt={source.name}
                          className="h-14 w-14 rounded-md object-cover border shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{source.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {source.width}×{source.height} · {formatBytes(source.size)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge className="text-[9px] px-1.5 py-0 bg-foreground text-background hover:bg-foreground">
                              {group.code} {group.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{sizeCount} 个尺寸</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => removeSource(source.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm font-medium">母版分类覆盖（只读）</CardTitle>
              <CardDescription className="text-xs">16 类规格与单张模式相同，批量模式按队列自动匹配</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-2 min-[1200px]:grid-cols-3 min-[1600px]:grid-cols-4">
                {MASTER_GROUPS.map(group => {
                  const hasMaster = coveredGroupIds.has(group.id)
                  return (
                    <div
                      key={group.id}
                      className={cn(
                        'rounded-lg border px-2.5 py-2 text-[10px] transition-colors',
                        hasMaster
                          ? 'border-foreground/30 bg-foreground text-background'
                          : 'border-border/80 bg-muted/20 text-muted-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-medium">{group.code}</span>
                        {hasMaster ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0 opacity-80" />
                        ) : (
                          <span className="opacity-60">—</span>
                        )}
                      </div>
                      <div className="truncate mt-0.5 opacity-90">{group.label}</div>
                      <div className="mt-1 opacity-70">{group.sizes.length} 尺寸</div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {outputs.length > 0 && (
            <Card className="rounded-xl border border-border/80 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">生成结果</CardTitle>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={() => void downloadZip()}>
                  <Download className="h-3 w-3 mr-1" />
                  ZIP
                </Button>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-3 gap-2 min-[1200px]:grid-cols-4 min-[1600px]:grid-cols-6 max-h-[360px] overflow-y-auto">
                  {outputs.map(output => (
                    <a
                      key={output.id}
                      href={output.url}
                      download={output.name}
                      className="group rounded-lg border overflow-hidden hover:border-foreground/50 transition-colors"
                      title={output.path}
                    >
                      <img src={output.url} alt={output.name} className="w-full aspect-video object-cover bg-muted" />
                      <div className="px-1.5 py-1 text-[9px] font-mono truncate text-muted-foreground group-hover:text-foreground">
                        {output.name}
                      </div>
                    </a>
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
