'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Download, FileArchive, ImagePlus, Loader2,
  Package, RefreshCw, Settings2, Trash2, Upload, X
} from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import {
  drawBannerCrop,
  formatBytes,
  readBannerSource,
  sanitizeName,
  type BannerCropSettings,
  type BannerOutput,
  type BannerSize,
  type BannerSource,
  type CropMode,
  type OutputFormat,
} from '@/lib/banner-crop-engine'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'

type MasterPackCode = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8'
type MatchState = 'exact' | 'derived' | 'missing'

interface MasterPackSpec {
  code: MasterPackCode
  title: string
  sourceLabel: string
  sourceCandidates: string[]
  description: string
  targets: string[]
  fallbackFrom?: MasterPackCode
  note?: string
}

interface MasterPackRow {
  spec: MasterPackSpec
  source: BannerSource | null
  sourceFrom: MasterPackCode | null
  state: MatchState
  targets: BannerSize[]
  maxCropLoss: number
}

const MASTER_PACK_SPECS: MasterPackSpec[] = [
  {
    code: 'M1',
    title: '大横版纯图',
    sourceLabel: '3200x1200',
    sourceCandidates: ['3200x1200'],
    description: '大场景横图，覆盖大横版和宽横 Banner',
    targets: ['2952x960', '1920x900', '708x398', '720x350', '1200x534'],
    note: '多比例输出，主体建议放在中央安全区。',
  },
  {
    code: 'M2',
    title: '超宽详情背景',
    sourceLabel: '3200x420',
    sourceCandidates: ['3200x420'],
    description: '1600x336 太扁，不能从 M1 硬裁',
    targets: ['1600x336'],
  },
  {
    code: 'M3',
    title: '精品推荐图',
    sourceLabel: '1400x900',
    sourceCandidates: ['1400x900'],
    description: '角色 + 城堡 + SLG 氛围',
    targets: ['952x536'],
  },
  {
    code: 'M4',
    title: '活动中横卡',
    sourceLabel: '从 M3 派生 / 可建 1200x800',
    sourceCandidates: ['1200x800'],
    description: '从 M3 派生，活动中横卡输出',
    targets: ['742x500', '640x400'],
    fallbackFrom: 'M3',
  },
  {
    code: 'M5',
    title: '排行榜安全区',
    sourceLabel: '3000x1100',
    sourceCandidates: ['3000x1100'],
    description: '左侧安全区特殊，必须单独构图',
    targets: ['2952x822'],
    note: '左侧安全区不要放关键主体。',
  },
  {
    code: 'M6',
    title: '热游精选大 Banner',
    sourceLabel: '从 M5 派生 / 可建 2200x1200',
    sourceCandidates: ['2200x1200'],
    description: '导出 1952x1048，左侧 800px 留空',
    targets: ['1952x1048'],
    fallbackFrom: 'M5',
    note: '若从 M5 派生，必须人工确认左侧留空是否仍成立。',
  },
  {
    code: 'M7',
    title: '预约文案 Banner',
    sourceLabel: '从 M2 派生 / 3200x420',
    sourceCandidates: ['3200x420'],
    description: '从 M2 派生，加 Logo、Slogan、按钮',
    targets: ['2952x386'],
    fallbackFrom: 'M2',
    note: '文案、按钮、Logo 需要先做进源图。',
  },
  {
    code: 'M8',
    title: '方形卡片',
    sourceLabel: '1200x1200',
    sourceCandidates: ['1200x1200'],
    description: '不能从横图裁，底部 1/5 不能放文字',
    targets: ['984x984'],
    note: '底部 1/5 保持无文字安全区。',
  },
]

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

function parseSizeKey(key: string): BannerSize {
  const [width, height] = key.split('x').map(Number)
  return { key, width, height, label: key }
}

function sizeKeyOf(source: BannerSource) {
  return `${source.width}x${source.height}`
}

function getExtension(format: OutputFormat) {
  return format === 'jpg' ? 'jpg' : format
}

function getMasterCodeFromName(name: string): MasterPackCode | null {
  const normalized = name.toLowerCase().replace(/\s+/g, '')
  for (const spec of MASTER_PACK_SPECS) {
    if (normalized.includes(spec.code.toLowerCase())) return spec.code
  }
  return null
}

