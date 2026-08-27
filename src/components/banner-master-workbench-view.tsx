'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crop,
  Download,
  FileArchive,
  Filter,
  ImagePlus,
  Layers,
  Loader2,
  RefreshCw,
  Target,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { MASTER_GROUPS, type MasterGroup } from '@/lib/banner-master-groups'
import {
  buildSizeByKey,
  findBestMasterGroup,
  formatBytes,
  generateBannerOutputs,
  getGroupSizes,
  readBannerSource,
  type BannerCropSettings,
  type BannerGenerationPlan,
  type BannerOutput,
  type BannerSize,
  type BannerSource,
  type CropMode,
  type FocalPoint,
  type OutputFormat,
} from '@/lib/banner-crop-engine'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'

function getFilesFromDataTransfer(dataTransfer: DataTransfer) {
  if (dataTransfer.files?.length > 0) return Array.from(dataTransfer.files)
  const files: File[] = []
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

function fileFingerprint(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

function sourceSizeKey(source: BannerSource) {
  return `${source.width}x${source.height}`
}

function getSourceMatchLabel(source: BannerSource, group: MasterGroup) {
  const key = sourceSizeKey(source)
  if (key === group.master) return '母版精确'
  if (group.sizes.includes(key)) return '尺寸命中'
  return '比例匹配'
}

function getCropLoss(source: BannerSource, target: BannerSize) {
  const sourceRatio = source.width / source.height
  const targetRatio = target.width / target.height
  if (Math.abs(sourceRatio - targetRatio) < 0.0001) return 0
  if (sourceRatio > targetRatio) return 1 - targetRatio / sourceRatio
  return 1 - sourceRatio / targetRatio
}

function riskMeta(loss: number) {
  if (loss <= 0.03) {
    return {
      label: '安全',
      className: 'border-emerald-600/25 bg-emerald-50 text-emerald-700',
    }
  }
  if (loss <= 0.08) {
    return {
      label: '复核',
      className: 'border-amber-600/30 bg-amber-50 text-amber-800',
    }
  }
  return {
    label: '高风险',
    className: 'border-red-600/35 bg-red-50 text-red-700',
  }
}

function getRiskCounts(source: BannerSource | null, sizes: BannerSize[]) {
  if (!source) return { safe: 0, review: 0, high: 0, maxLoss: 0 }

  return sizes.reduce(
    (stats, size) => {
      const loss = getCropLoss(source, size)
      stats.maxLoss = Math.max(stats.maxLoss, loss)
      if (loss <= 0.03) stats.safe += 1
      else if (loss <= 0.08) stats.review += 1
      else stats.high += 1
      return stats
    },
    { safe: 0, review: 0, high: 0, maxLoss: 0 }
  )
}

function sortSizeKey(a: string, b: string) {
  const [aw, ah] = a.split('x').map(Number)
  const [bw, bh] = b.split('x').map(Number)
  return aw - bw || ah - bh
}

export default function BannerMasterWorkbenchView() {
  const [sources, setSources] = useState<BannerSource[]>([])
  const [outputs, setOutputs] = useState<BannerOutput[]>([])
  const [cropMode, setCropMode] = useState<CropMode>('cover')
  const [focalPoint, setFocalPoint] = useState<FocalPoint>('center')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpg')
  const [quality, setQuality] = useState(92)
  const [backgroundColor] = useState('#000000')
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isZipping, setIsZipping] = useState(false)
  const [progress, setProgress] = useState(0)
  const [readProgress, setReadProgress] = useState('')
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const [sortMode, setSortMode] = useState<'gain' | 'default'>('gain')
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const sourcesRef = useRef<BannerSource[]>([])
  const outputsRef = useRef<BannerOutput[]>([])
  const dragCounterRef = useRef(0)
  const { toast } = useToast()

  const sizeByKey = useMemo(() => buildSizeByKey(), [])

  useEffect(() => { sourcesRef.current = sources }, [sources])
  useEffect(() => { outputsRef.current = outputs }, [outputs])
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach(source => URL.revokeObjectURL(source.previewUrl))
      outputsRef.current.forEach(output => URL.revokeObjectURL(output.url))
    }
  }, [])

  const sourceByGroup = useMemo(() => {
    const map = new Map<string, BannerSource>()
    sources.forEach(source => map.set(findBestMasterGroup(source).id, source))
    return map
  }, [sources])

  const allTargetKeys = useMemo(
    () => new Set(MASTER_GROUPS.flatMap(group => group.sizes)),
    []
  )

  const coveredTargetKeys = useMemo(() => {
    const covered = new Set<string>()
    for (const group of MASTER_GROUPS) {
      if (!sourceByGroup.has(group.id)) continue
      group.sizes.forEach(size => covered.add(size))
    }
    return covered
  }, [sourceByGroup])

  const generatedTargetKeys = useMemo(
    () => new Set(outputs.map(output => `${output.width}x${output.height}`)),
    [outputs]
  )

  const completedMasters = sourceByGroup.size
  const coveredTargets = coveredTargetKeys.size
  const generatedTargets = generatedTargetKeys.size
  const totalTargets = allTargetKeys.size
  const missingTargets = Math.max(0, totalTargets - coveredTargets)
  const waitingToGenerate = [...coveredTargetKeys].filter(key => !generatedTargetKeys.has(key)).length
  const coveragePercent = totalTargets > 0 ? Math.round((coveredTargets / totalTargets) * 100) : 0
  const generationPercent = totalTargets > 0 ? Math.round((generatedTargets / totalTargets) * 100) : 0

  const gainForGroup = (group: MasterGroup) =>
    group.sizes.reduce((sum, key) => sum + (coveredTargetKeys.has(key) ? 0 : 1), 0)

  const overallRisk = useMemo(() => {
    const claimed = new Set<string>()
    let review = 0
    let high = 0

    for (const group of MASTER_GROUPS) {
      const source = sourceByGroup.get(group.id)
      if (!source) continue
      for (const target of getGroupSizes(group, sizeByKey)) {
        if (claimed.has(target.key)) continue
        claimed.add(target.key)
        const loss = getCropLoss(source, target)
        if (loss > 0.08) high += 1
        else if (loss > 0.03) review += 1
      }
    }

    return { review, high, total: review + high }
  }, [sourceByGroup, sizeByKey])

  const recommendedGroups = useMemo(
    () => MASTER_GROUPS
      .filter(group => !sourceByGroup.has(group.id) && gainForGroup(group) > 0)
      .sort((a, b) => gainForGroup(b) - gainForGroup(a) || b.sizes.length - a.sizes.length),
    [sourceByGroup, coveredTargetKeys]
  )

  const recommended = recommendedGroups[0] || null

  const visibleGroups = useMemo(() => {
    let list = [...MASTER_GROUPS]

    if (showMissingOnly) {
      list = list.filter(group => {
        const source = sourceByGroup.get(group.id)
        const needsSource = !source && gainForGroup(group) > 0
        const hasPendingOutput = Boolean(source) && group.sizes.some(key => !generatedTargetKeys.has(key))
        return needsSource || hasPendingOutput
      })
    }

    if (sortMode === 'gain') {
      list.sort((a, b) => {
        const aSource = sourceByGroup.has(a.id)
        const bSource = sourceByGroup.has(b.id)
        const aPending = aSource && a.sizes.some(key => !generatedTargetKeys.has(key))
        const bPending = bSource && b.sizes.some(key => !generatedTargetKeys.has(key))
        const aRank = !aSource && gainForGroup(a) > 0 ? 0 : aPending ? 1 : 2
        const bRank = !bSource && gainForGroup(b) > 0 ? 0 : bPending ? 1 : 2
        if (aRank !== bRank) return aRank - bRank
        return gainForGroup(b) - gainForGroup(a) || b.sizes.length - a.sizes.length
      })
    }

    return list
  }, [showMissingOnly, sortMode, sourceByGroup, coveredTargetKeys, generatedTargetKeys])

  const statusMeta = useMemo(() => {
    if (sources.length === 0) {
      return {
        label: '等待上传母版',
        className: 'border-zinc-300 bg-zinc-50 text-zinc-700',
      }
    }
    if (missingTargets > 0) {
      return {
        label: `待补母版 · ${missingTargets} 尺寸未覆盖`,
        className: 'border-amber-300 bg-amber-50 text-amber-800',
      }
    }
    if (waitingToGenerate > 0) {
      return {
        label: `覆盖完成 · 待生成 ${waitingToGenerate}`,
        className: 'border-blue-300 bg-blue-50 text-blue-800',
      }
    }
    if (generatedTargets === totalTargets && totalTargets > 0) {
      return {
        label: '全部生成完成',
        className: 'border-emerald-300 bg-emerald-50 text-emerald-800',
      }
    }
    return {
      label: '处理中',
      className: 'border-zinc-300 bg-zinc-50 text-zinc-700',
    }
  }, [sources.length, missingTargets, waitingToGenerate, generatedTargets, totalTargets])

  const cropSettings: BannerCropSettings = {
    cropMode,
    focalPoint,
    outputFormat,
    quality,
    backgroundColor,
  }

  const clearOutputsForSourceIds = (sourceIds: Set<string>) => {
    if (sourceIds.size === 0) return
    setOutputs(prev => {
      const removed = prev.filter(output => sourceIds.has(output.sourceId))
      removed.forEach(output => URL.revokeObjectURL(output.url))
      return prev.filter(output => !sourceIds.has(output.sourceId))
    })
  }

  const invalidateAllOutputs = () => {
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setOutputs([])
    setProgress(0)
  }

  const addSources = async (fileList: FileList | File[] | null | undefined) => {
    if (!fileList || fileList.length === 0 || isReading) return

    const imageFiles = Array.from(fileList).filter(file =>
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
    )
    if (imageFiles.length === 0) {
      toast({ title: '请选择图片文件', description: '支持 PNG / JPG / WebP / GIF / BMP', variant: 'destructive' })
      return
    }

    const fingerprints = new Set(sources.map(source => fileFingerprint(source.file)))
    const files = imageFiles.filter(file => !fingerprints.has(fileFingerprint(file)))
    const exactSkipped = imageFiles.length - files.length
    if (files.length === 0) {
      toast({ title: '没有新增文件', description: '这些文件已经上传过，不会重复加入。' })
      return
    }

    setIsReading(true)
    setReadProgress(`0 / ${files.length}`)
    const loaded: BannerSource[] = []
    const errors: string[] = []
    let done = 0

    for (const file of files) {
      try {
        loaded.push(await readBannerSource(file))
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : '读取失败'}`)
      } finally {
        done += 1
        setReadProgress(`${done} / ${files.length}`)
      }
    }

    let replaced = 0
    const replacedSourceIds = new Set<string>()
    const next = [...sources]

    for (const source of loaded) {
      const sourceGroup = findBestMasterGroup(source)
      const sameGroupIndex = next.findIndex(existing => findBestMasterGroup(existing).id === sourceGroup.id)

      if (sameGroupIndex >= 0) {
        const previous = next[sameGroupIndex]
        replacedSourceIds.add(previous.id)
        URL.revokeObjectURL(previous.previewUrl)
        next[sameGroupIndex] = source
        replaced += 1
      } else {
        next.push(source)
      }
    }

    clearOutputsForSourceIds(replacedSourceIds)
    setSources(next)
    setIsReading(false)
    setReadProgress('')
    if (inputRef.current) inputRef.current.value = ''

    toast({
      title: `已接收 ${loaded.length} 张母版`,
      description: [
        replaced > 0 ? `自动替换 ${replaced} 个重复母版分类` : '',
        exactSkipped > 0 ? `跳过 ${exactSkipped} 个完全重复文件` : '',
        errors.length > 0 ? `${errors.length} 张读取失败` : '',
      ].filter(Boolean).join(' · ') || '每个母版分类只保留 1 张，避免重复出图。',
      variant: errors.length > 0 ? 'destructive' : 'default',
    })
  }

  const removeSource = (groupId: string) => {
    const source = sourceByGroup.get(groupId)
    if (!source) return
    URL.revokeObjectURL(source.previewUrl)
    clearOutputsForSourceIds(new Set([source.id]))
    setSources(prev => prev.filter(item => item.id !== source.id))
  }

  const resetAll = () => {
    sources.forEach(source => URL.revokeObjectURL(source.previewUrl))
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setSources([])
    setOutputs([])
    setProgress(0)
    setExpandedGroupId(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const buildMissingPlans = () => {
    const existingKeys = new Set(outputs.map(output => `${output.width}x${output.height}`))
    const claimed = new Set(existingKeys)
    const plans: BannerGenerationPlan[] = []

    for (const group of MASTER_GROUPS) {
      const source = sourceByGroup.get(group.id)
      if (!source) continue
      const sizes = getGroupSizes(group, sizeByKey).filter(size => {
        if (claimed.has(size.key)) return false
        claimed.add(size.key)
        return true
      })
      if (sizes.length > 0) plans.push({ source, group, sizes })
    }
    return plans
  }

  const createAndSaveZip = async (items: BannerOutput[]) => {
    const zip = new JSZip()
    const used = new Set<string>()
    for (const output of items) {
      const key = `${output.width}x${output.height}`
      if (used.has(key)) continue
      used.add(key)
      zip.file(output.name, output.blob)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `banner_master_workbench_${used.size}sizes.zip`)
    return used.size
  }

  const handleGenerateMissing = async () => {
    if (isGenerating || sources.length === 0) return
    const plans = buildMissingPlans()
    const total = plans.reduce((sum, plan) => sum + plan.sizes.length, 0)

    if (total === 0) {
      toast({
        title: '当前可覆盖尺寸已全部生成',
        description: missingTargets > 0 ? `仍有 ${missingTargets} 个尺寸需要补母版。` : '全部目标尺寸均已生成。',
      })
      return
    }

    setIsGenerating(true)
    setProgress(0)
    try {
      const result = await generateBannerOutputs(
        plans,
        cropSettings,
        setProgress,
        { layout: 'flat', useFormatFolder: false }
      )
      setOutputs(prev => [...prev, ...result.outputs])
      toast({
        title: `新增生成 ${result.outputs.length} 张`,
        description: result.failed > 0
          ? `失败 ${result.failed} 张，请复核对应母版。`
          : '只生成当前母版已覆盖、但尚未生成的目标尺寸。',
        variant: result.failed > 0 ? 'destructive' : 'default',
      })
    } catch (error) {
      toast({
        title: '生成失败',
        description: error instanceof Error ? error.message : '生成过程中出现错误',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateAndExport = async () => {
    if (isGenerating || isZipping || sources.length === 0) return

    setIsGenerating(true)
    setProgress(0)
    let nextOutputs = outputs
    let failed = 0

    try {
      const plans = buildMissingPlans()
      const total = plans.reduce((sum, plan) => sum + plan.sizes.length, 0)

      if (total > 0) {
        const result = await generateBannerOutputs(
          plans,
          cropSettings,
          setProgress,
          { layout: 'flat', useFormatFolder: false }
        )
        failed = result.failed
        nextOutputs = [...outputs, ...result.outputs]
        setOutputs(nextOutputs)
      }

      if (nextOutputs.length === 0) {
        toast({ title: '暂无可导出内容', description: '请先上传能够覆盖目标尺寸的母版。' })
        return
      }

      setIsZipping(true)
      const uniqueCount = await createAndSaveZip(nextOutputs)
      toast({
        title: `已导出 ${uniqueCount} 个唯一尺寸`,
        description: [
          failed > 0 ? `本次有 ${failed} 张生成失败` : '',
          missingTargets > 0 ? `仍有 ${missingTargets} 个尺寸尚未被母版覆盖` : '',
        ].filter(Boolean).join(' · ') || '已生成并打包全部当前可用成品。',
        variant: failed > 0 ? 'destructive' : 'default',
      })
    } catch (error) {
      toast({
        title: '生成或导出失败',
        description: error instanceof Error ? error.message : '处理过程中出现错误',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
      setIsZipping(false)
    }
  }

  const downloadZip = async () => {
    if (outputs.length === 0 || isZipping) return
    setIsZipping(true)
    try {
      await createAndSaveZip(outputs)
    } catch (error) {
      toast({
        title: 'ZIP 打包失败',
        description: error instanceof Error ? error.message : '打包失败',
        variant: 'destructive',
      })
    } finally {
      setIsZipping(false)
    }
  }

  const onSettingsChange = <T,>(setter: (value: T) => void, value: T) => {
    invalidateAllOutputs()
    setter(value)
  }

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragCounterRef.current += 1
    setIsDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsDragging(false)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragCounterRef.current = 0
    setIsDragging(false)
    void addSources(getFilesFromDataTransfer(event.dataTransfer))
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4 px-3 py-4 sm:px-4 min-[1440px]:px-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-zinc-950 text-white hover:bg-zinc-950">母版优先</Badge>
              <Badge variant="outline">自动去重</Badge>
              <Badge variant="outline">覆盖 / 生成分离</Badge>
            </div>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-extrabold text-zinc-950">
              <Layers className="h-5 w-5" />
              Banner 母版工作台
            </h2>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              母版覆盖完成不再等于成品完成。这里会分别统计“已覆盖”“已生成”“待生成”和“待复核”。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('h-8 px-3 text-xs font-extrabold', statusMeta.className)}>
              {statusMeta.label}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setShowMissingOnly(value => !value)}>
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              {showMissingOnly ? '显示全部母版' : '只看待处理'}
            </Button>
            <Button variant="outline" size="sm" onClick={resetAll} disabled={sources.length === 0 && outputs.length === 0}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              清空本次
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border bg-zinc-50 px-3 py-2.5">
            <div className="text-2xl font-extrabold tabular-nums text-zinc-950">{completedMasters}/{MASTER_GROUPS.length}</div>
            <div className="text-[11px] font-bold text-zinc-500">已上传母版</div>
          </div>
          <div className="rounded-lg border bg-emerald-50/60 px-3 py-2.5">
            <div className="text-2xl font-extrabold tabular-nums text-emerald-700">{coveredTargets}/{totalTargets}</div>
            <div className="text-[11px] font-bold text-zinc-500">已覆盖目标尺寸</div>
          </div>
          <div className="rounded-lg border bg-blue-50/60 px-3 py-2.5">
            <div className="text-2xl font-extrabold tabular-nums text-blue-700">{generatedTargets}/{totalTargets}</div>
            <div className="text-[11px] font-bold text-zinc-500">已实际生成</div>
          </div>
          <div className="rounded-lg border bg-violet-50/60 px-3 py-2.5">
            <div className="text-2xl font-extrabold tabular-nums text-violet-700">{waitingToGenerate}</div>
            <div className="text-[11px] font-bold text-zinc-500">已覆盖待生成</div>
          </div>
          <div className="rounded-lg border bg-amber-50/60 px-3 py-2.5">
            <div className="text-2xl font-extrabold tabular-nums text-amber-700">{missingTargets}</div>
            <div className="text-[11px] font-bold text-zinc-500">尚未覆盖</div>
          </div>
          <div className="rounded-lg border bg-orange-50/60 px-3 py-2.5">
            <div className="text-2xl font-extrabold tabular-nums text-orange-700">{overallRisk.total}</div>
            <div className="text-[11px] font-bold text-zinc-500">建议复核</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border bg-zinc-50/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-bold">
              <span className="text-zinc-600">母版覆盖进度</span>
              <span className="tabular-nums text-emerald-700">{coveragePercent}% · {coveredTargets}/{totalTargets}</span>
            </div>
            <Progress value={coveragePercent} className="h-2" />
          </div>
          <div className="rounded-lg border bg-zinc-50/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-bold">
              <span className="text-zinc-600">成品生成进度</span>
              <span className="tabular-nums text-blue-700">{generationPercent}% · {generatedTargets}/{totalTargets}</span>
            </div>
            <Progress value={generationPercent} className="h-2" />
          </div>
        </div>
      </section>

      {recommended && (
        <section className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg bg-violet-600 p-2 text-white"><Target className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-violet-950">建议下一张：{recommended.label}</div>
              <div className="mt-0.5 text-xs font-medium text-violet-800/80">
                做这一张可新增覆盖 {gainForGroup(recommended)} 个目标尺寸 · {recommended.usage}
              </div>
            </div>
          </div>
          <Button size="sm" className="bg-violet-700 hover:bg-violet-800" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            上传这批母版
          </Button>
        </section>
      )}

      <div className="grid gap-4 min-[1280px]:grid-cols-[330px_minmax(0,1fr)]">
        <div className="space-y-4 min-[1280px]:sticky min-[1280px]:top-4 min-[1280px]:self-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Upload className="h-4 w-4" />上传母版</CardTitle>
              <CardDescription>可一次拖入多张，系统自动归类；同类只保留最新一张。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={cn(
                  'rounded-xl border border-dashed p-6 text-center transition-colors',
                  isDragging ? 'border-zinc-950 bg-zinc-100' : 'border-zinc-300 bg-zinc-50 hover:bg-zinc-100',
                  isReading ? 'pointer-events-none opacity-70' : 'cursor-pointer'
                )}
                onClick={() => inputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  className="sr-only"
                  onChange={event => void addSources(event.target.files)}
                />
                {isReading ? (
                  <>
                    <Loader2 className="mx-auto h-7 w-7 animate-spin" />
                    <div className="mt-2 text-sm font-bold">读取中 {readProgress}</div>
                  </>
                ) : (
                  <>
                    <ImagePlus className="mx-auto h-7 w-7 text-zinc-600" />
                    <div className="mt-2 text-sm font-bold">拖入 / 选择多张母版</div>
                    <div className="mt-1 text-[11px] font-medium text-zinc-500">重复母版自动替换，不会重复出图</div>
                  </>
                )}
              </div>

              {sources.length > 0 && (
                <div className="rounded-lg border bg-zinc-50 p-2.5 text-xs">
                  <div className="flex items-center justify-between"><span className="font-bold">本次已上传</span><span>{sources.length} 张</span></div>
                  <div className="mt-1 flex items-center justify-between text-emerald-700"><span>已覆盖</span><span>{coveredTargets} 个</span></div>
                  <div className="mt-1 flex items-center justify-between text-blue-700"><span>已生成</span><span>{generatedTargets} 个</span></div>
                  <div className="mt-1 flex items-center justify-between text-violet-700"><span>待生成</span><span>{waitingToGenerate} 个</span></div>
                  <div className="mt-1 flex items-center justify-between text-amber-700"><span>未覆盖</span><span>{missingTargets} 个</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Crop className="h-4 w-4" />生成设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">裁剪模式</Label>
                <Select value={cropMode} onValueChange={value => onSettingsChange(setCropMode, value as CropMode)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">等比填充裁剪</SelectItem>
                    <SelectItem value="contain">完整留边</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">裁剪焦点</Label>
                <Select value={focalPoint} onValueChange={value => onSettingsChange(setFocalPoint, value as FocalPoint)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="center">居中</SelectItem>
                    <SelectItem value="top">靠上</SelectItem>
                    <SelectItem value="bottom">靠下</SelectItem>
                    <SelectItem value="left">靠左</SelectItem>
                    <SelectItem value="right">靠右</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">输出格式</Label>
                <Select value={outputFormat} onValueChange={value => onSettingsChange(setOutputFormat, value as OutputFormat)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jpg">JPG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(outputFormat === 'jpg' || outputFormat === 'webp') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label className="text-xs">质量</Label><span className="text-xs text-zinc-500">{quality}%</span></div>
                  <Slider value={[quality]} min={50} max={100} step={1} onValueChange={value => onSettingsChange(setQuality, value[0])} />
                </div>
              )}

              <div className="rounded-lg border bg-zinc-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-zinc-600">
                “生成并导出”会补齐 <span className="font-extrabold text-violet-700">{waitingToGenerate}</span> 个当前已覆盖但尚未生成的尺寸，
                然后把当前全部 <span className="font-extrabold text-blue-700">{generatedTargets + waitingToGenerate}</span> 个可用唯一尺寸打包下载。
                {missingTargets > 0 && <> 另外仍有 <span className="font-extrabold text-amber-700">{missingTargets}</span> 个尺寸需要继续补母版。</>}
              </div>

              <Button
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={sources.length === 0 || isGenerating || isZipping || (waitingToGenerate === 0 && outputs.length === 0)}
                onClick={() => void handleGenerateAndExport()}
              >
                {isGenerating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileArchive className="mr-1.5 h-4 w-4" />}
                {isGenerating
                  ? `生成中 ${Math.round(progress)}%...`
                  : isZipping
                    ? '打包中...'
                    : waitingToGenerate > 0
                      ? `生成并导出（${waitingToGenerate}）`
                      : '重新下载完整 ZIP'}
              </Button>
              {isGenerating && <Progress value={progress} className="h-1.5" />}

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={sources.length === 0 || isGenerating || waitingToGenerate === 0} onClick={() => void handleGenerateMissing()}>
                  <Zap className="mr-1.5 h-3.5 w-3.5" />仅生成
                </Button>
                <Button variant="outline" disabled={outputs.length === 0 || isZipping} onClick={() => void downloadZip()}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />当前 ZIP
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-base">母版任务看板</CardTitle>
                <CardDescription className="mt-1">“只看待处理”会同时显示缺母版的项目和已覆盖但还没生成完的项目。</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={sortMode === 'gain' ? 'default' : 'outline'} onClick={() => setSortMode('gain')}>
                  按待处理优先
                </Button>
                <Button size="sm" variant={sortMode === 'default' ? 'default' : 'outline'} onClick={() => setSortMode('default')}>
                  按编号排序
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleGroups.map(group => {
              const source = sourceByGroup.get(group.id) || null
              const isExpanded = expandedGroupId === group.id
              const sizes = getGroupSizes(group, sizeByKey)
              const generatedForGroup = new Set(group.sizes.filter(sizeKey => generatedTargetKeys.has(sizeKey)))
              const pendingForGroup = source ? group.sizes.filter(sizeKey => !generatedTargetKeys.has(sizeKey)).length : 0
              const riskCounts = getRiskCounts(source, sizes)
              const reviewTotal = riskCounts.review + riskCounts.high
              const gain = gainForGroup(group)
              const matchLabel = source ? getSourceMatchLabel(source, group) : ''
              const cardClass = source
                ? pendingForGroup > 0
                  ? 'border-blue-200 bg-blue-50/30'
                  : 'border-emerald-200 bg-emerald-50/30'
                : gain > 0
                  ? 'border-amber-200 bg-amber-50/20'
                  : 'border-zinc-200 bg-white'

              return (
                <div key={group.id} className={cn('overflow-hidden rounded-xl border', cardClass)}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-zinc-50/70"
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                  >
                    <div className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-extrabold',
                      source
                        ? pendingForGroup > 0
                          ? 'border-blue-300 bg-blue-100 text-blue-800'
                          : 'border-emerald-300 bg-emerald-100 text-emerald-800'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                    )}>
                      {group.code}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-extrabold text-zinc-950">{group.label}</span>
                        {source ? (
                          pendingForGroup > 0 ? (
                            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800">待生成 {pendingForGroup}</Badge>
                          ) : (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />已生成</Badge>
                          )
                        ) : gain > 0 ? (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">待补母版 +{gain}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-zinc-300 text-zinc-500">可选母版</Badge>
                        )}
                        {source && (
                          reviewTotal > 0 ? (
                            <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-800">需复核 {reviewTotal}</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-600/25 bg-emerald-50 text-emerald-700">全部安全</Badge>
                          )
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-zinc-500">
                        <span className="font-mono">母版 {group.master}</span>
                        <span>{group.ratioLabel}</span>
                        <span>负责 {group.sizes.length} 个尺寸</span>
                        {!source && gain > 0 && <span className="font-bold text-violet-700">现在做可新增 {gain} 个覆盖</span>}
                        {source && <span className="text-emerald-700">{matchLabel}</span>}
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <div className="text-sm font-extrabold tabular-nums">{source ? `${generatedForGroup.size}/${group.sizes.length}` : `+${gain}`}</div>
                      <div className="text-[10px] font-medium text-zinc-500">{source ? '已生成/负责' : '新增覆盖'}</div>
                    </div>
                    {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t bg-white p-3">
                      <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
                        <div>
                          {source ? (
                            <div className="rounded-lg border bg-zinc-50 p-2">
                              <img src={source.previewUrl} alt="" className="aspect-video w-full rounded-md border bg-zinc-100 object-cover" />
                              <div className="mt-2 truncate text-xs font-bold" title={source.name}>{source.name}</div>
                              <div className="mt-0.5 text-[10px] text-zinc-500">{source.width}×{source.height} · {formatBytes(source.size)}</div>
                              <Button variant="outline" size="sm" className="mt-2 h-7 w-full text-xs" onClick={event => { event.stopPropagation(); removeSource(group.id) }}>
                                <Trash2 className="mr-1 h-3 w-3" />移除此母版
                              </Button>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed bg-zinc-50 p-4 text-center">
                              <Upload className="mx-auto h-5 w-5 text-zinc-500" />
                              <div className="mt-2 text-xs font-bold">需要 {group.master}</div>
                              <div className="mt-1 text-[10px] leading-relaxed text-zinc-500">{group.usage}</div>
                              <Button size="sm" className="mt-3 h-7 text-xs" onClick={event => { event.stopPropagation(); inputRef.current?.click() }}>上传母版</Button>
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-extrabold">负责尺寸 · {sizes.length} 个</div>
                            {source && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="border-emerald-600/25 bg-emerald-50 text-[10px] text-emerald-700">安全 {riskCounts.safe}</Badge>
                                {riskCounts.review > 0 && <Badge variant="outline" className="border-amber-600/30 bg-amber-50 text-[10px] text-amber-800">复核 {riskCounts.review}</Badge>}
                                {riskCounts.high > 0 && <Badge variant="outline" className="border-red-600/35 bg-red-50 text-[10px] text-red-700">高风险 {riskCounts.high}</Badge>}
                              </div>
                            )}
                          </div>

                          {source && riskCounts.maxLoss > 0.03 && (
                            <div className="mb-2 flex items-center gap-1 text-[10px] font-bold text-zinc-500">
                              <AlertTriangle className="h-3 w-3 text-amber-600" />
                              最大裁切差异约 {(riskCounts.maxLoss * 100).toFixed(1)}%，风险只针对具体输出尺寸，不代表整张母版有问题。
                            </div>
                          )}

                          <div className="flex flex-wrap gap-1.5">
                            {[...group.sizes].sort(sortSizeKey).map(sizeKey => {
                              const generated = generatedForGroup.has(sizeKey)
                              const target = sizeByKey.get(sizeKey)
                              const sizeLoss = source && target ? getCropLoss(source, target) : 0
                              const sizeRisk = riskMeta(sizeLoss)

                              return (
                                <Badge
                                  key={sizeKey}
                                  variant="outline"
                                  title={source ? `${sizeRisk.label} · 裁切差异约 ${(sizeLoss * 100).toFixed(1)}%${generated ? ' · 已生成' : ' · 待生成'}` : '等待母版'}
                                  className={cn(
                                    'font-mono text-[10px]',
                                    source ? sizeRisk.className : 'border-zinc-200 bg-zinc-50 text-zinc-500',
                                    generated && 'ring-1 ring-emerald-500/35'
                                  )}
                                >
                                  {generated ? '✓ ' : ''}{sizeKey}
                                </Badge>
                              )
                            })}
                          </div>
                          <p className="mt-3 text-[11px] font-medium leading-relaxed text-zinc-500">{group.description}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {visibleGroups.length === 0 && (
              <div className="rounded-xl border border-dashed py-12 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <div className="mt-2 text-sm font-extrabold">没有待处理项目</div>
                <div className="mt-1 text-xs text-zinc-500">全部目标尺寸都已覆盖并生成；复核项仍会在顶部单独统计。</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {outputs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm">已生成结果</CardTitle>
                <CardDescription>
                  {generatedTargetKeys.size}/{totalTargets} 个唯一尺寸 · {generationPercent}% · {formatBytes(outputs.reduce((sum, output) => sum + output.blob.size, 0))}
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => void downloadZip()} disabled={isZipping}>
                <Download className="mr-1.5 h-3.5 w-3.5" />下载当前 ZIP
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
              {outputs.slice(0, 60).map(output => (
                <a key={output.id} href={output.url} download={output.name} className="overflow-hidden rounded-lg border bg-white hover:border-zinc-500" title={`${output.width}×${output.height}`}>
                  <img src={output.url} alt="" className="aspect-video w-full bg-zinc-100 object-cover" />
                  <div className="truncate px-1.5 py-1 text-center font-mono text-[9px] text-zinc-500">{output.width}×{output.height}</div>
                </a>
              ))}
            </div>
            {outputs.length > 60 && <div className="mt-2 text-center text-[10px] text-zinc-500">仅展示前 60 张，ZIP 会包含全部唯一尺寸。</div>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
