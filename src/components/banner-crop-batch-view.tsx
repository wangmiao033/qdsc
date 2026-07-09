'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Crop, Download, FileArchive,
  ImagePlus, Layers, Loader2, Package, RefreshCw, Settings2, Trash2, Upload, X, Zap
} from 'lucide-react'
import { getMasterRatio, MASTER_GROUPS, type MasterGroup } from '@/lib/banner-master-groups'
import { parseStoredOutputFormat } from '@/lib/crop-utils'
import {
  buildBannerZipFileName,
  buildBatchGenerationPlans,
  buildSizeByKey,
  findBestMasterGroup,
  formatBytes,
  generateBannerOutputs,
  getGroupSizes,
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
import { Input } from '@/components/ui/input'
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

function fileFingerprint(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

type SourceMatchKind = 'master' | 'size' | 'ratio'

const SOURCE_MATCH_LABELS: Record<SourceMatchKind, string> = {
  master: '母版精确',
  size: '尺寸命中',
  ratio: '比例匹配',
}

const SOURCE_MATCH_STYLES: Record<SourceMatchKind, string> = {
  master: 'border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300',
  size: 'border-sky-600/30 bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-300',
  ratio: 'border-red-600/40 bg-red-50 text-red-700 dark:bg-red-950/35 dark:text-red-300',
}

function getSourceMatchKind(source: BannerSource, group: MasterGroup): SourceMatchKind {
  const sourceKey = `${source.width}x${source.height}`
  if (group.master === sourceKey) return 'master'
  if (group.sizes.includes(sourceKey)) return 'size'
  return 'ratio'
}

function getInitialOutputFormat(): OutputFormat {
  if (typeof window === 'undefined') return 'jpg'

  try {
    const stored = localStorage.getItem('qdsc_banner_crop_sizes')
    if (!stored) return 'jpg'
    const sizes: Array<{ format?: string }> = JSON.parse(stored)
    return parseStoredOutputFormat(sizes.find(size => size.format)?.format) || 'jpg'
  } catch {
    return 'jpg'
  }
}

export default function BannerCropBatchView() {
  const [sources, setSources] = useState<BannerSource[]>([])
  const [outputs, setOutputs] = useState<BannerOutput[]>([])
  const [cropMode, setCropMode] = useState<CropMode>('cover')
  const [focalPoint, setFocalPoint] = useState<FocalPoint>('center')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(getInitialOutputFormat)
  const [quality, setQuality] = useState(92)
  const [backgroundColor, setBackgroundColor] = useState('#000000')
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [readProgress, setReadProgress] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isZipping, setIsZipping] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showCoverageDetail, setShowCoverageDetail] = useState(false)
  const [expandedResultSources, setExpandedResultSources] = useState<Set<string>>(() => new Set())
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragCounterRef = useRef(0)
  const sourcesRef = useRef<BannerSource[]>([])
  const outputsRef = useRef<BannerOutput[]>([])
  const { toast } = useToast()

  const sizeByKey = useMemo(() => buildSizeByKey(), [])

  const sourcePlans = useMemo(
    () => sources
      .map(source => {
        const group = findBestMasterGroup(source)
        return { source, group, matchKind: getSourceMatchKind(source, group) }
      })
      .sort((a, b) => a.group.code.localeCompare(b.group.code) || a.source.name.localeCompare(b.source.name)),
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

  const groupSourceMap = useMemo(() => {
    const map = new Map<string, BannerSource[]>()
    for (const { source, group } of sourcePlans) {
      const list = map.get(group.id) || []
      list.push(source)
      map.set(group.id, list)
    }
    return map
  }, [sourcePlans])

  const conflictGroupIds = useMemo(
    () => new Set(
      [...groupSourceMap.entries()]
        .filter(([, list]) => list.length > 1)
        .map(([id]) => id)
    ),
    [groupSourceMap]
  )

  const coveredGroupIds = useMemo(
    () => new Set(sourcePlans.map(plan => plan.group.id)),
    [sourcePlans]
  )

  const missingGroups = useMemo(
    () => MASTER_GROUPS.filter(group => !coveredGroupIds.has(group.id)),
    [coveredGroupIds]
  )

  const matchStats = useMemo(
    () => sourcePlans.reduce(
      (stats, plan) => {
        stats[plan.matchKind] += 1
        return stats
      },
      { master: 0, size: 0, ratio: 0 } as Record<SourceMatchKind, number>
    ),
    [sourcePlans]
  )

  const packageWarnings = useMemo(() => {
    const warnings: string[] = []
    if (missingGroups.length > 0) warnings.push(`缺 ${missingGroups.length} 类母版`)
    if (conflictGroupIds.size > 0) warnings.push(`${conflictGroupIds.size} 类同类多张`)
    if (matchStats.ratio > 0) warnings.push(`${matchStats.ratio} 张比例匹配`)
    return warnings
  }, [conflictGroupIds.size, matchStats.ratio, missingGroups.length])

  const outputsStale = useMemo(() => {
    if (outputs.length === 0) return false
    const sourceIds = new Set(sources.map(source => source.id))
    return outputs.some(output => !sourceIds.has(output.sourceId))
      || sources.some(source => !outputs.some(output => output.sourceId === source.id))
  }, [outputs, sources])

  const outputsBySource = useMemo(() => {
    const map = new Map<string, BannerOutput[]>()
    for (const output of outputs) {
      const list = map.get(output.sourceId) || []
      list.push(output)
      map.set(output.sourceId, list)
    }
    return map
  }, [outputs])

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

  const invalidateOutputs = () => {
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setOutputs([])
    setExpandedResultSources(new Set())
    setProgress(0)
  }

  useEffect(() => { sourcesRef.current = sources }, [sources])
  useEffect(() => { outputsRef.current = outputs }, [outputs])
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach(source => URL.revokeObjectURL(source.previewUrl))
      outputsRef.current.forEach(output => URL.revokeObjectURL(output.url))
    }
  }, [])

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

    const existingKeys = new Set(sources.map(source => fileFingerprint(source.file)))
    const toRead = imageFiles.filter(file => !existingKeys.has(fileFingerprint(file)))
    const skipped = imageFiles.length - toRead.length

    if (toRead.length === 0) {
      resetFileInput()
      toast({ title: '均为重复文件', description: '这些图片已在队列中' })
      return
    }

    setIsReading(true)
    setReadProgress(`0 / ${toRead.length}`)

    const nextSources: BannerSource[] = []
    const errors: string[] = []
    let done = 0

    await Promise.all(toRead.map(async file => {
      try {
        const source = await readBannerSource(file)
        nextSources.push(source)
      } catch (error) {
        const reason = error instanceof Error ? error.message : '读取失败'
        errors.push(`${file.name}: ${reason}`)
      } finally {
        done += 1
        setReadProgress(`${done} / ${toRead.length}`)
      }
    }))

    nextSources.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

    if (nextSources.length > 0) {
      const merged = [...sources, ...nextSources]
      const byGroup = new Map<string, number>()
      merged.forEach(s => {
        const gid = findBestMasterGroup(s).id
        byGroup.set(gid, (byGroup.get(gid) || 0) + 1)
      })
      const dupCount = [...byGroup.values()].filter(n => n > 1).length

      setSources(merged)

      toast({
        title: `已添加 ${nextSources.length} 张母版原图`,
        description: dupCount > 0
          ? `跳过 ${skipped} 张重复 · ${dupCount} 个分类有多张原图，将分文件夹输出`
          : skipped > 0
            ? `跳过 ${skipped} 张重复文件`
            : '每张将自动匹配各自母版分类',
      })
    }

    setIsReading(false)
    setReadProgress('')
    resetFileInput()

    if (errors.length > 0) {
      toast({
        title: `${errors.length} 张读取失败`,
        description: errors.slice(0, 2).join('；'),
        variant: 'destructive',
      })
    }
  }

  const removeSource = (id: string) => {
    invalidateOutputs()
    setSources(prev => {
      const target = prev.find(source => source.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter(source => source.id !== id)
    })
  }

  const clearQueue = () => {
    invalidateOutputs()
    sources.forEach(source => URL.revokeObjectURL(source.previewUrl))
    setSources([])
    resetFileInput()
  }

  const resetAll = () => {
    sources.forEach(source => URL.revokeObjectURL(source.previewUrl))
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setSources([])
    setOutputs([])
    setProgress(0)
    resetFileInput()
  }

  const buildCurrentOutputs = async (options: { showToast?: boolean } = {}) => {
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

    invalidateOutputs()
    setIsGenerating(true)
    setProgress(0)

    try {
      const { outputs: nextOutputs, failed } = await generateBannerOutputs(
        plans,
        cropSettings,
        setProgress,
        { layout: 'flat', useFormatFolder: false }
      )

      setOutputs(nextOutputs)
      setExpandedResultSources(new Set(sources.map(source => source.id)))

      if (options.showToast !== false) {
        if (failed > 0) {
          toast({
            title: `生成完成：${nextOutputs.length} 个，失败 ${failed} 个`,
            variant: 'destructive',
          })
        } else {
          toast({
            title: `生成完成：${nextOutputs.length} 个文件`,
            description: `来自 ${sources.length} 张母版 · ${formatBytes(nextOutputs.reduce((s, o) => s + o.blob.size, 0))}`,
          })
        }
      }

      return { outputs: nextOutputs, failed }
    } catch (error) {
      const reason = error instanceof Error ? error.message : '生成失败'
      toast({
        title: '生成失败',
        description: reason,
        variant: 'destructive',
      })
      return null
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerate = async () => {
    await buildCurrentOutputs()
  }

  const saveOutputsZip = async (items: BannerOutput[]) => {
    if (items.length === 0 || isZipping) return false
    setIsZipping(true)
    try {
      const zip = new JSZip()
      items.forEach(output => zip.file(output.path, output.blob))
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, buildBannerZipFileName(items, { flatPack: true }))
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : '打包失败'
      toast({
        title: 'ZIP 打包失败',
        description: reason,
        variant: 'destructive',
      })
      return false
    } finally {
      setIsZipping(false)
    }
  }

  const downloadZip = async () => {
    await saveOutputsZip(outputs)
  }

  const handleOneClickPack = async () => {
    if (sources.length === 0 || isGenerating || isReading || isZipping || totalOutputCount === 0) return

    const result = await buildCurrentOutputs({ showToast: false })
    if (!result || result.outputs.length === 0) return

    const saved = await saveOutputsZip(result.outputs)
    if (!saved) return

    const warningText = packageWarnings.length > 0
      ? `需复核：${packageWarnings.join(' · ')}`
      : '匹配完整，可直接复核交付'

    toast({
      title: `一键出包已下载（测试）：${result.outputs.length} 个文件`,
      description: result.failed > 0 ? `${warningText} · 失败 ${result.failed} 个` : warningText,
      variant: result.failed > 0 || packageWarnings.length > 0 ? 'destructive' : 'default',
    })
  }

  const toggleResultSource = (sourceId: string) => {
    setExpandedResultSources(prev => {
      const next = new Set(prev)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
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

  const onSettingsChange = <T,>(setter: (value: T) => void, value: T) => {
    invalidateOutputs()
    setter(value)
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-4 sm:py-5 min-[1440px]:px-6">
      <div className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-red-600 bg-red-600 text-[10px] font-bold text-white hover:bg-red-600">
                测试中
              </Badge>
              <Badge variant="outline" className="border-zinc-200 bg-white text-[10px] font-bold text-zinc-600">
                自动匹配母版
              </Badge>
            </div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-zinc-950">
              <Layers className="h-5 w-5 text-zinc-900" />
              Banner 一键出包
            </h2>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-zinc-500">
              多张母版一次上传，自动匹配分类、批量生成并打包；该流程还需 1-2 轮复核优化。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg border-zinc-200 bg-white text-xs font-bold shadow-sm lg:self-start"
            onClick={resetAll}
            disabled={sources.length === 0 && outputs.length === 0}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            重置全部
          </Button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          {[
            { label: '母版原图', value: sources.length, tone: 'text-zinc-950' },
            { label: '覆盖分类', value: `${coveredGroupIds.size}/${MASTER_GROUPS.length}`, tone: 'text-emerald-700' },
            { label: '预计输出', value: totalOutputCount, tone: 'text-blue-700' },
            { label: '需复核', value: packageWarnings.length, tone: packageWarnings.length > 0 ? 'text-red-700' : 'text-zinc-950' },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
              <div className={`font-mono text-xl font-extrabold tabular-nums ${item.tone}`}>{item.value}</div>
              <div className="text-[11px] font-bold text-zinc-500">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {conflictGroupIds.size > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            <span className="font-medium">{conflictGroupIds.size} 个母版分类</span> 下有多张原图，将分别裁切并写入不同子文件夹。
            若只需一套输出，建议每类母版保留一张（与单张模式一致）。
          </p>
        </div>
      )}

      {outputsStale && outputs.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">队列已变更，当前预览可能不是最新结果</span>
          <Button size="sm" className="h-7 text-xs rounded-lg" onClick={() => void handleGenerate()}>
            重新生成
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 min-[1440px]:grid-cols-[300px_minmax(0,1fr)] min-[1728px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 min-[1440px]:sticky min-[1440px]:top-4 min-[1440px]:self-start">
          <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Upload className="h-4 w-4 text-zinc-500" />
                批量上传母版
              </CardTitle>
              <CardDescription className="text-xs font-medium">多选或拖拽，每张按宽高比独立匹配</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div
                className={cn(
                  'relative rounded-lg border border-dashed p-5 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isDragging
                    ? 'border-zinc-950 bg-zinc-100'
                    : 'border-zinc-300 bg-white hover:border-zinc-500 hover:bg-zinc-50',
                  isReading ? 'opacity-70 pointer-events-none' : 'cursor-pointer'
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={openFilePicker}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openFilePicker()
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="批量上传母版原图，支持点击或拖入多张图片"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  multiple
                  className="sr-only"
                  onChange={event => {
                    void addSources(event.target.files)
                  }}
                />
                <div className="pointer-events-none">
                  {isReading ? (
                    <>
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-900" />
                      <div className="mt-2 text-sm font-bold">读取中 {readProgress}</div>
                    </>
                  ) : sources.length > 0 ? (
                    <>
                      <ImagePlus className="mx-auto h-8 w-8 text-zinc-700" />
                      <div className="mt-2 text-sm font-bold">已添加 {sources.length} 张母版</div>
                      <div className="mt-0.5 text-xs font-medium text-zinc-500">点击或拖入可继续添加</div>
                    </>
                  ) : (
                    <>
                      <Upload className="mx-auto h-8 w-8 text-zinc-500" />
                      <div className="mt-2 text-sm font-bold text-zinc-900">拖入多张母版原图</div>
                      <div className="mt-0.5 text-xs font-medium text-zinc-500">PNG / JPG / WebP / GIF / BMP</div>
                    </>
                  )}
                </div>
              </div>

              {sources.length > 0 && !isReading && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs rounded-lg border-border/80"
                    onClick={event => {
                      event.stopPropagation()
                      openFilePicker()
                    }}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    继续添加
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs rounded-lg border-border/80 px-2.5"
                    onClick={clearQueue}
                    title="清空队列"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {sources.length > 0 && (
                <div className="flex items-stretch divide-x divide-zinc-200 rounded-lg border border-zinc-200 bg-white text-center shadow-sm">
                  <div className="flex-1 py-2 px-1">
                    <div className="text-base font-semibold tabular-nums">{sources.length}</div>
                    <div className="text-[10px] text-muted-foreground">母版原图</div>
                  </div>
                  <div className="flex-1 py-2 px-1">
                    <div className="text-base font-semibold tabular-nums">{coveredGroupIds.size}</div>
                    <div className="text-[10px] text-muted-foreground">已覆盖分类</div>
                  </div>
                  <div className="flex-1 py-2 px-1">
                    <div className="text-base font-semibold tabular-nums">{totalOutputCount}</div>
                    <div className="text-[10px] text-muted-foreground">预计输出</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Settings2 className="h-4 w-4 text-zinc-500" />
                裁剪设置
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">裁剪模式</Label>
                <Select value={cropMode} onValueChange={value => onSettingsChange(setCropMode, value as CropMode)}>
                  <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">等比填充裁剪</SelectItem>
                    <SelectItem value="contain">等比完整留边</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">裁剪焦点</Label>
                <Select value={focalPoint} onValueChange={value => onSettingsChange(setFocalPoint, value as FocalPoint)}>
                  <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
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
                  <Select value={outputFormat} onValueChange={value => onSettingsChange(setOutputFormat, value as OutputFormat)}>
                    <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
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
                    className="h-8 p-1 rounded-lg cursor-pointer"
                    value={backgroundColor}
                    onChange={event => onSettingsChange(setBackgroundColor, event.target.value)}
                    title="留边背景色"
                  />
                </div>
              </div>

              {(outputFormat === 'jpg' || outputFormat === 'webp') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">质量</Label>
                    <span className="text-xs font-mono text-muted-foreground">{quality}%</span>
                  </div>
                  <Slider
                    value={[quality]}
                    min={50}
                    max={100}
                    step={1}
                    onValueChange={value => onSettingsChange(setQuality, value[0])}
                  />
                </div>
              )}

              <div className="rounded-lg border border-red-600/35 bg-red-50/80 p-3 text-red-950 dark:bg-red-950/25 dark:text-red-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Zap className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-semibold">一键出包</span>
                    <Badge className="h-5 border-red-600 bg-red-600 px-1.5 text-[9px] text-white hover:bg-red-600">
                      TEST
                    </Badge>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium">
                    {sources.length === 0 ? '待上传' : packageWarnings.length > 0 ? '需复核' : '可出包'}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                  <div className="rounded-md border border-red-600/20 bg-white/55 px-1.5 py-1 dark:bg-black/15">
                    <div className="font-semibold tabular-nums">{coveredGroupIds.size}/{MASTER_GROUPS.length}</div>
                    <div className="opacity-75">覆盖</div>
                  </div>
                  <div className="rounded-md border border-red-600/20 bg-white/55 px-1.5 py-1 dark:bg-black/15">
                    <div className="font-semibold tabular-nums">{matchStats.ratio}</div>
                    <div className="opacity-75">比例匹配</div>
                  </div>
                  <div className="rounded-md border border-red-600/20 bg-white/55 px-1.5 py-1 dark:bg-black/15">
                    <div className="font-semibold tabular-nums">{totalOutputCount}</div>
                    <div className="opacity-75">预计输出</div>
                  </div>
                </div>
                <Button
                  className="mt-3 h-9 w-full rounded-lg bg-red-600 text-white hover:bg-red-700"
                  disabled={sources.length === 0 || isGenerating || isReading || isZipping || totalOutputCount === 0}
                  onClick={() => void handleOneClickPack()}
                >
                  {isGenerating || isZipping ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />处理中...</>
                  ) : (
                    <><Package className="mr-1.5 h-4 w-4" />一键出包（测试）</>
                  )}
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full h-9 rounded-lg border-border/80"
                disabled={sources.length === 0 || isGenerating || isReading || totalOutputCount === 0}
                onClick={() => void handleGenerate()}
              >
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" />生成中...</>
                ) : (
                  <><Crop className="h-4 w-4 mr-1" />只生成预览（{totalOutputCount} 个文件）</>
                )}
              </Button>
              {isGenerating && <Progress value={progress} className="h-1.5 rounded-full" />}

              {outputs.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full h-8 rounded-lg text-xs border-border/80"
                  disabled={isZipping}
                  onClick={() => void downloadZip()}
                >
                  {isZipping ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />打包中...</>
                  ) : (
                    <><FileArchive className="h-3.5 w-3.5 mr-1.5" />下载素材包 ZIP · {outputs.length} 张</>
                  )}
                </Button>
              )}

              {sources.length > 0 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  原图合计 {formatBytes(totalSourceSize)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-bold">原图队列</CardTitle>
                <Badge variant="secondary" className="text-[10px] font-bold">
                  已覆盖 {coveredGroupIds.size}/{MASTER_GROUPS.length} 类
                </Badge>
              </div>
              <CardDescription className="text-xs font-medium">
                按母版分类排序；每张仅生成其匹配分类下的全部目标尺寸
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {sources.length === 0 ? (
                  <div className="space-y-2 rounded-lg border border-dashed border-zinc-300 bg-white py-14 text-center">
                    <p className="text-sm font-bold text-zinc-700">上传多张不同比例的母版原图</p>
                    <p className="text-xs font-medium text-zinc-500">
                      例如 1920×1080 横版、1024×1024 方图、1080×1920 竖版
                    </p>
                  </div>
              ) : (
                <div className="space-y-2 max-h-[min(480px,50vh)] overflow-y-auto pr-1">
                  {sourcePlans.map(({ source, group, matchKind }, index) => {
                    const hasConflict = conflictGroupIds.has(group.id)
                    const groupSizes = getGroupSizes(group, sizeByKey)
                    return (
                      <div
                        key={source.id}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-2.5 shadow-sm transition-colors',
                          hasConflict
                            ? 'border-amber-600/35 bg-amber-50/50 dark:bg-amber-950/20'
                            : 'border-zinc-200 bg-white'
                        )}
                      >
                        <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0 text-center tabular-nums">
                          {index + 1}
                        </span>
                        <img
                          src={source.previewUrl}
                          alt=""
                          className="h-14 w-14 rounded-lg object-cover border shrink-0 bg-muted"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-zinc-900" title={source.name}>{source.name}</div>
                          <div className="mt-0.5 text-[10px] font-medium tabular-nums text-zinc-500">
                            {source.width}×{source.height} · {formatBytes(source.size)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
                              {group.code}
                            </Badge>
                            <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', SOURCE_MATCH_STYLES[matchKind])}>
                              {SOURCE_MATCH_LABELS[matchKind]}
                            </Badge>
                            <span className="truncate text-[10px] font-medium text-zinc-500">{group.label}</span>
                            <span className="text-[10px] font-medium text-zinc-500">→ {groupSizes.length} 尺寸</span>
                            {hasConflict && (
                              <span className="text-[9px] text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" />
                                同类多张
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => removeSource(source.id)}
                          aria-label={`移除 ${source.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border border-red-600/30 bg-red-50/60 shadow-[0_10px_28px_rgba(220,38,38,0.08)] dark:bg-red-950/15">
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm font-bold text-red-950 dark:text-red-100">
                  <Zap className="h-4 w-4" />
                  一键出包测试清单
                </CardTitle>
                <Badge className="border-red-600 bg-red-600 text-[10px] font-bold text-white hover:bg-red-600">
                  测试标红
                </Badge>
              </div>
              <CardDescription className="text-xs font-medium text-red-900/75 dark:text-red-200/75">
                当前阶段用于快速整包，仍需人工复核比例匹配和缺失母版
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-red-600/20 bg-white/80 p-2 shadow-sm">
                  <div className="font-mono text-lg font-extrabold tabular-nums">{coveredGroupIds.size}</div>
                  <div className="text-[10px] font-bold text-zinc-500">已覆盖母版</div>
                </div>
                <div className="rounded-lg border border-red-600/20 bg-white/80 p-2 shadow-sm">
                  <div className="font-mono text-lg font-extrabold tabular-nums text-red-600">{missingGroups.length}</div>
                  <div className="text-[10px] font-bold text-zinc-500">缺母版</div>
                </div>
                <div className="rounded-lg border border-red-600/20 bg-white/80 p-2 shadow-sm">
                  <div className="font-mono text-lg font-extrabold tabular-nums">{matchStats.master + matchStats.size}</div>
                  <div className="text-[10px] font-bold text-zinc-500">精确/尺寸命中</div>
                </div>
                <div className="rounded-lg border border-red-600/20 bg-white/80 p-2 shadow-sm">
                  <div className="font-mono text-lg font-extrabold tabular-nums text-red-600">{matchStats.ratio}</div>
                  <div className="text-[10px] font-bold text-zinc-500">比例匹配</div>
                </div>
              </div>

              {packageWarnings.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {packageWarnings.map(warning => (
                    <Badge key={warning} variant="outline" className="border-red-600/35 bg-red-50 text-[10px] text-red-700 dark:bg-red-950/30 dark:text-red-200">
                      {warning}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  上传母版已覆盖全部分类，未发现比例兜底或同类多张
                </div>
              )}

              {missingGroups.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-medium text-red-700 dark:text-red-200">缺失母版</div>
                  <div className="flex flex-wrap gap-1">
                    {missingGroups.slice(0, 12).map(group => (
                      <span key={group.id} className="rounded border border-red-600/25 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {group.code}
                      </span>
                    ))}
                    {missingGroups.length > 12 && (
                      <span className="rounded border border-red-600/25 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        +{missingGroups.length - 12}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold">母版分类覆盖</CardTitle>
                  <CardDescription className="mt-0.5 text-xs font-medium">
                    与单张模式共用 {MASTER_GROUPS.length} 类规格 · 绿=已有母版
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setShowCoverageDetail(prev => !prev)}
                >
                  {showCoverageDetail ? '收起' : '展开'}
                  {showCoverageDetail ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronRight className="h-3 w-3 ml-1" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={cn(
                'grid gap-2',
                showCoverageDetail
                  ? 'grid-cols-1 sm:grid-cols-2 min-[1440px]:grid-cols-3'
                  : 'grid-cols-2 min-[1200px]:grid-cols-4 min-[1600px]:grid-cols-6'
              )}>
                {MASTER_GROUPS.map(group => {
                  const assigned = groupSourceMap.get(group.id) || []
                  const hasMaster = assigned.length > 0
                  const hasConflict = assigned.length > 1
                  const ratio = getMasterRatio(group)

                  if (!showCoverageDetail) {
                    return (
                      <div
                        key={group.id}
                        title={hasMaster ? assigned.map(s => s.name).join(', ') : group.masterFileName}
                        className={cn(
                          'rounded-lg border px-2 py-1.5 text-[10px]',
                          hasMaster
                            ? hasConflict
                              ? 'border-amber-600/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                              : 'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-border/60 bg-muted/15 text-muted-foreground'
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-medium">{group.code}</span>
                          {hasMaster ? (
                            hasConflict
                              ? <AlertTriangle className="h-3 w-3 shrink-0" />
                              : <CheckCircle2 className="h-3 w-3 shrink-0 opacity-70" />
                          ) : null}
                        </div>
                        <div className="truncate opacity-90">{group.label}</div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={group.id}
                      className={cn(
                        'rounded-lg border p-3 text-left text-[11px]',
                        hasMaster
                          ? hasConflict
                            ? 'border-amber-600/35 bg-amber-50/50 dark:bg-amber-950/25'
                            : 'border-emerald-600/30 bg-emerald-50/50 dark:bg-emerald-950/25'
                          : 'border-border/80 bg-muted/10 opacity-75'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[10px] text-muted-foreground">{group.code}_{group.master}</div>
                          <div className="text-sm font-medium mt-0.5">{group.label}</div>
                        </div>
                        <span className={cn(
                          'shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border',
                          hasMaster
                            ? hasConflict
                              ? 'border-amber-600/40 text-amber-800 dark:text-amber-300'
                              : 'border-emerald-600/30 text-emerald-700 dark:text-emerald-400'
                            : 'border-border text-muted-foreground'
                        )}>
                          {hasMaster ? (hasConflict ? `${assigned.length} 张` : '已有') : '缺母版'}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1.5 leading-relaxed">
                        {group.ratioLabel} · {ratio.toFixed(2)}:1 · {group.sizes.length} 尺寸
                      </p>
                      {hasMaster && (
                        <p className="mt-1.5 truncate text-foreground/80" title={assigned.map(s => s.name).join('\n')}>
                          {assigned.map(s => s.baseName).join('、')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {outputs.length > 0 && (
            <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
              <CardHeader className="px-4 pt-4 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold">生成结果</CardTitle>
                    <CardDescription className="text-xs">
                      {outputs.length} 个文件 · {formatBytes(totalOutputSize)} · ZIP 平铺于 {outputFormat}/，命名 宽×高.{outputFormat}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs rounded-lg border-border/80"
                    disabled={isZipping}
                    onClick={() => void downloadZip()}
                  >
                    {isZipping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                    ZIP
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2 max-h-[min(520px,55vh)] overflow-y-auto">
                {sources
                  .filter(source => outputsBySource.has(source.id))
                  .map(source => {
                    const sourceOutputs = outputsBySource.get(source.id) || []
                    const plan = sourcePlans.find(p => p.source.id === source.id)
                    const expanded = expandedResultSources.has(source.id)
                    return (
                      <div key={source.id} className="rounded-lg border border-border/80 overflow-hidden">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40 transition-colors"
                          onClick={() => toggleResultSource(source.id)}
                        >
                          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                          <span className="font-medium truncate flex-1">{source.baseName}</span>
                          {plan && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono shrink-0">
                              {plan.group.code}
                            </Badge>
                          )}
                          <span className="text-muted-foreground tabular-nums shrink-0">{sourceOutputs.length} 张</span>
                        </button>
                        {expanded && (
                          <div className="grid grid-cols-3 sm:grid-cols-4 min-[1440px]:grid-cols-5 gap-1.5 p-2 pt-0 border-t border-border/60 bg-muted/10">
                            {sourceOutputs.map(output => (
                              <a
                                key={output.id}
                                href={output.url}
                                download={output.name}
                                className="group rounded-md border bg-card overflow-hidden hover:border-foreground/40 transition-colors"
                                title={`${output.path} · ${output.width}×${output.height}`}
                              >
                                <img
                                  src={output.url}
                                  alt=""
                                  className="w-full aspect-video object-cover bg-muted"
                                />
                                <div className="px-1 py-0.5 text-[9px] font-mono truncate text-muted-foreground group-hover:text-foreground">
                                  {output.name}
                                </div>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