function getCropLoss(source: BannerSource, target: BannerSize) {
  const sourceRatio = source.width / source.height
  const targetRatio = target.width / target.height
  if (Math.abs(sourceRatio - targetRatio) < 0.0001) return 0
  if (sourceRatio > targetRatio) return 1 - targetRatio / sourceRatio
  return 1 - sourceRatio / targetRatio
}

function getRiskStyle(loss: number) {
  if (loss <= 0.03) return 'border-emerald-600/25 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (loss <= 0.08) return 'border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
  return 'border-red-600/35 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200'
}

function getRiskLabel(loss: number) {
  if (loss <= 0.03) return '安全'
  if (loss <= 0.08) return '复核'
  return '高风险'
}

function buildMasterPackZipFileName(outputs: BannerOutput[]) {
  if (outputs.length === 0) return 'banner_master_pack.zip'
  return `banner_master_pack_${outputs.length}files.zip`
}

function matchSourcesToSpecs(sources: BannerSource[]) {
  const assigned = new Map<MasterPackCode, BannerSource>()
  const unassigned: BannerSource[] = []

  for (const source of sources) {
    const namedCode = getMasterCodeFromName(source.name)
    if (namedCode) {
      assigned.set(namedCode, source)
      continue
    }

    const sourceSize = sizeKeyOf(source)
    const exactMatches = MASTER_PACK_SPECS.filter(spec => spec.sourceCandidates.includes(sourceSize))
    if (exactMatches.length > 0) {
      assigned.set(exactMatches[0].code, source)
      continue
    }

    unassigned.push(source)
  }

  return { assigned, unassigned }
}

