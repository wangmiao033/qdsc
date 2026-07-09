'use client'

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Download, FileArchive, ImagePlus, Loader2,
  Package, RefreshCw, Settings2, ShieldCheck, Trash2, Upload, X
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
type MatchIssueLevel = 'error' | 'warning' | 'info'

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
  issues: MatchIssue[]
}

interface MatchIssue {
  level: MatchIssueLevel
  message: string
}

interface DuplicateMatch {
  code: MasterPackCode
  source: BannerSource
  previous: BannerSource
}

interface SafetyZone {
  label: string
  tone: 'amber' | 'red'
  style: CSSProperties
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

function getIssueStyle(level: MatchIssueLevel) {
  if (level === 'error') return 'border-red-600/35 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200'
  if (level === 'warning') return 'border-amber-600/35 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
  return 'border-sky-600/30 bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200'
}

function getIssueLabel(level: MatchIssueLevel) {
  if (level === 'error') return '错误'
  if (level === 'warning') return '复核'
  return '提示'
}

function getSafetyZones(row: MasterPackRow): SafetyZone[] {
  if (row.spec.code === 'M5') {
    return [{
      label: '左侧安全区',
      tone: 'amber',
      style: { left: 0, top: 0, width: '27%', height: '100%' },
    }]
  }

  if (row.spec.code === 'M6') {
    const widthRatio = row.source
      ? Math.min(45, Math.max(20, Math.round((800 / row.source.width) * 100)))
      : 36
    return [{
      label: '左侧 800px 留空',
      tone: 'red',
      style: { left: 0, top: 0, width: `${widthRatio}%`, height: '100%' },
    }]
  }

  if (row.spec.code === 'M8') {
    return [{
      label: '底部 1/5 禁文字',
      tone: 'amber',
      style: { left: 0, bottom: 0, width: '100%', height: '20%' },
    }]
  }

  return []
}

function getSafetyZoneClass(tone: SafetyZone['tone']) {
  if (tone === 'red') return 'border-red-500/70 bg-red-500/25 text-red-950 dark:text-red-50'
  return 'border-amber-500/70 bg-amber-400/25 text-amber-950 dark:text-amber-50'
}

function buildRowIssues(
  spec: MasterPackSpec,
  source: BannerSource | null,
  state: MatchState,
  sourceFrom: MasterPackCode | null,
  maxCropLoss: number
): MatchIssue[] {
  const issues: MatchIssue[] = []

  if (!source) {
    issues.push({ level: 'error', message: `缺 ${spec.code} 母版，相关尺寸不会输出。` })
    return issues
  }

  const sourceSize = sizeKeyOf(source)
  const isExpectedSource = spec.sourceCandidates.length === 0 || spec.sourceCandidates.includes(sourceSize)

  if (state === 'exact' && !isExpectedSource) {
    issues.push({
      level: 'error',
      message: `文件名命中了 ${spec.code}，但源尺寸是 ${sourceSize}，应为 ${spec.sourceLabel}。`,
    })
  }

  if (state === 'derived') {
    issues.push({
      level: 'warning',
      message: `${spec.code} 由 ${sourceFrom} 派生，出包前需要看一眼主体和安全区。`,
    })
  }

  if (spec.code === 'M7' && state === 'derived') {
    issues.push({
      level: 'warning',
      message: 'M7 如果需要 Logo、Slogan、按钮，建议上传命名 M7 的 3200x420 成品图。',
    })
  }

  if (spec.code === 'M6') {
    issues.push({
      level: 'warning',
      message: 'M6 左侧 800px 留空要求特殊，当前只标记安全区，不自动改构图。',
    })
  }

  if (maxCropLoss > 0.08) {
    issues.push({
      level: 'error',
      message: `最大裁剪损失 ${(maxCropLoss * 100).toFixed(1)}%，建议人工复核。`,
    })
  } else if (maxCropLoss > 0.03) {
    issues.push({
      level: 'warning',
      message: `最大裁剪损失 ${(maxCropLoss * 100).toFixed(1)}%，建议检查边缘内容。`,
    })
  }

  return issues
}

function buildMasterPackZipFileName(outputs: BannerOutput[]) {
  if (outputs.length === 0) return 'banner_master_pack.zip'
  return `banner_master_pack_${outputs.length}files.zip`
}

function matchSourcesToSpecs(sources: BannerSource[]) {
  const assigned = new Map<MasterPackCode, BannerSource>()
  const unassigned: BannerSource[] = []
  const duplicateMatches: DuplicateMatch[] = []

  const assignSource = (code: MasterPackCode, source: BannerSource) => {
    const previous = assigned.get(code)
    if (previous) duplicateMatches.push({ code, source, previous })
    assigned.set(code, source)
  }

  for (const source of sources) {
    const namedCode = getMasterCodeFromName(source.name)
    if (namedCode) {
      assignSource(namedCode, source)
      continue
    }

    const sourceSize = sizeKeyOf(source)
    const exactMatches = MASTER_PACK_SPECS.filter(spec => spec.sourceCandidates.includes(sourceSize))
    if (exactMatches.length > 0) {
      assignSource(exactMatches[0].code, source)
      continue
    }

    unassigned.push(source)
  }

  return { assigned, unassigned, duplicateMatches }
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

  const { assigned, unassigned, duplicateMatches } = useMemo(() => matchSourcesToSpecs(sources), [sources])

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
      const issues = buildRowIssues(spec, source, state, exactSource ? spec.code : fallbackSource ? spec.fallbackFrom || null : null, maxCropLoss)

      return {
        spec,
        source,
        sourceFrom: exactSource ? spec.code : fallbackSource ? spec.fallbackFrom || null : null,
        state,
        targets,
        maxCropLoss,
        issues,
      }
    })
  }, [assigned, targetByCode])

  const coveredRows = rows.filter(row => row.source)
  const missingRows = rows.filter(row => row.state === 'missing')
  const derivedRows = rows.filter(row => row.state === 'derived')
  const riskyRows = rows.filter(row => row.source && row.maxCropLoss > 0.08)
  const rowIssues = rows.flatMap(row => row.issues.map(issue => ({ ...issue, code: row.spec.code })))
  const reviewIssueCount = rowIssues.length + unassigned.length + duplicateMatches.length
  const hardIssueCount = rowIssues.filter(issue => issue.level === 'error').length + unassigned.length
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
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-4 sm:py-5 min-[1440px]:px-6">
      <div className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-sky-600 bg-sky-600 text-[10px] font-bold text-white hover:bg-sky-600">第一期 07</Badge>
              <Badge className="border-sky-600 bg-sky-600 text-[10px] font-bold text-white hover:bg-sky-600">M1-M8</Badge>
              <Badge variant="outline" className="border-zinc-200 bg-white text-[10px] font-bold text-zinc-600">安全区体检</Badge>
            </div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-zinc-950">
              <Package className="h-5 w-5 text-zinc-900" />
              Banner 母版配对
            </h2>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-zinc-500">
              只按指定母版源尺寸或文件名 M1-M8 配对，支持 M4/M6/M7 派生输出，并在出包前做尺寸与安全区体检。
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
            { label: '已配对', value: `${coveredRows.length}/8`, tone: 'text-emerald-700' },
            { label: '派生输出', value: derivedRows.length, tone: derivedRows.length > 0 ? 'text-amber-700' : 'text-zinc-950' },
            { label: '预计输出', value: totalOutputCount, tone: 'text-blue-700' },
            { label: '需复核', value: reviewIssueCount, tone: reviewIssueCount > 0 ? 'text-red-700' : 'text-zinc-950' },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
              <div className={`font-mono text-xl font-extrabold tabular-nums ${item.tone}`}>{item.value}</div>
              <div className="text-[11px] font-bold text-zinc-500">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1440px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 min-[1440px]:sticky min-[1440px]:top-20 min-[1440px]:self-start">
          <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Upload className="h-4 w-4 text-zinc-500" />
                上传 M1-M8 母版
              </CardTitle>
              <CardDescription className="text-xs font-medium">建议文件名包含 M1 / M2 / M3 ...，同尺寸歧义会优先按文件名</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div
                className={cn(
                  'relative rounded-lg border border-dashed p-5 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring',
                  isDragging ? 'border-zinc-950 bg-zinc-100' : 'border-zinc-300 bg-white hover:border-zinc-500 hover:bg-zinc-50',
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
                    <div className="mt-2 text-sm font-bold text-zinc-900">拖入 M1-M8 母版原图</div>
                    <div className="mt-0.5 text-xs font-medium text-zinc-500">PNG / JPG / WebP / GIF / BMP</div>
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

              <div className="grid grid-cols-4 divide-x divide-border rounded-lg border border-border/80 bg-muted/20 text-center">
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
                <div className="px-1 py-2">
                  <div className={cn('text-base font-semibold tabular-nums', reviewIssueCount > 0 && 'text-red-600')}>{reviewIssueCount}</div>
                  <div className="text-[10px] text-muted-foreground">需复核</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Settings2 className="h-4 w-4 text-zinc-500" />
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
          {(missingRows.length > 0 || derivedRows.length > 0 || riskyRows.length > 0 || unassigned.length > 0 || duplicateMatches.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-600/30 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>缺 {missingRows.length} 类</span>
              <span>派生 {derivedRows.length} 类</span>
              <span>高风险 {riskyRows.length} 类</span>
              <span>重复 {duplicateMatches.length} 类</span>
              {unassigned.length > 0 && <span>未识别 {unassigned.length} 张</span>}
            </div>
          )}

          <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <ShieldCheck className="h-4 w-4 text-zinc-500" />
                  本期 07 体检
                </CardTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-bold',
                    hardIssueCount > 0
                      ? 'border-red-600/35 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200'
                      : reviewIssueCount > 0
                        ? 'border-amber-600/35 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'border-emerald-600/35 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
                  )}
                >
                  {reviewIssueCount === 0 ? '通过' : `${reviewIssueCount} 项需复核`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              {reviewIssueCount === 0 ? (
                <div className="rounded-lg border border-emerald-600/25 bg-emerald-50/60 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200">
                  当前上传内容没有发现缺母版、错误尺寸、重复匹配或高风险裁剪。
                </div>
              ) : (
                <div className="grid gap-2 min-[1200px]:grid-cols-2">
                  {rowIssues.slice(0, 8).map((issue, index) => (
                    <div key={`${issue.code}-${index}`} className={cn('rounded-lg border px-3 py-2 text-xs', getIssueStyle(issue.level))}>
                      <span className="font-mono font-semibold">{issue.code}</span>
                      <span className="mx-1.5 opacity-70">/</span>
                      <span className="font-medium">{getIssueLabel(issue.level)}</span>
                      <span className="ml-1.5">{issue.message}</span>
                    </div>
                  ))}
                  {duplicateMatches.map(match => (
                    <div key={`${match.code}-${match.source.id}`} className={cn('rounded-lg border px-3 py-2 text-xs', getIssueStyle('warning'))}>
                      <span className="font-mono font-semibold">{match.code}</span>
                      <span className="mx-1.5 opacity-70">/</span>
                      <span className="font-medium">重复</span>
                      <span className="ml-1.5">重复上传，当前采用 {match.source.name}，已覆盖 {match.previous.name}。</span>
                    </div>
                  ))}
                  {unassigned.map(source => (
                    <div key={source.id} className={cn('rounded-lg border px-3 py-2 text-xs', getIssueStyle('error'))}>
                      <span className="font-mono font-semibold">{source.width}x{source.height}</span>
                      <span className="mx-1.5 opacity-70">/</span>
                      <span className="font-medium">未识别</span>
                      <span className="ml-1.5">{source.name} 没有匹配到 M1-M8 源尺寸或文件名。</span>
                    </div>
                  ))}
                  {rowIssues.length > 8 && (
                    <div className="rounded-lg border border-border/70 px-3 py-2 text-xs text-muted-foreground">
                      还有 {rowIssues.length - 8} 项体检提示，可在下方 M1-M8 配对表逐项查看。
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold">M1-M8 母版配对表</CardTitle>
                  <CardDescription className="mt-0.5 text-xs font-medium">绿=独立母版命中，黄=派生，红=缺母版或裁剪风险高</CardDescription>
                </div>
                <Badge variant="secondary" className="text-[10px] font-bold">
                  {coveredRows.length}/8 已配对
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              {rows.map(row => {
                const sourceSize = row.source ? sizeKeyOf(row.source) : ''
                const safetyZones = getSafetyZones(row)
                return (
                  <div
                    key={row.spec.code}
                    className={cn(
                      'rounded-lg border p-3 shadow-sm',
                      row.state === 'missing'
                        ? 'border-red-600/30 bg-red-50/55 dark:bg-red-950/15'
                        : row.state === 'derived'
                          ? 'border-amber-600/30 bg-amber-50/55 dark:bg-amber-950/15'
                          : 'border-emerald-600/25 bg-emerald-50/55 dark:bg-emerald-950/15'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="font-mono text-[10px]">{row.spec.code}</Badge>
                          <span className="text-sm font-bold text-zinc-950">{row.spec.title}</span>
                          <span className="text-[10px] font-medium text-zinc-500">源 {row.spec.sourceLabel}</span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-zinc-600">{row.spec.description}</p>
                        {row.spec.note && <p className="mt-1 text-[10px] font-medium text-zinc-500">{row.spec.note}</p>}
                        {safetyZones.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {safetyZones.map(zone => (
                              <Badge key={zone.label} variant="outline" className={cn('text-[10px]', getSafetyZoneClass(zone.tone))}>
                                {zone.label}
                              </Badge>
                            ))}
                          </div>
                        )}
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
                      <div className="rounded-lg border border-zinc-200 bg-white/80 p-2 shadow-sm">
                        {row.source ? (
                          <div className="flex items-center gap-2">
                            <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
                              <img src={row.source.previewUrl} alt="" className="h-full w-full object-cover" />
                              {safetyZones.map(zone => (
                                <div
                                  key={zone.label}
                                  className={cn('absolute border border-dashed', getSafetyZoneClass(zone.tone))}
                                  style={zone.style}
                                  title={zone.label}
                                />
                              ))}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-bold text-zinc-900" title={row.source.name}>{row.source.name}</div>
                              <div className="mt-0.5 font-mono text-[10px] font-medium text-zinc-500">{sourceSize} · {formatBytes(row.source.size)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-12 items-center text-xs font-medium text-zinc-500">等待上传 {row.spec.code} 母版</div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white/80 p-2 shadow-sm">
                        {row.targets.map(target => (
                          <span key={target.key} className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-600">
                            {target.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {row.issues.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.issues.map((issue, index) => (
                          <div key={`${issue.message}-${index}`} className={cn('max-w-full rounded-md border px-2 py-1 text-[10px] leading-relaxed', getIssueStyle(issue.level))}>
                            <span className="font-medium">{getIssueLabel(issue.level)}：</span>
                            <span className="break-words">{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {sources.length > 0 && (
            <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
              <CardHeader className="px-4 pb-2 pt-4">
                <CardTitle className="text-sm font-bold">上传队列</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-4 pb-4 sm:grid-cols-2 min-[1440px]:grid-cols-3">
                {sources.map(source => {
                  const assignedRows = rows.filter(row => row.source?.id === source.id)
                  const overwrittenMatch = duplicateMatches.find(match => match.previous.id === source.id)
                  return (
                    <div key={source.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm">
                      <img src={source.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-md border bg-muted object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-zinc-900" title={source.name}>{source.name}</div>
                        <div className="mt-0.5 font-mono text-[10px] font-medium text-zinc-500">{source.width}x{source.height}</div>
                        <div className="mt-1 text-[10px] font-medium text-zinc-500">
                          {assignedRows.length > 0
                            ? `匹配 ${assignedRows.map(row => row.spec.code).join(' / ')}`
                            : overwrittenMatch
                              ? `被新的 ${overwrittenMatch.code} 覆盖`
                              : '未识别'}
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
            <Card className="rounded-lg border border-zinc-200/90 bg-[#fbfcff] shadow-sm">
              <CardHeader className="px-4 pb-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold">生成结果</CardTitle>
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