export default function BannerMasterPackView() {
  const [sources, setSources] = useState<BannerSource[]>([])
  const [outputs, setOutputs] = useState<BannerOutput[]>([])
  const [cropMode, setCropMode] = useState<CropMode>('cover')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpg')
  const [quality, setQuality] = useState(92)
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [readProgress, setReadProgress] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isZipping, setIsZipping] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragCounterRef = useRef(0)
  const sourcesRef = useRef<BannerSource[]>([])
  const outputsRef = useRef<BannerOutput[]>([])
  const { toast } = useToast()

  const targetByCode = useMemo(
    () => new Map(MASTER_PACK_SPECS.map(spec => [spec.code, spec.targets.map(parseSizeKey)])),
    []
  )

  const { assigned, unassigned } = useMemo(() => matchSourcesToSpecs(sources), [sources])

  const rows = useMemo<MasterPackRow[]>(() => {
    return MASTER_PACK_SPECS.map(spec => {
      const exactSource = assigned.get(spec.code) || null
      const fallbackSource = spec.fallbackFrom ? assigned.get(spec.fallbackFrom) || null : null
      const source = exactSource || fallbackSource
      const targets = targetByCode.get(spec.code) || []
      const state: MatchState = exactSource ? 'exact' : fallbackSource ? 'derived' : 'missing'
      const maxCropLoss = source
        ? targets.reduce((max, target) => Math.max(max, getCropLoss(source, target)), 0)
        : 0

      return {
        spec,
        source,
        sourceFrom: exactSource ? spec.code : fallbackSource ? spec.fallbackFrom || null : null,
        state,
        targets,
        maxCropLoss,
      }
    })
  }, [assigned, targetByCode])

  const coveredRows = rows.filter(row => row.source)
  const missingRows = rows.filter(row => row.state === 'missing')
  const derivedRows = rows.filter(row => row.state === 'derived')
  const riskyRows = rows.filter(row => row.source && row.maxCropLoss > 0.08)
  const totalOutputCount = coveredRows.reduce((sum, row) => sum + row.targets.length, 0)
  const totalOutputSize = outputs.reduce((sum, output) => sum + output.blob.size, 0)

  const cropSettings: BannerCropSettings = {
    cropMode,
    focalPoint: 'center',
    outputFormat,
    quality,
    backgroundColor: '#000000',
  }

  const resetFileInput = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  const invalidateOutputs = () => {
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setOutputs([])
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
      toast({ title: '均为重复文件', description: '这些图片已在队列中' })
      resetFileInput()
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
      invalidateOutputs()
      setSources(prev => [...prev, ...nextSources])
      toast({
        title: `已添加 ${nextSources.length} 张 M1-M8 母版`,
        description: skipped > 0 ? `跳过 ${skipped} 张重复文件` : '将按文件名 M1-M8 或源尺寸严格配对',
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

  const resetAll = () => {
    sources.forEach(source => URL.revokeObjectURL(source.previewUrl))
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setSources([])
    setOutputs([])
    setProgress(0)
    resetFileInput()
  }

  const saveOutputsZip = async (items: BannerOutput[]) => {
    if (items.length === 0 || isZipping) return false
    setIsZipping(true)
    try {
      const zip = new JSZip()
      items.forEach(output => zip.file(output.path, output.blob))
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, buildMasterPackZipFileName(items))
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : '打包失败'
      toast({ title: 'ZIP 打包失败', description: reason, variant: 'destructive' })
      return false
    } finally {
      setIsZipping(false)
    }
  }

  const generateOutputs = async (options: { download?: boolean } = {}) => {
    if (isGenerating || isReading || totalOutputCount === 0) return

    invalidateOutputs()
    setIsGenerating(true)
    setProgress(0)

    const nextOutputs: BannerOutput[] = []
    const usedPaths = new Set<string>()
    const outputExt = getExtension(outputFormat)
    let done = 0
    let failed = 0

    for (const row of rows) {
      if (!row.source) continue

      for (const target of row.targets) {
        try {
          const blob = await drawBannerCrop(row.source, target, cropSettings)
          const folder = `${row.spec.code}_${sanitizeName(row.spec.title)}`
          const basePath = `${folder}/${target.label}.${outputExt}`
          const path = usedPaths.has(basePath)
            ? `${folder}/${target.label}-${usedPaths.size + 1}.${outputExt}`
            : basePath
          usedPaths.add(path)
          const url = URL.createObjectURL(blob)

          nextOutputs.push({
            id: `${row.spec.code}-${row.source.id}-${target.key}`,
            sourceId: row.source.id,
            sourceBaseName: row.spec.code,
            masterGroup: `${row.spec.code} ${row.spec.title}`,
            name: path.split('/').pop() || `${target.label}.${outputExt}`,
            path,
            width: target.width,
            height: target.height,
            blob,
            url,
          })
        } catch {
          failed += 1
        } finally {
          done += 1
          setProgress(Math.round((done / totalOutputCount) * 100))
        }
      }
    }

    setOutputs(nextOutputs)
    setIsGenerating(false)

    if (options.download && nextOutputs.length > 0) {
      await saveOutputsZip(nextOutputs)
    }

    toast({
      title: failed > 0 ? `生成完成：${nextOutputs.length} 个，失败 ${failed} 个` : `生成完成：${nextOutputs.length} 个文件`,
      description: missingRows.length > 0 || derivedRows.length > 0 || riskyRows.length > 0
        ? `缺 ${missingRows.length} 类 · 派生 ${derivedRows.length} 类 · 高风险 ${riskyRows.length} 类`
        : 'M1-M8 均为独立母版或安全派生',
      variant: failed > 0 || riskyRows.length > 0 ? 'destructive' : 'default',
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

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 space-y-5 min-[1440px]:px-6">
      <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Package className="h-5 w-5 text-foreground" />
            Banner 母版配对
            <Badge className="border-sky-600 bg-sky-600 text-[10px] text-white hover:bg-sky-600">第一期 07</Badge>
            <Badge className="border-sky-600 bg-sky-600 text-[10px] text-white hover:bg-sky-600">M1-M8</Badge>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            只按指定母版源尺寸或文件名 M1-M8 配对，支持 M4/M6/M7 派生输出，避免旧规则误裁
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-border/80"
          onClick={resetAll}
          disabled={sources.length === 0 && outputs.length === 0}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          重置全部
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1440px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 min-[1440px]:sticky min-[1440px]:top-20 min-[1440px]:self-start">
          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Upload className="h-4 w-4 text-muted-foreground" />
                上传 M1-M8 母版
              </CardTitle>
              <CardDescription className="text-xs">建议文件名包含 M1 / M2 / M3 ...，同尺寸歧义会优先按文件名</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div
                className={cn(
                  'relative rounded-xl border border-dashed p-4 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring',
                  isDragging ? 'border-foreground bg-muted/50' : 'border-border hover:border-foreground/40 hover:bg-muted/30',
                  isReading ? 'pointer-events-none opacity-70' : 'cursor-pointer'
                )}
                onClick={() => inputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={handleDrop}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="上传 M1-M8 母版原图"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  multiple
                  className="sr-only"
                  onChange={event => void addSources(event.target.files)}
                />
                {isReading ? (
                  <>
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-foreground" />
                    <div className="mt-2 text-sm font-medium">读取中 {readProgress}</div>
                  </>
                ) : sources.length > 0 ? (
                  <>
                    <ImagePlus className="mx-auto h-7 w-7 text-foreground/70" />
                    <div className="mt-2 text-sm font-medium">已添加 {sources.length} 张母版</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">点击或拖入可继续添加</div>
                  </>
                ) : (
                  <>
                    <Upload className="mx-auto h-7 w-7 text-muted-foreground" />
                    <div className="mt-2 text-sm font-medium">拖入 M1-M8 母版原图</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">PNG / JPG / WebP / GIF / BMP</div>
                  </>
                )}
              </div>

              {sources.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 rounded-lg border-border/80 text-xs"
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    继续添加
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-border/80 px-2.5 text-xs"
                    onClick={resetAll}
                    title="清空队列"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border/80 bg-muted/20 text-center">
                <div className="px-1 py-2">
                  <div className="text-base font-semibold tabular-nums">{coveredRows.length}</div>
                  <div className="text-[10px] text-muted-foreground">已配对</div>
                </div>
                <div className="px-1 py-2">
                  <div className="text-base font-semibold tabular-nums text-amber-600">{derivedRows.length}</div>
                  <div className="text-[10px] text-muted-foreground">派生</div>
                </div>
                <div className="px-1 py-2">
                  <div className="text-base font-semibold tabular-nums">{totalOutputCount}</div>
                  <div className="text-[10px] text-muted-foreground">预计输出</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                输出设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">裁剪模式</Label>
                <Select value={cropMode} onValueChange={value => { invalidateOutputs(); setCropMode(value as CropMode) }}>
                  <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">等比填充裁剪</SelectItem>
                    <SelectItem value="contain">等比完整留边</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">输出格式</Label>
                <Select value={outputFormat} onValueChange={value => { invalidateOutputs(); setOutputFormat(value as OutputFormat) }}>
                  <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jpg">JPG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(outputFormat === 'jpg' || outputFormat === 'webp') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">质量</Label>
                    <span className="font-mono text-xs text-muted-foreground">{quality}%</span>
                  </div>
                  <Slider value={[quality]} min={50} max={100} step={1} onValueChange={value => { invalidateOutputs(); setQuality(value[0]) }} />
                </div>
              )}

              <Button
                className="h-9 w-full rounded-lg bg-foreground text-background hover:bg-foreground/90"
                disabled={totalOutputCount === 0 || isGenerating || isReading || isZipping}
                onClick={() => void generateOutputs({ download: true })}
              >
                {isGenerating || isZipping ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />处理中...</>
                ) : (
                  <><Package className="mr-1.5 h-4 w-4" />生成并下载素材包</>
                )}
              </Button>
              {isGenerating && <Progress value={progress} className="h-1.5 rounded-full" />}

              <Button
                variant="outline"
                className="h-8 w-full rounded-lg border-border/80 text-xs"
                disabled={totalOutputCount === 0 || isGenerating || isReading}
                onClick={() => void generateOutputs()}
              >
                只生成预览
              </Button>

              {outputs.length > 0 && (
                <Button
                  variant="outline"
                  className="h-8 w-full rounded-lg border-border/80 text-xs"
                  disabled={isZipping}
                  onClick={() => void saveOutputsZip(outputs)}
                >
                  {isZipping ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileArchive className="mr-1.5 h-3.5 w-3.5" />}
                  下载 ZIP · {outputs.length} 张
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {(missingRows.length > 0 || derivedRows.length > 0 || riskyRows.length > 0 || unassigned.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-600/30 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>缺 {missingRows.length} 类</span>
              <span>派生 {derivedRows.length} 类</span>
              <span>高风险 {riskyRows.length} 类</span>
              {unassigned.length > 0 && <span>未识别 {unassigned.length} 张</span>}
            </div>
          )}

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-medium">M1-M8 母版配对表</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">绿=独立母版命中，黄=派生，红=缺母版或裁剪风险高</CardDescription>
                </div>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {coveredRows.length}/8 已配对
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              {rows.map(row => {
                const sourceSize = row.source ? sizeKeyOf(row.source) : ''
                return (
                  <div
                    key={row.spec.code}
                    className={cn(
                      'rounded-xl border p-3',
                      row.state === 'missing'
                        ? 'border-red-600/30 bg-red-50/45 dark:bg-red-950/15'
                        : row.state === 'derived'
                          ? 'border-amber-600/30 bg-amber-50/45 dark:bg-amber-950/15'
                          : 'border-emerald-600/25 bg-emerald-50/45 dark:bg-emerald-950/15'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="font-mono text-[10px]">{row.spec.code}</Badge>
                          <span className="text-sm font-semibold">{row.spec.title}</span>
                          <span className="text-[10px] text-muted-foreground">源 {row.spec.sourceLabel}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{row.spec.description}</p>
                        {row.spec.note && <p className="mt-1 text-[10px] text-muted-foreground">{row.spec.note}</p>}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        {row.state === 'missing' ? (
                          <Badge variant="outline" className="border-red-600/35 bg-red-50 text-[10px] text-red-700 dark:bg-red-950/30 dark:text-red-200">
                            缺母版
                          </Badge>
                        ) : row.state === 'derived' ? (
                          <Badge variant="outline" className="border-amber-600/35 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            由 {row.sourceFrom} 派生
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-600/35 bg-emerald-50 text-[10px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                            <CheckCircle2 className="mr-1 h-3 w-3" />已命中
                          </Badge>
                        )}
                        {row.source && (
                          <Badge variant="outline" className={cn('text-[10px]', getRiskStyle(row.maxCropLoss))}>
                            {getRiskLabel(row.maxCropLoss)} {(row.maxCropLoss * 100).toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                      <div className="rounded-lg border border-border/70 bg-background/70 p-2">
                        {row.source ? (
                          <div className="flex items-center gap-2">
                            <img src={row.source.previewUrl} alt="" className="h-12 w-16 rounded-md border bg-muted object-cover" />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium" title={row.source.name}>{row.source.name}</div>
                              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{sourceSize} · {formatBytes(row.source.size)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-12 items-center text-xs text-muted-foreground">等待上传 {row.spec.code} 母版</div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-background/70 p-2">
                        {row.targets.map(target => (
                          <span key={target.key} className="rounded-md border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {target.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {sources.length > 0 && (
            <Card className="rounded-xl border border-border/80 shadow-sm">
              <CardHeader className="px-4 pb-2 pt-4">
                <CardTitle className="text-sm font-medium">上传队列</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-4 pb-4 sm:grid-cols-2 min-[1440px]:grid-cols-3">
                {sources.map(source => {
                  const assignedRow = rows.find(row => row.source?.id === source.id)
                  return (
                    <div key={source.id} className="flex items-center gap-2 rounded-lg border border-border/80 p-2">
                      <img src={source.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-md border bg-muted object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium" title={source.name}>{source.name}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{source.width}x{source.height}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {assignedRow ? `匹配 ${assignedRow.spec.code}` : '未识别'}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={() => removeSource(source.id)} aria-label={`移除 ${source.name}`}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {outputs.length > 0 && (
            <Card className="rounded-xl border border-border/80 shadow-sm">
              <CardHeader className="px-4 pb-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium">生成结果</CardTitle>
                    <CardDescription className="text-xs">{outputs.length} 个文件 · {formatBytes(totalOutputSize)}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80 text-xs" onClick={() => void saveOutputsZip(outputs)} disabled={isZipping}>
                    {isZipping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
                    ZIP
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid max-h-[min(520px,55vh)] gap-2 overflow-y-auto px-4 pb-4 sm:grid-cols-3 min-[1440px]:grid-cols-5">
                {outputs.map(output => (
                  <a
                    key={output.id}
                    href={output.url}
                    download={output.name}
                    className="group overflow-hidden rounded-md border bg-card transition-colors hover:border-foreground/40"
                    title={`${output.path} · ${output.width}x${output.height}`}
                  >
                    <img src={output.url} alt="" className="aspect-video w-full bg-muted object-cover" />
                    <div className="truncate px-1 py-0.5 font-mono text-[9px] text-muted-foreground group-hover:text-foreground">
                      {output.path}
                    </div>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
