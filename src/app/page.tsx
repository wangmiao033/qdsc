'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Database, ListChecks, ClipboardCheck, FileDown, FileUp,
  Plus, Pencil, Trash2, Search, Filter, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, XCircle, Info, Copy, Check, Download,
  Upload, Loader2, BarChart3, Clock, AlertOctagon, X, Layers, Zap, Target, ArrowRight, ArrowDown,
  FileSearch, RefreshCw, FileText, ImagePlus, FileImage, Eye, ScrollText,
  Star, Settings, Crop, PlusCircle, Minus, Move, Maximize2, Ruler
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'
import IconCropView from '@/components/icon-crop-view'
import ImageFormatConverterView from '@/components/image-format-converter-view'
import ProductionBoardView from '@/components/production-board-view'
import SizeBasedWorkflowView from '@/components/size-based-workflow-view'

// ========== Types ==========
interface MaterialSpec {
  id: string
  channel: string
  name: string
  width: number
  height: number
  format: string
  maxSize: number
  isRequired: boolean
  copyLimit: string
  forbidden: string
  remark: string
  priority: string
  createdAt: string
}

interface Batch {
  id: string
  gameName: string
  batchName: string
  status: string
  createdAt: string
  tasks: TaskItem[]
}

interface TaskItem {
  id: string
  batchId: string
  specId: string
  specChannel: string
  specName: string
  specWidth: number
  specHeight: number
  specFormat: string
  specMaxSize: number
  specIsRequired: boolean
  suggestedFileName: string
  status: string
  remark: string
  createdAt: string
}

interface AcceptanceResult {
  fileName: string
  taskItemId: string
  specName: string
  specChannel: string
  fileWidth: number | null
  fileHeight: number | null
  fileFormat: string | null
  fileSize: number | null
  severity: string
  message: string
}

interface CategorizeData {
  summary: {
    totalSpecs: number
    withDimensions: number
    uniqueAssets: number
    reusableAssets: number
    savedWork: number
    savedPercent: number
    totalChannels: number
  }
  materialTypes: Array<{
    name: string
    normalized: string
    sizes: Array<{ w: number; h: number; format: string; channels: string[]; count: number }>
    totalSpecs: number
    uniqueSizes: number
    totalChannels: number
  }>
  sharedSizes: Array<{
    width: number
    height: number
    materialNames: string[]
    channels: string[]
    totalSpecs: number
  }>
  highPriority: Array<{
    key: string
    name: string
    width: number
    height: number
    format: string
    channels: string[]
    isRequired: boolean
    totalSpecs: number
  }>
}

interface DigestResult {
  summary: {
    totalItems: number
    uniqueAssets: number
    uniqueSizes: number
    newSizes: number
    reusableSizes: number
    scenes: string[]
    channelName: string
  }
  items: Array<{
    scene: string
    location: string
    name: string
    width: number
    height: number
    format: string
    maxSize: number
    isRequired: boolean
    priority: string
    sizeText: string
    remark: string
    isNew: boolean
    matchedExisting: Array<{ channel: string; name: string; width: number; height: number }>
  }>
  sizeAnalysis: {
    newSizes: Array<{ width: number; height: number; usedBy: string[] }>
    reusableSizes: Array<{ width: number; height: number; existingChannels: string[]; usedBy: string[] }>
  }
  actionPlan: Array<{
    name: string
    size: string
    scenes: string[]
    action: 'new' | 'resize' | 'reuse'
    detail: string
  }>
  savedPercent: number
}

interface DashboardData {
  batch: { id: string; gameName: string; batchName: string; status: string }
  stats: { total: number; completed: number; error: number; pending: number; inProgress: number; missingRequired: number }
  channelGroups: Record<string, { total: number; completed: number; error: number; pending: number; inProgress: number }>
  recentAcceptance: Array<{ id: string; fileName: string; severity: string; message: string; createdAt: string }>
}

// ========== Digest View ==========
function DigestView() {
  const [result, setResult] = useState<DigestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [channelName, setChannelName] = useState('')
  const [importing, setImporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeScene, setActiveScene] = useState('')
  const { toast } = useToast()
  const fileInputRef = useState<HTMLInputElement | null>(null)
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)

  const handleFile = async (file: File) => {
    setLoading(true)
    setError('')
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/specs/digest', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
        setChannelName(data.summary.channelName)
        setActiveScene(data.summary.scenes[0] || '')
      }
    } catch {
      setError('解析文件时出错')
    }
    setLoading(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleImport = async () => {
    if (!result) return
    const name = channelName || result.summary.channelName
    if (!name) {
      toast({ title: '请输入渠道名称', variant: 'destructive' })
      return
    }
    setImporting(true)
    try {
      const res = await fetch('/api/specs/digest/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName: name, items: result.items }),
      })
      const data = await res.json()
      if (data.error) {
        toast({ title: '导入失败', description: data.error, variant: 'destructive' })
      } else {
        toast({ title: '导入成功', description: `新增 ${data.created} 条，跳过 ${data.skipped} 条` })
      }
    } catch {
      toast({ title: '导入出错', variant: 'destructive' })
    }
    setImporting(false)
  }

  const handleDownloadTemplates = () => {
    if (!result) return
    const newSizes = result.sizeAnalysis.newSizes
    for (const s of newSizes) {
      const canvas = document.createElement('canvas')
      canvas.width = s.width
      canvas.height = s.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, s.width, s.height)
      ctx.fillStyle = '#999'
      const fontSize = Math.max(12, Math.min(s.width, s.height) / 15)
      ctx.font = `${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${s.width} × ${s.height}`, s.width / 2, s.height / 2)
      canvas.toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `template_${s.width}x${s.height}.png`
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    toast({ title: `正在下载 ${newSizes.length} 个模板` })
  }

  const handleCopyFileList = () => {
    if (!result) return
    const text = result.items.map((item, i) =>
      `${i + 1}. ${item.name} (${item.width}x${item.height} ${item.format}) - ${item.location}${item.isNew ? ' [新尺寸]' : ' [可复用]'}${item.isRequired ? ' [必做]' : ''}`
    ).join('\n')
    navigator.clipboard.writeText(`📋 ${channelName || result.summary.channelName} 素材需求清单\n共 ${result.items.length} 项\n\n${text}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReUpload = () => {
    setResult(null)
    setError('')
  }

  // Upload view
  if (!result && !loading && !error) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">需求消化</h2>
          <p className="text-xs text-muted-foreground">上传渠道需求 Excel，快速分析新增与可复用素材</p>
        </div>
        <Card className="p-6">
          <div
            className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInput?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <div className="text-sm font-medium">拖拽 Excel 文件到此处，或点击上传</div>
            <div className="text-xs text-muted-foreground mt-1">支持 .xlsx, .xls, .csv 格式</div>
          </div>
          <input
            ref={setFileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ''
            }}
          />
          <div className="mt-4 space-y-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>系统将自动解析 Excel 中的素材需求，与现有规格库 (1332+ 条) 进行交叉比对，识别可复用尺寸和需新做的素材。</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>支持多 Sheet 解析、合并单元格、多尺寸行、优先级标注等复杂格式。</span>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // Loading view
  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">需求消化</h2>
          <p className="text-xs text-muted-foreground">正在解析文件...</p>
        </div>
        <Card className="p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <div className="text-sm mt-3 text-muted-foreground">智能分析中，请稍候...</div>
        </Card>
      </div>
    )
  }

  // Error view
  if (error) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">需求消化</h2>
        </div>
        <Card className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-red-500" />
          <div className="text-sm mt-3 text-red-600">{error}</div>
          <Button variant="outline" size="sm" className="mt-4" onClick={handleReUpload}>重新上传</Button>
        </Card>
      </div>
    )
  }

  if (!result) return null

  const { summary, items, sizeAnalysis, actionPlan, savedPercent } = result
  const filteredItems = activeScene ? items.filter(i => i.scene === activeScene) : items
  const reuseCount = items.filter(i => !i.isNew).length

  return (
    <div className="p-4 space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">需求消化分析</h2>
          <p className="text-xs text-muted-foreground">
            渠道: <span className="font-medium text-foreground">{summary.channelName}</span> · 共解析 {summary.scenes.length} 个场景
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReUpload}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />重新上传
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '总素材项', value: summary.totalItems, icon: FileText, color: 'text-foreground' },
          { label: '素材种类', value: summary.uniqueAssets, icon: Layers, color: 'text-foreground' },
          { label: '可复用尺寸', value: summary.reusableSizes, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: '新尺寸', value: summary.newSizes, icon: AlertTriangle, color: 'text-red-600' },
          { label: '工作量节省', value: `${savedPercent}%`, icon: Zap, color: 'text-amber-600' },
        ].map(s => (
          <Card key={s.label} className="p-3">
            <div className="flex items-center gap-2">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Scene Tabs */}
      {summary.scenes.length > 1 && (
        <Tabs value={activeScene} onValueChange={setActiveScene}>
          <TabsList className="h-8">
            <TabsTrigger value="" className="text-xs h-6 px-2">全部 ({items.length})</TabsTrigger>
            {summary.scenes.map(scene => {
              const count = items.filter(i => i.scene === scene).length
              return <TabsTrigger key={scene} value={scene} className="text-xs h-6 px-2">{scene} ({count})</TabsTrigger>
            })}
          </TabsList>
        </Tabs>
      )}

      {/* Per-scene asset table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">素材清单 {activeScene && <span className="text-muted-foreground font-normal">/ {activeScene}</span>}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs h-8 w-24">素材名称</TableHead>
                  <TableHead className="text-xs h-8 w-32">位置</TableHead>
                  <TableHead className="text-xs h-8 w-28 text-center">尺寸</TableHead>
                  <TableHead className="text-xs h-8 w-16 text-center">格式</TableHead>
                  <TableHead className="text-xs h-8 w-14 text-center">必做</TableHead>
                  <TableHead className="text-xs h-8 w-14 text-center">优先级</TableHead>
                  <TableHead className="text-xs h-8">状态</TableHead>
                  <TableHead className="text-xs h-8">备注</TableHead>
                  <TableHead className="text-xs h-8 w-40">复用来源</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">暂无数据</TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item, idx) => (
                    <TableRow key={`${item.scene}-${item.name}-${item.width}x${item.height}-${idx}`} className="text-xs">
                      <TableCell className="py-1.5 font-medium">{item.name}</TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">{item.location}</TableCell>
                      <TableCell className="py-1.5 text-center font-mono">
                        {item.width}x{item.height}
                        <Badge className={`ml-1 text-[9px] px-1 py-0 ${item.isNew ? 'bg-red-100 text-red-700 hover:bg-red-100' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'}`}>
                          {item.isNew ? '新' : '复用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-center">
                        <Badge variant="secondary" className="text-[10px] px-1.5">{item.format}</Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-center">
                        {item.isRequired ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 hover:bg-emerald-100">必做</Badge> : <span className="text-muted-foreground">选做</span>}
                      </TableCell>
                      <TableCell className="py-1.5 text-center">
                        <PriorityBadge priority={item.priority} />
                      </TableCell>
                      <TableCell className="py-1.5 text-center">
                        {item.maxSize > 0 && <span className="text-muted-foreground">{item.maxSize}KB</span>}
                      </TableCell>
                      <TableCell className="py-1.5 text-muted-foreground max-w-24 truncate">{item.remark || '-'}</TableCell>
                      <TableCell className="py-1.5">
                        {item.matchedExisting.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.matchedExisting.slice(0, 3).map((m, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] px-1 py-0">
                                {m.channel} · {m.name}
                              </Badge>
                            ))}
                            {item.matchedExisting.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">+{item.matchedExisting.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-red-500 text-[10px]">无匹配</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Size reuse analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Reusable sizes */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm text-emerald-700">✅ 可直接复用 ({sizeAnalysis.reusableSizes.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="max-h-60 overflow-auto space-y-2">
              {sizeAnalysis.reusableSizes.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">无可复用尺寸</div>
              ) : (
                sizeAnalysis.reusableSizes.map(s => (
                  <div key={`${s.width}x${s.height}`} className="flex items-center gap-2 text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/20">
                    <span className="font-mono font-medium w-24 shrink-0">{s.width}x{s.height}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-muted-foreground truncate">用于: {s.usedBy.join(', ')}</div>
                      <div className="text-emerald-600 mt-0.5 truncate">已有渠道: {s.existingChannels.join(', ')}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* New sizes */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm text-red-700">🆕 需新建 ({sizeAnalysis.newSizes.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="max-h-60 overflow-auto space-y-2">
              {sizeAnalysis.newSizes.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">无新尺寸</div>
              ) : (
                sizeAnalysis.newSizes.map(s => (
                  <div key={`${s.width}x${s.height}`} className="flex items-center gap-2 text-xs p-2 rounded bg-red-50 dark:bg-red-950/20">
                    <span className="font-mono font-medium w-24 shrink-0">{s.width}x{s.height}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-muted-foreground truncate">用于: {s.usedBy.join(', ')}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Plan */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">📋 执行计划</CardTitle>
          <CardDescription className="text-xs">共 {actionPlan.length} 项 · 可复用 {actionPlan.filter(a => a.action === 'reuse').length} · 需缩放 {actionPlan.filter(a => a.action === 'resize').length} · 需新做 {actionPlan.filter(a => a.action === 'new').length}</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="max-h-64 overflow-auto space-y-1.5">
            {actionPlan.map((plan, idx) => {
              const actionConfig = {
                new: { icon: '🆕', label: '需新做', cls: 'border-red-200 bg-red-50 dark:bg-red-950/20' },
                resize: { icon: '🔄', label: '可缩放', cls: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20' },
                reuse: { icon: '✅', label: '可复用', cls: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' },
              }[plan.action]
              return (
                <div key={idx} className={`flex items-center gap-2 text-xs p-2 rounded border ${actionConfig.cls}`}>
                  <span className="shrink-0">{actionConfig.icon}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 w-12 justify-center">{actionConfig.label}</Badge>
                  <span className="font-medium shrink-0 w-24 truncate">{plan.name}</span>
                  <span className="font-mono text-muted-foreground shrink-0">{plan.size}</span>
                  <span className="text-muted-foreground flex-1 truncate">{plan.detail}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">渠道名称</Label>
            <Input
              className="h-8 text-sm"
              value={channelName}
              onChange={e => setChannelName(e.target.value)}
              placeholder={summary.channelName}
            />
            <Button size="sm" className="w-full" onClick={handleImport} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              {importing ? '导入中...' : '导入到规格库'}
            </Button>
            <p className="text-[10px] text-muted-foreground">将所有解析的素材导入为规格记录</p>
          </div>
          <div className="space-y-2">
            <div className="h-5" />
            <Button variant="outline" size="sm" className="w-full" onClick={handleDownloadTemplates} disabled={sizeAnalysis.newSizes.length === 0}>
              <FileDown className="h-4 w-4 mr-1" />
              下载空白模板 ({sizeAnalysis.newSizes.length} 个新尺寸)
            </Button>
            <p className="text-[10px] text-muted-foreground">生成所有新尺寸的空白 PNG 画布</p>
          </div>
          <div className="space-y-2">
            <div className="h-5" />
            <Button variant="outline" size="sm" className="w-full" onClick={handleCopyFileList}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? '已复制' : '复制文件名清单'}
            </Button>
            <p className="text-[10px] text-muted-foreground">复制所有素材的命名清单到剪贴板</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ========== Main Page ==========
export default function WorkflowApp() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [batches, setBatches] = useState<Batch[]>([])
  const [currentBatchId, setCurrentBatchId] = useState<string>('')
  const [specsData, setSpecsData] = useState<{
    items: MaterialSpec[]
    total: number
    channels: string[]
  }>({ items: [], total: 0, channels: [] })

  useEffect(() => {
    ;(async () => {
      const [batchRes, specRes] = await Promise.all([
        fetch('/api/batches'),
        fetch('/api/specs?pageSize=200'),
      ])
      const batchData = await batchRes.json()
      const specData = await specRes.json()
      setBatches(batchData)
      if (batchData.length > 0 && !currentBatchId) {
        setCurrentBatchId(batchData[0].id)
      }
      setSpecsData(specData)
    })()
  }, [])

  const refreshAll = async () => {
    const [batchRes, specRes] = await Promise.all([
      fetch('/api/batches'),
      fetch('/api/specs?pageSize=200'),
    ])
    const batchData = await batchRes.json()
    const specData = await specRes.json()
    setBatches(batchData)
    setSpecsData(specData)
  }

  return (
    <div className="flex h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h1 className="font-bold text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            素材工作台
          </h1>
          <p className="text-xs text-muted-foreground mt-1">游戏素材流程管理</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {[
            { id: 'dashboard', label: '工作台', icon: LayoutDashboard },
            { id: 'productionBoard', label: '生产看板', icon: Zap },
            { id: 'sizeWorkflow', label: '按尺寸生产', icon: Ruler },
            { id: 'specs', label: '素材规格库', icon: Database },
            { id: 'categorize', label: '智能归类', icon: Layers },
            { id: 'digest', label: '需求消化', icon: FileSearch },
            { id: 'tasks', label: '任务生成器', icon: ListChecks },
            { id: 'acceptance', label: '素材验收', icon: ClipboardCheck },
            { id: 'logs', label: '更新日志', icon: ScrollText },
            { id: 'iconCrop', label: 'Icon 裁剪', icon: Crop },
            { id: 'imageConvert', label: '格式转换', icon: FileDown },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                activeTab === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
        {/* Batch selector */}
        {batches.length > 0 && (
          <div className="p-3 border-t">
            <Label className="text-xs text-muted-foreground">当前批次</Label>
            <Select value={currentBatchId} onValueChange={setCurrentBatchId}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {batches.map(b => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.gameName} - {b.batchName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && (
          <DashboardView
            batchId={currentBatchId}
            batches={batches}
            onBatchChange={setCurrentBatchId}
            onRefresh={refreshAll}
          />
        )}
        {activeTab === 'productionBoard' && (
          <ProductionBoardView
            onBatchChange={setCurrentBatchId}
            onRefresh={refreshAll}
            onNavigateToIconCrop={() => setActiveTab('iconCrop')}
          />
        )}
        {activeTab === 'sizeWorkflow' && (
          <SizeBasedWorkflowView
            onBatchChange={setCurrentBatchId}
            onRefresh={refreshAll}
          />
        )}
        {activeTab === 'specs' && (
          <SpecsView specsData={specsData} onRefresh={refreshAll} />
        )}
        {activeTab === 'categorize' && (
          <CategorizeView />
        )}
        {activeTab === 'digest' && (
          <DigestView />
        )}
        {activeTab === 'tasks' && (
          <TasksView
            batchId={currentBatchId}
            channels={specsData.channels}
            specs={specsData.items}
            onRefresh={refreshAll}
            onBatchChange={setCurrentBatchId}
          />
        )}
        {activeTab === 'acceptance' && (
          <AcceptanceView batchId={currentBatchId} onRefresh={refreshAll} />
        )}
        {activeTab === 'logs' && (
          <LogsView batchId={currentBatchId} onRefresh={refreshAll} />
        )}
        {activeTab === 'iconCrop' && (
          <IconCropView />
        )}
        {activeTab === 'imageConvert' && (
          <ImageFormatConverterView />
        )}
      </main>
    </div>
  )
}


// ========== Dashboard View ==========
function DashboardView({ batchId, batches, onBatchChange, onRefresh }: {
  batchId: string
  batches: Batch[]
  onBatchChange: (id: string) => void
  onRefresh: () => void
}) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!batchId) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/dashboard?batchId=${batchId}`)
      const d = await res.json()
      if (!cancelled) setData(d)
    })()
    return () => { cancelled = true }
  }, [batchId])

  const copyTaskList = async () => {
    if (!data) return
    const batch = await fetch(`/api/tasks?batchId=${batchId}`)
    const tasks: TaskItem[] = await batch.json()
    const text = tasks.map((t, i) =>
      `${i + 1}. [${t.status}] ${t.specChannel} - ${t.specName} (${t.specWidth}x${t.specHeight} ${t.specFormat})`
    ).join('\n')
    await navigator.clipboard.writeText(
      `📋 ${data.batch.gameName} - ${data.batch.batchName}\n总计: ${tasks.length} 项\n\n${text}`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!batchId || batches.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <ListChecks className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">暂无批次</h2>
          <p className="text-sm text-muted-foreground">请先在「任务生成器」中创建一个批次</p>
          <Button onClick={() => onRefresh()}>刷新</Button>
        </div>
      </div>
    )
  }

  if (!data) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>

  const { stats, channelGroups, recentAcceptance } = data
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  return (
    <div className="p-4 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{data.batch.gameName} - {data.batch.batchName}</h2>
          <p className="text-sm text-muted-foreground">批次概览与进度跟踪</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyTaskList}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? '已复制' : '复制任务清单'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setData(null); fetch('/api/dashboard?batchId=' + batchId).then(r => r.json()).then(d => setData(d)) }}>
            刷新
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '总任务', value: stats.total, icon: ListChecks, color: 'text-foreground' },
          { label: '已完成', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: '制作中', value: stats.inProgress || 0, icon: Clock, color: 'text-blue-600' },
          { label: '待制作', value: stats.pending, icon: Clock, color: 'text-amber-600' },
          { label: '异常', value: stats.error, icon: AlertTriangle, color: 'text-red-600' },
        ].map(s => (
          <Card key={s.label} className="p-3">
            <div className="flex items-center gap-2">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Overall progress */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">总体完成率</span>
          <span className="text-sm font-bold">{completionRate}%</span>
        </div>
        <Progress value={completionRate} className="h-2" />
      </Card>

      {/* Channel Progress */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">按渠道分组进度</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(channelGroups).map(([channel, g]) => {
              const rate = g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0
              return (
                <div key={channel} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{channel}</span>
                      <span className="text-xs text-muted-foreground">{g.completed}/{g.total}</span>
                    </div>
                    <Progress value={rate} className="h-1.5 mt-1" />
                  </div>
                  {g.error > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                      {g.error}
                    </Badge>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Acceptance */}
      {recentAcceptance.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">最近验收记录</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="max-h-60 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-8">文件名</TableHead>
                    <TableHead className="text-xs h-8 w-20">级别</TableHead>
                    <TableHead className="text-xs h-8">结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAcceptance.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs py-2 font-mono">{r.fileName}</TableCell>
                      <TableCell className="py-2">
                        <SeverityBadge severity={r.severity} />
                      </TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{r.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ========== Specs View ==========
function SpecsView({ specsData, onRefresh }: {
  specsData: { items: MaterialSpec[]; total: number; channels: string[] }
  onRefresh: () => void
}) {
  const [items, setItems] = useState<MaterialSpec[]>(specsData.items)
  const [total, setTotal] = useState(specsData.total)
  const [channels, setChannels] = useState<string[]>(specsData.channels)
  const [filterChannel, setFilterChannel] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [searchName, setSearchName] = useState('')
  const [page, setPage] = useState(1)
  const [showDialog, setShowDialog] = useState(false)
  const [editingSpec, setEditingSpec] = useState<MaterialSpec | null>(null)
  const [form, setForm] = useState({
    channel: '', name: '', width: '0', height: '0', format: 'PNG',
    maxSize: '500', isRequired: true, copyLimit: '', forbidden: '', remark: '', priority: '普通'
  })
  const [loading, setLoading] = useState(false)

  const reloadSpecs = async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '100' })
    if (filterChannel) params.set('channel', filterChannel)
    if (filterPriority) params.set('priority', filterPriority)
    if (searchName) params.set('name', searchName)
    const res = await fetch(`/api/specs?${params}`)
    const data = await res.json()
    setItems(data.items)
    setTotal(data.total)
    setChannels(data.channels || channels)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page), pageSize: '100' })
      if (filterChannel) params.set('channel', filterChannel)
      if (filterPriority) params.set('priority', filterPriority)
      if (searchName) params.set('name', searchName)
      const res = await fetch(`/api/specs?${params}`)
      const data = await res.json()
      if (!cancelled) {
        setItems(data.items)
        setTotal(data.total)
        setChannels(data.channels || channels)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [page, filterChannel, filterPriority, searchName])

  const openCreate = () => {
    setEditingSpec(null)
    setForm({
      channel: '', name: '', width: '0', height: '0', format: 'PNG',
      maxSize: '500', isRequired: true, copyLimit: '', forbidden: '', remark: '', priority: '普通'
    })
    setShowDialog(true)
  }

  const openEdit = (spec: MaterialSpec) => {
    setEditingSpec(spec)
    setForm({
      channel: spec.channel, name: spec.name,
      width: String(spec.width), height: String(spec.height),
      format: spec.format, maxSize: String(spec.maxSize),
      isRequired: spec.isRequired,
      copyLimit: spec.copyLimit, forbidden: spec.forbidden,
      remark: spec.remark, priority: spec.priority,
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!form.channel || !form.name) return
    if (editingSpec) {
      await fetch('/api/specs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingSpec.id, ...form }),
      })
    } else {
      await fetch('/api/specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    }
    setShowDialog(false)
    reloadSpecs()
    onRefresh()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/specs?id=${id}`, { method: 'DELETE' })
    reloadSpecs()
    onRefresh()
  }

  const [importLoading, setImportLoading] = useState(false)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', 'realdata')
    const res = await fetch('/api/specs/import', { method: 'POST', body: fd })
    const data = await res.json()

    let msg = `导入完成!\n\n新增: ${data.created} 条\n跳过/更新: ${data.skipped || 0} 条\n错误: ${data.totalErrors || data.errors?.length || 0} 条`
    if (data.sheets) {
      msg += '\n\n各 Sheet 统计:\n'
      for (const s of data.sheets) {
        msg += `  [${s.sheet}] ${s.rows} 行 → 新增 ${s.created}, 跳过 ${s.skipped}\n`
      }
    }
    if (data.errors && data.errors.length > 0) {
      msg += '\n错误详情:\n' + data.errors.slice(0, 20).join('\n')
      if (data.errors.length > 20) msg += `\n... 等共 ${data.errors.length} 条错误`
    }
    alert(msg)

    setImportLoading(false)
    reloadSpecs()
    onRefresh()
    e.target.value = ''
  }

  const handleClear = async () => {
    if (!confirm('将清空所有数据（规格、批次、任务、验收记录），是否继续？')) return
    await fetch('/api/specs/clear', { method: 'DELETE' })
    reloadSpecs()
    onRefresh()
  }

  const handleSeed = async () => {
    if (!confirm('将导入演示数据，是否继续？')) return
    await fetch('/api/seed', { method: 'POST' })
    reloadSpecs()
    onRefresh()
  }

  const exportTemplate = () => {
    const header = ['渠道', '素材名称', '宽', '高', '格式', '大小限制(KB)', '是否必做', '文案限制', '禁止事项', '备注', '优先级']
    const csv = [header.join(','), '抖音,图标,1024,1024,PNG,500,是,不超过15个字,禁止使用竞品logo,,高'].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '素材规格导入模板.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const updateField = (key: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="p-4 space-y-3 max-w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">素材规格库</h2>
          <p className="text-xs text-muted-foreground">共 {total} 条规格</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportTemplate}>
            <Download className="h-3.5 w-3.5 mr-1" />导入模板
          </Button>
          <Button variant="outline" size="sm" onClick={handleSeed}>
            <Database className="h-3.5 w-3.5 mr-1" />演示数据
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} className="text-red-500 hover:text-red-700">
            <Trash2 className="h-3.5 w-3.5 mr-1" />清空数据
          </Button>
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild disabled={importLoading}>
              <span>{importLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileUp className="h-3.5 w-3.5 mr-1" />}{importLoading ? '导入中...' : '导入素材表'}</span>
            </Button>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          </label>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />新增规格
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="搜索素材名称..." value={searchName}
          onChange={e => { setSearchName(e.target.value); setPage(1) }}
          className="h-8 w-48 text-sm"
        />
        <Select value={filterChannel} onValueChange={v => { setFilterChannel(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue placeholder="渠道" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部渠道</SelectItem>
            {channels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={v => { setFilterPriority(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-8 w-24 text-sm">
            <SelectValue placeholder="优先级" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="高">高</SelectItem>
            <SelectItem value="普通">普通</SelectItem>
            <SelectItem value="低">低</SelectItem>
          </SelectContent>
        </Select>
        {(filterChannel || filterPriority || searchName) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
            setFilterChannel(''); setFilterPriority(''); setSearchName(''); setPage(1)
          }}>
            <X className="h-3 w-3 mr-1" />清除筛选
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <div className="max-h-[calc(100vh-280px)] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs h-9 w-20">渠道</TableHead>
                <TableHead className="text-xs h-9 w-24">素材名称</TableHead>
                <TableHead className="text-xs h-9 w-24 text-center">尺寸</TableHead>
                <TableHead className="text-xs h-9 w-16 text-center">格式</TableHead>
                <TableHead className="text-xs h-9 w-20 text-center">大小限制</TableHead>
                <TableHead className="text-xs h-9 w-14 text-center">必做</TableHead>
                <TableHead className="text-xs h-9 w-14 text-center">优先级</TableHead>
                <TableHead className="text-xs h-9">文案限制</TableHead>
                <TableHead className="text-xs h-9">禁止事项</TableHead>
                <TableHead className="text-xs h-9">备注</TableHead>
                <TableHead className="text-xs h-9 w-20 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-sm">
                    暂无数据，请添加规格或导入Excel
                  </TableCell>
                </TableRow>
              ) : (
                items.map(spec => (
                  <TableRow key={spec.id} className="text-xs">
                    <TableCell className="py-1.5 font-medium">{spec.channel}</TableCell>
                    <TableCell className="py-1.5">{spec.name}</TableCell>
                    <TableCell className="py-1.5 text-center font-mono">{spec.width}x{spec.height}</TableCell>
                    <TableCell className="py-1.5 text-center">
                      <Badge variant="secondary" className="text-[10px] px-1.5">{spec.format}</Badge>
                    </TableCell>
                    <TableCell className="py-1.5 text-center">{spec.maxSize}KB</TableCell>
                    <TableCell className="py-1.5 text-center">
                      {spec.isRequired ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 hover:bg-emerald-100">必做</Badge> : <span className="text-muted-foreground">选做</span>}
                    </TableCell>
                    <TableCell className="py-1.5 text-center">
                      <PriorityBadge priority={spec.priority} />
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground max-w-32 truncate">{spec.copyLimit || '-'}</TableCell>
                    <TableCell className="py-1.5 text-muted-foreground max-w-32 truncate">{spec.forbidden || '-'}</TableCell>
                    <TableCell className="py-1.5 text-muted-foreground max-w-32 truncate">{spec.remark || '-'}</TableCell>
                    <TableCell className="py-1.5 text-center">
                      <div className="flex justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEdit(spec)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(spec.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pagination */}
      {total > 100 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span>第 {page} 页</span>
            <Button variant="outline" size="sm" className="h-7" disabled={page * 100 >= total} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{editingSpec ? '编辑规格' : '新增规格'}</DialogTitle>
            <DialogDescription className="text-xs">填写素材的渠道规格要求</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">渠道 *</Label>
              <Input className="h-8 text-sm" value={form.channel} onChange={e => updateField('channel', e.target.value)} placeholder="如: 抖音" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">素材名称 *</Label>
              <Input className="h-8 text-sm" value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="如: 开屏" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">宽度 (px)</Label>
              <Input type="number" className="h-8 text-sm" value={form.width} onChange={e => updateField('width', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">高度 (px)</Label>
              <Input type="number" className="h-8 text-sm" value={form.height} onChange={e => updateField('height', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">格式</Label>
              <Select value={form.format} onValueChange={v => updateField('format', v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PNG">PNG</SelectItem>
                  <SelectItem value="JPG">JPG</SelectItem>
                  <SelectItem value="GIF">GIF</SelectItem>
                  <SelectItem value="WEBP">WEBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">大小限制 (KB)</Label>
              <Input type="number" className="h-8 text-sm" value={form.maxSize} onChange={e => updateField('maxSize', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">优先级</Label>
              <Select value={form.priority} onValueChange={v => updateField('priority', v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="高">高</SelectItem>
                  <SelectItem value="普通">普通</SelectItem>
                  <SelectItem value="低">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={form.isRequired} onCheckedChange={v => updateField('isRequired', v)} />
              <Label className="text-xs">必做素材</Label>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">文案限制</Label>
              <Input className="h-8 text-sm" value={form.copyLimit} onChange={e => updateField('copyLimit', e.target.value)} placeholder="如: 不超过15个字" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">禁止事项</Label>
              <Input className="h-8 text-sm" value={form.forbidden} onChange={e => updateField('forbidden', e.target.value)} placeholder="如: 禁止使用竞品logo" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">备注</Label>
              <Textarea className="text-sm min-h-16" value={form.remark} onChange={e => updateField('remark', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.channel || !form.name}>
              {editingSpec ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ========== Tasks View ==========
const STATUS_FLOW: Record<string, string> = {
  '待制作': '制作中',
  '制作中': '已完成',
  '已完成': '待制作',
  '异常': '待制作',
}

function TasksView({ batchId, channels, specs, onRefresh, onBatchChange }: {
  batchId: string
  channels: string[]
  specs: MaterialSpec[]
  onRefresh: () => void
  onBatchChange: (id: string) => void
}) {
  const [gameName, setGameName] = useState('')
  const [batchName, setBatchName] = useState('')
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'list' | 'smart'>('list')
  const [editingRemark, setEditingRemark] = useState<string | null>(null)
  const [remarkValue, setRemarkValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [channelSearch, setChannelSearch] = useState('')
  const [channelGroupMode, setChannelGroupMode] = useState<'flat' | 'group'>('group')
  const [channelTypes, setChannelTypes] = useState<Array<{name: string; count: number}>>([]) // 当前渠道对应的素材类型
  const [previewCount, setPreviewCount] = useState(0) // 准确的预览计数（从API获取）
  const [favoriteChannels, setFavoriteChannels] = useState<string[]>([])
  const [showFavEdit, setShowFavEdit] = useState(false)
  const [favEditValue, setFavEditValue] = useState('')
  const { toast } = useToast()

  // 加载常用渠道
  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/settings?key=favorite_channels')
      const data = await res.json()
      if (data.value) {
        try {
          const list = JSON.parse(data.value)
          setFavoriteChannels(list)
          setFavEditValue(list.join(', '))
        } catch {}
      }
    })()
  }, [])

  // 保存常用渠道
  const saveFavoriteChannels = async (newList: string[]) => {
    setFavoriteChannels(newList)
    setFavEditValue(newList.join(', '))
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'favorite_channels', value: JSON.stringify(newList) }),
    })
  }

  // 匹配到的常用渠道（存在于当前规格库中的）
  const matchedFavorites = favoriteChannels.filter(fc => channels.some(ch => ch.includes(fc) || fc.includes(ch)))
  // 未匹配的常用渠道
  const unmatchedFavorites = favoriteChannels.filter(fc => !channels.some(ch => ch.includes(fc) || fc.includes(ch)))
  // 常用渠道对应的实际渠道名映射
  const favoriteToActual: Record<string, string> = {}
  for (const fc of favoriteChannels) {
    const match = channels.find(ch => ch.includes(fc) || fc.includes(ch))
    if (match) favoriteToActual[fc] = match
  }

  // 当选中渠道变化时，自动获取对应的素材类型并默认全选
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (selectedChannels.length === 0) {
        // 未选渠道时，显示所有类型
        const allTypes = [...new Set(specs.map(s => s.name))].sort()
        setChannelTypes(allTypes.map(n => ({ name: n, count: specs.filter(s => s.name === n).length })))
        setPreviewCount(specs.length)
        return
      }
      // 有选中渠道时，从API获取该渠道的素材类型
      const channelsParam = selectedChannels.join(',')
      const [typesRes, countRes] = await Promise.all([
        fetch(`/api/specs?mode=types&channels=${encodeURIComponent(channelsParam)}`),
        fetch(`/api/specs?mode=count&channels=${encodeURIComponent(channelsParam)}`),
      ])
      const typesData = await typesRes.json()
      const countData = await countRes.json()
      if (!cancelled) {
        setChannelTypes(typesData.types || [])
        setPreviewCount(countData.total || 0)
        // 默认全选这些素材类型
        setSelectedTypes((typesData.types || []).map((t: { name: string }) => t.name))
      }
    })()
    return () => { cancelled = true }
  }, [selectedChannels, specs])

  // Channel categorization
  const knownGroups: Record<string, string[]> = {
    '硬核渠道': ['九游', '华为', '荣耀', '小米', '百度', 'OPPO', 'vivo', '应用宝', '360', 'TapTap', '好游快爆', '4399', '七麦', '联想', '三星', '魅族', '酷安', '一加', 'realme', '努比亚', '中兴', '中国电信', '中国移动', '中国联通', '海尔', '海信', 'TCL', '金立', '糖果', '朵唯', '锤子', '美图', '乐视', '纽曼', '酷比', '华硕', '索尼', '飞利浦', 'HTC', '微软', ' LG', '天翼', '联想游戏中心', '魅族游戏中心', 'OPPO游戏中心', 'vivo游戏中心', '华为游戏中心', '小米游戏中心', '三星应用商店'],
    '长尾渠道': ['果盘', '虫虫', '3733', '一元', '指趣', '爱趣', '梨子手游', '天宇游', '可盘', '快照', '7723', '7724', '07073', '当乐', '豌豆荚', '安智', '木蚂蚁', '应用汇', '历趣', '十字猫', '手机乐园', '泡芙', '丫丫玩', '口袋', '同步推', 'PP助手', 'iTools', '快用', '侠客', '游戏鸟', '盒子', 'GG助手', '靠谱', '魔方', '蚕豆', '有料', '搞趣', '好丫', '6199', '33xy', '玩客', '葫芦侠', 'TT', 'V游', '哥们', '悟空', '无极', '考拉', '逗游', '虫虫助手', '八门神器', '葫芦游戏', '拇指玩', '绿洲', '好玩吧'],
    '模拟器/H5': ['MuMu模拟器', '雷电', '夜神', '蓝叠', '逍遥', '腾讯手游助手', '360游戏大厅', '4399游戏盒', '必加', 'Wi-Fi万能钥匙', '360-H5', '胡闹', '迷你', '贪吃蛇', '途游', '波克', '边锋', '竞技世界', '微端'],
    '内容平台': ['阅文', '抖音', '快手', '微信', 'B站', '小红书', '今日头条', 'UC', 'QQ浏览器', '百度浏览器', '搜狗', '360浏览器', '猎豹', 'WiFi管家', 'WiFi万能钥匙'],
    '广告平台': ['广点通', '穿山甲', '优量汇', '快手联盟', '百度联盟', 'Mintegral', 'AppLovin', 'Unity', 'ironSource', 'Vungle', 'Chartboost', 'AdMob', 'Facebook', 'Google'],
  }

  // Auto-classify channels
  const channelCategories = (() => {
    const classified: Record<string, string[]> = {}
    const classifiedSet = new Set<string>()

    // First pass: match known groups
    for (const [group, keywords] of Object.entries(knownGroups)) {
      classified[group] = []
      for (const ch of channels) {
        if (classifiedSet.has(ch)) continue
        if (keywords.some(kw => ch.includes(kw) || kw.includes(ch))) {
          classified[group].push(ch)
          classifiedSet.add(ch)
        }
      }
    }

    // Remaining channels → '其他渠道'
    const remaining = channels.filter(ch => !classifiedSet.has(ch))
    if (remaining.length > 0) {
      classified['其他渠道'] = remaining
    }

    return classified
  })()

  // Filtered channels by search
  const filteredChannelCategories = (() => {
    if (!channelSearch.trim()) return channelCategories
    const q = channelSearch.toLowerCase()
    const result: Record<string, string[]> = {}
    for (const [group, chs] of Object.entries(channelCategories)) {
      const filtered = chs.filter(ch => ch.toLowerCase().includes(q))
      if (filtered.length > 0) result[group] = filtered
    }
    return result
  })()

  const fetchTasks = async () => {
    if (!batchId) return
    const res = await fetch(`/api/tasks?batchId=${batchId}`)
    const data = await res.json()
    setTasks(data)
  }

  useEffect(() => { fetchTasks() }, [batchId])

  const toggleChannel = (ch: string) => {
    setSelectedChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])
  }

  const toggleType = (t: string) => {
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const handleGenerate = async () => {
    if (!gameName || !batchName) {
      toast({ title: '请填写游戏名称和批次名称', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName, batchName,
          channels: selectedChannels.length > 0 ? selectedChannels : undefined,
          materialTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
        }),
      })
      const batch = await res.json()
      if (batch.error) {
        toast({ title: '生成失败', description: batch.error, variant: 'destructive' })
        setLoading(false)
        return
      }
      // 切换到新创建的批次
      onBatchChange(batch.id)
      toast({
        title: '任务生成成功',
        description: `批次「${gameName} - ${batchName}」已创建，共 ${batch.tasks?.length || 0} 个任务`,
      })
      // 清空表单
      setGameName('')
      setBatchName('')
      setSelectedChannels([])
      setSelectedTypes([])
    } catch {
      toast({ title: '请求失败', variant: 'destructive' })
    }
    setLoading(false)
  }

  const handleExport = (mode: string) => {
    if (!batchId) return
    window.open(`/api/tasks/export?batchId=${batchId}&mode=${mode}`, '_blank')
  }

  const handleStatusChange = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const nextStatus = STATUS_FLOW[task.status] || '待制作'
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status: nextStatus }),
    })
    fetchTasks()
    onRefresh()
  }

  const handleBatchStatus = async (from: string, to: string) => {
    if (!batchId) return
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, status: from, targetStatus: to }),
    })
    fetchTasks()
    onRefresh()
  }

  const handleSaveRemark = async (taskId: string) => {
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, remark: remarkValue }),
    })
    setEditingRemark(null)
    fetchTasks()
  }

  const handleDeleteTask = async (taskId: string) => {
    await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
    fetchTasks()
    onRefresh()
  }

  // 当素材类型选择变化时，重新计算准确计数
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const params = new URLSearchParams()
      if (selectedChannels.length > 0) {
        params.set('channels', selectedChannels.join(','))
      }
      if (selectedTypes.length > 0) {
        params.set('mode', 'count')
      }
      // 如果有素材类型筛选，需要精确计数
      if (selectedTypes.length > 0 && selectedTypes.length < (channelTypes.length || 999)) {
        // 按渠道+类型分别计数
        const total = channelTypes
          .filter(t => selectedTypes.includes(t.name))
          .reduce((sum, t) => sum + t.count, 0)
        if (!cancelled) setPreviewCount(total)
        return
      }
      // 没有类型筛选或全选时，用API count
      if (selectedChannels.length > 0) {
        const res = await fetch(`/api/specs?mode=count&channels=${encodeURIComponent(selectedChannels.join(','))}`)
        const data = await res.json()
        if (!cancelled) setPreviewCount(data.total || 0)
      } else {
        if (!cancelled) setPreviewCount(specs.length)
      }
    })()
    return () => { cancelled = true }
  }, [selectedTypes, channelTypes])

  // Smart grouping: tasks by shared size
  const smartGroups = (() => {
    const groups: Record<string, { w: number; h: number; format: string; tasks: TaskItem[]; channels: string[]; names: string[] }> = {}
    for (const t of tasks) {
      const key = `${t.specWidth}x${t.specHeight}_${t.specFormat}`
      if (!groups[key]) groups[key] = { w: t.specWidth, h: t.specHeight, format: t.specFormat, tasks: [], channels: [], names: [] }
      groups[key].tasks.push(t)
      if (!groups[key].channels.includes(t.specChannel)) groups[key].channels.push(t.specChannel)
      if (!groups[key].names.includes(t.specName)) groups[key].names.push(t.specName)
    }
    return Object.values(groups).sort((a, b) => b.tasks.length - a.tasks.length)
  })()

  const totalUnique = smartGroups.length
  const totalTasks = tasks.length
  const reusableRatio = totalTasks > 0 ? Math.round(((totalTasks - totalUnique) / totalTasks) * 100) : 0
  const taskChannels = [...new Set(tasks.map(t => t.specChannel))].sort()
  const statusCounts = {
    all: tasks.length,
    '待制作': tasks.filter(t => t.status === '待制作').length,
    '制作中': tasks.filter(t => t.status === '制作中').length,
    '已完成': tasks.filter(t => t.status === '已完成').length,
    '异常': tasks.filter(t => t.status === '异常').length,
  }
  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (channelFilter !== 'all' && t.specChannel !== channelFilter) return false
    return true
  })

  return (
    <div className="p-4 space-y-4 max-w-6xl">
      <div>
        <h2 className="text-lg font-semibold">任务生成器</h2>
        <p className="text-xs text-muted-foreground">根据素材规格库自动生成任务清单</p>
      </div>

      {/* Generator Form */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">游戏名称 *</Label>
            <Input className="h-8 text-sm" value={gameName} onChange={e => setGameName(e.target.value)} placeholder="如: 原神" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">批次名称 *</Label>
            <Input className="h-8 text-sm" value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="如: 2024年6月推广" />
          </div>
        </div>
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">选择渠道 (不选则全部)</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">已选 {selectedChannels.length}/{channels.length}</span>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5"
                onClick={() => setChannelGroupMode(channelGroupMode === 'group' ? 'flat' : 'group')}>
                {channelGroupMode === 'group' ? '平铺' : '分类'}
              </Button>
            </div>
          </div>

          {/* Search + Batch actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                className="h-7 text-xs pl-7"
                placeholder="搜索渠道名..."
                value={channelSearch}
                onChange={e => setChannelSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 shrink-0"
              onClick={() => setSelectedChannels([...channels])}>
              全选
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 shrink-0"
              onClick={() => setSelectedChannels([])}>
              清空
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2 shrink-0"
              onClick={() => setSelectedChannels(channels.filter(ch => !selectedChannels.includes(ch)))}>
              反选
            </Button>
          </div>

          {/* 常用渠道快捷选择 */}
          {favoriteChannels.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-xs font-medium text-amber-700">常用渠道</span>
                  {matchedFavorites.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] px-1.5 ml-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => {
                        const actualChannels = matchedFavorites.map(fc => favoriteToActual[fc]).filter(Boolean)
                        const allAlreadySelected = actualChannels.every(ch => selectedChannels.includes(ch))
                        if (allAlreadySelected) {
                          setSelectedChannels(prev => prev.filter(c => !actualChannels.includes(c)))
                        } else {
                          setSelectedChannels(prev => [...new Set([...prev, ...actualChannels])])
                        }
                      }}
                    >
                      {matchedFavorites.every(fc => selectedChannels.includes(favoriteToActual[fc])) ? '取消常用' : '选择常用'}
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-muted-foreground"
                  onClick={() => setShowFavEdit(!showFavEdit)}>
                  <Settings className="h-3 w-3 mr-0.5" />编辑
                </Button>
              </div>

              {/* 常用渠道标签 */}
              <div className="flex flex-wrap gap-1">
                {favoriteChannels.map(fc => {
                  const actualChannel = favoriteToActual[fc]
                  const isMatched = !!actualChannel
                  const isSelected = isMatched && selectedChannels.includes(actualChannel)
                  return (
                    <Badge
                      key={fc}
                      variant={isSelected ? 'default' : 'outline'}
                      className={`text-[10px] h-5 cursor-pointer ${!isMatched ? 'opacity-50 line-through' : ''}`}
                      onClick={() => {
                        if (!isMatched) return
                        toggleChannel(actualChannel)
                      }}
                    >
                      <Star className={`h-2.5 w-2.5 mr-0.5 ${isSelected ? 'fill-current' : 'text-amber-400'}`} />
                      {fc}
                    </Badge>
                  )
                })}
              </div>

              {/* 未匹配提示 */}
              {unmatchedFavorites.length > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  * {unmatchedFavorites.join(', ')} 在规格库中暂无匹配
                </div>
              )}

              {/* 编辑常用渠道对话框 */}
              {showFavEdit && (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md border">
                  <Input
                    className="h-7 text-xs flex-1"
                    value={favEditValue}
                    onChange={e => setFavEditValue(e.target.value)}
                    placeholder="用逗号分隔渠道名，如：荣耀, 小米, 百度"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const newList = favEditValue.split(/[,，]/).map(s => s.trim()).filter(Boolean)
                        saveFavoriteChannels(newList)
                        setShowFavEdit(false)
                      }
                      if (e.key === 'Escape') setShowFavEdit(false)
                    }}
                  />
                  <Button size="sm" className="h-7 text-[10px] shrink-0"
                    onClick={() => {
                      const newList = favEditValue.split(/[,，]/).map(s => s.trim()).filter(Boolean)
                      saveFavoriteChannels(newList)
                      setShowFavEdit(false)
                    }}>
                    保存
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] shrink-0"
                    onClick={() => setShowFavEdit(false)}>
                    取消
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Selected channels display */}
          {selectedChannels.length > 0 && (
            <div className="flex flex-wrap gap-1 p-1.5 bg-primary/5 rounded-md border border-primary/20">
              {selectedChannels.map(ch => (
                <Badge key={ch} variant="default" className="text-[10px] cursor-pointer h-5"
                  onClick={() => toggleChannel(ch)}>
                  {ch}
                  <X className="h-2.5 w-2.5 ml-0.5" />
                </Badge>
              ))}
            </div>
          )}

          {/* Channel list */}
          <div className="max-h-48 overflow-y-auto border rounded-md">
            {channelGroupMode === 'group' ? (
              // Grouped mode
              <div>
                {Object.entries(filteredChannelCategories).map(([group, chs]) => {
                  const allSelected = chs.length > 0 && chs.every(ch => selectedChannels.includes(ch))
                  const someSelected = chs.some(ch => selectedChannels.includes(ch))
                  return (
                    <div key={group}>
                      <div
                        className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 border-b sticky top-0 cursor-pointer hover:bg-muted/80"
                        onClick={() => {
                          if (allSelected) {
                            setSelectedChannels(prev => prev.filter(c => !chs.includes(c)))
                          } else {
                            setSelectedChannels(prev => [...new Set([...prev, ...chs])])
                          }
                        }}
                      >
                        <Checkbox
                          checked={allSelected}
                          ref={(el) => { if (el) { const input = el as unknown as { indeterminate: boolean }; input.indeterminate = someSelected && !allSelected } }}
                          className="h-3 w-3"
                        />
                        <span className="text-xs font-medium">{group}</span>
                        <span className="text-[10px] text-muted-foreground">{chs.length}</span>
                        {someSelected && !allSelected && (
                          <span className="text-[10px] text-primary">{chs.filter(c => selectedChannels.includes(c)).length}/{chs.length}</span>
                        )}
                      </div>
                      <div className="px-2 py-1.5 flex flex-wrap gap-1">
                        {chs.map(ch => (
                          <Badge
                            key={ch}
                            variant={selectedChannels.includes(ch) ? 'default' : 'outline'}
                            className="text-[10px] cursor-pointer h-5"
                            onClick={() => toggleChannel(ch)}
                          >
                            {ch}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              // Flat mode
              <div className="p-2 flex flex-wrap gap-1">
                {(channelSearch.trim()
                  ? channels.filter(ch => ch.toLowerCase().includes(channelSearch.toLowerCase()))
                  : channels
                ).map(ch => (
                  <Badge key={ch} variant={selectedChannels.includes(ch) ? 'default' : 'outline'} className="text-[10px] cursor-pointer h-5" onClick={() => toggleChannel(ch)}>{ch}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">选择素材类型 (不选则全部)</Label>
            <span className="text-xs text-muted-foreground">已选 {selectedTypes.length}/{channelTypes.length} 种 · 共 {channelTypes.reduce((s, t) => s + t.count, 0)} 条规格</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-1.5"
              onClick={() => setSelectedTypes(channelTypes.map(t => t.name))}>
              全选
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-1.5"
              onClick={() => setSelectedTypes([])}>
              清空
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {channelTypes.length === 0 ? (
              <span className="text-xs text-muted-foreground">请先选择渠道，系统将自动加载对应素材类型</span>
            ) : (
              channelTypes.map(t => (
                <Badge key={t.name} variant={selectedTypes.includes(t.name) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs" onClick={() => toggleType(t.name)}>
                  {t.name}
                  <span className="ml-1 text-[9px] opacity-60">{t.count}</span>
                </Badge>
              ))
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">预计生成 {previewCount} 条任务</span>
          <Button size="sm" onClick={handleGenerate} disabled={!gameName || !batchName || loading || previewCount === 0}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ListChecks className="h-4 w-4 mr-1" />}
            生成任务
          </Button>
        </div>
      </Card>

      {/* Current Batch Tasks */}
      {batchId && tasks.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">当前批次任务 ({tasks.length})</CardTitle>
                <CardDescription className="text-xs">点击状态标签可流转 · 共 {totalUnique} 个独立尺寸，{reusableRatio}% 可复用</CardDescription>
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleExport('channel')}>
                  <FileDown className="h-3 w-3 mr-1" />按渠道交付
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleExport('completed')}>
                  <CheckCircle2 className="h-3 w-3 mr-1" />已完成
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleExport('all')}>
                  <FileDown className="h-3 w-3 mr-1" />全部导出
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {/* Tab switch */}
            <div className="flex gap-2 mb-3">
              <Button variant={activeTab === 'list' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setActiveTab('list')}>
                <ListChecks className="h-3 w-3 mr-1" />任务清单
              </Button>
              <Button variant={activeTab === 'smart' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setActiveTab('smart')}>
                <Layers className="h-3 w-3 mr-1" />出图清单
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">{reusableRatio}%可复用</Badge>
              </Button>
            </div>

            {/* === 出图清单 View === */}
            {activeTab === 'smart' && (
              <div className="max-h-[calc(100vh-460px)] overflow-auto space-y-2">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="p-2 rounded-md bg-blue-50 border border-blue-100 text-center">
                    <div className="text-lg font-bold text-blue-700">{totalUnique}</div>
                    <div className="text-[10px] text-blue-600">独立尺寸</div>
                  </div>
                  <div className="p-2 rounded-md bg-emerald-50 border border-emerald-100 text-center">
                    <div className="text-lg font-bold text-emerald-700">{totalTasks - totalUnique}</div>
                    <div className="text-[10px] text-emerald-600">可复用素材</div>
                  </div>
                  <div className="p-2 rounded-md bg-amber-50 border border-amber-100 text-center">
                    <div className="text-lg font-bold text-amber-700">{reusableRatio}%</div>
                    <div className="text-[10px] text-amber-600">省工比例</div>
                  </div>
                </div>
                {smartGroups.map((g, gi) => {
                  const done = g.tasks.filter(t => t.status === '已完成').length
                  const allDone = done === g.tasks.length
                  return (
                    <Card key={gi} className={`border ${allDone ? 'border-emerald-200 bg-emerald-50/30' : ''}`}>
                      <CardHeader className="py-2 px-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="font-mono text-sm font-bold">{g.w}x{g.h}</div>
                            <Badge variant="secondary" className="text-[10px]">{g.format}</Badge>
                            <Badge variant={allDone ? 'default' : 'outline'} className={`text-[10px] ${allDone ? 'bg-emerald-500' : ''}`}>
                              {done}/{g.tasks.length} 完成
                            </Badge>
                          </div>
                          {g.tasks.length > 1 && (
                            <Badge className="bg-violet-100 text-violet-700 text-[10px] px-1.5 hover:bg-violet-100">
                              <Layers className="h-2.5 w-2.5 mr-0.5" />复用 {g.tasks.length}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="px-3 pb-2">
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {g.names.map(n => <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>)}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {g.channels.map(ch => <span key={ch} className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">{ch}</span>)}
                        </div>
                        <div className="mt-2 space-y-0.5">
                          {g.tasks.map(t => (
                            <div key={t.id} className="flex items-center justify-between text-[11px] py-0.5 px-1 rounded hover:bg-muted/50">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-muted-foreground">{t.specChannel}</span>
                                <span className="truncate">{t.specName}</span>
                                {t.specIsRequired && <span className="text-red-400">*</span>}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {t.remark && <span className="text-[10px] text-amber-600 bg-amber-50 rounded px-1 truncate max-w-20" title={t.remark}>{t.remark}</span>}
                                <StatusBadge status={t.status} clickable onClick={() => handleStatusChange(t.id)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* === 任务清单 View === */}
            {activeTab === 'list' && (
              <div className="max-h-[calc(100vh-460px)] overflow-auto">
                {/* Batch status actions */}
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className="text-xs text-muted-foreground mr-1">批量操作:</span>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleBatchStatus('待制作', '制作中')} disabled={statusCounts['待制作'] === 0}>
                    待制作→制作中 ({statusCounts['待制作']})
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleBatchStatus('制作中', '已完成')} disabled={statusCounts['制作中'] === 0}>
                    制作中→已完成 ({statusCounts['制作中']})
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleBatchStatus('异常', '待制作')} disabled={statusCounts['异常'] === 0}>
                    异常→待制作 ({statusCounts['异常']})
                  </Button>
                </div>

                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-muted-foreground">筛选:</span>
                  {Object.entries(statusCounts).map(([key, count]) => (
                    <Badge key={key} variant={statusFilter === key ? 'default' : 'outline'} className="text-[10px] cursor-pointer" onClick={() => setStatusFilter(key)}>
                      {key === 'all' ? '全部' : key} ({count})
                    </Badge>
                  ))}
                  <Separator orientation="vertical" className="h-4 mx-1" />
                  <Select value={channelFilter} onValueChange={setChannelFilter}>
                    <SelectTrigger className="h-6 w-28 text-[10px]"><SelectValue placeholder="渠道" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部渠道</SelectItem>
                      {taskChannels.map(ch => <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs h-8 w-16">渠道</TableHead>
                      <TableHead className="text-xs h-8 w-20">素材</TableHead>
                      <TableHead className="text-xs h-8 w-24 text-center">尺寸</TableHead>
                      <TableHead className="text-xs h-8 w-14 text-center">格式</TableHead>
                      <TableHead className="text-xs h-8 w-14 text-center">必做</TableHead>
                      <TableHead className="text-xs h-8">建议文件名</TableHead>
                      <TableHead className="text-xs h-8 w-28 text-center">状态</TableHead>
                      <TableHead className="text-xs h-8 w-24">备注</TableHead>
                      <TableHead className="text-xs h-8 w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map(t => (
                      <TableRow key={t.id} className="text-xs group">
                        <TableCell className="py-1.5">{t.specChannel}</TableCell>
                        <TableCell className="py-1.5">{t.specName}</TableCell>
                        <TableCell className="py-1.5 text-center font-mono">{t.specWidth}x{t.specHeight}</TableCell>
                        <TableCell className="py-1.5 text-center">{t.specFormat}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          {t.specIsRequired ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 hover:bg-emerald-100">必做</Badge> : '-'}
                        </TableCell>
                        <TableCell className="py-1.5 font-mono text-muted-foreground text-[11px]">{t.suggestedFileName}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <StatusBadge status={t.status} clickable onClick={() => handleStatusChange(t.id)} />
                        </TableCell>
                        <TableCell className="py-1.5">
                          {editingRemark === t.id ? (
                            <div className="flex items-center gap-1">
                              <Input className="h-6 text-[11px] w-20" value={remarkValue} onChange={e => setRemarkValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveRemark(t.id); if (e.key === 'Escape') setEditingRemark(null) }} autoFocus placeholder="备注..." />
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handleSaveRemark(t.id)}><Check className="h-3 w-3" /></Button>
                            </div>
                          ) : (
                            <span className={`cursor-pointer hover:bg-muted rounded px-1 py-0.5 inline-block max-w-20 truncate ${t.remark ? 'text-amber-700' : 'text-muted-foreground'}`} onClick={() => { setEditingRemark(t.id); setRemarkValue(t.remark || '') }} title={t.remark || '点击添加备注'}>
                              {t.remark || '添加'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600" onClick={() => handleDeleteTask(t.id)} title="删除任务">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ========== Acceptance View ==========
function AcceptanceView({ batchId, onRefresh }: {
  batchId: string
  onRefresh: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<AcceptanceResult[]>([])
  const [missingRequired, setMissingRequired] = useState<Array<{ id: string; specChannel: string; specName: string; suggestedFileName: string }>>([])
  const [loading, setLoading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [previews, setPreviews] = useState<Record<number, string>>({})
  const [resultView, setResultView] = useState<'size' | 'status'>('size')
  const { toast } = useToast()

  const addFiles = (fileList: FileList | File[]) => {
    const newFiles = Array.from(fileList).filter(f =>
      f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name)
    )
    if (newFiles.length === 0) {
      toast({ title: '请选择图片文件', description: '支持 PNG/JPG/GIF/WEBP 格式', variant: 'destructive' })
      return
    }
    setFiles(prev => {
      const updated = [...prev, ...newFiles]
      // Generate previews for new files
      newFiles.forEach(f => {
        const url = URL.createObjectURL(f)
        const idx = prev.length + newFiles.indexOf(f)
        setPreviews(p => ({ ...p, [idx]: url }))
      })
      return updated
    })
    setUploaded(false)
    setResults([])
    setMissingRequired([])
    setResultView('size')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files || [])
    e.target.value = ''
  }

  const removeFile = (idx: number) => {
    // Cleanup preview URL
    if (previews[idx]) {
      URL.revokeObjectURL(previews[idx])
      setPreviews(p => {
        const next = { ...p }
        delete next[idx]
        return next
      })
    }
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleAccept = async () => {
    if (!batchId || files.length === 0) {
      toast({ title: '请先选择批次并上传文件', variant: 'destructive' })
      return
    }
    setLoading(true)
    const fd = new FormData()
    fd.append('batchId', batchId)
    files.forEach(f => fd.append('files', f))

    const res = await fetch('/api/acceptance', { method: 'POST', body: fd })
    const data = await res.json()
    setResults(data.results)
    setMissingRequired(data.missingRequired || [])
    setUploaded(true)
    setResultView('size')
    setLoading(false)
    onRefresh()

    const criticalCount = data.results.filter((r: AcceptanceResult) => r.severity === 'critical').length
    if (criticalCount > 0) {
      toast({ title: `验收完成: ${criticalCount} 个严重问题`, variant: 'destructive' })
    } else {
      toast({ title: `验收完成: ${data.results.length} 个文件通过检查` })
    }
  }

  const reset = () => {
    // Cleanup all preview URLs
    Object.values(previews).forEach(url => URL.revokeObjectURL(url))
    setFiles([])
    setResults([])
    setMissingRequired([])
    setUploaded(false)
    setPreviews({})
    setResultView('size')
  }

  const criticalResults = results.filter(r => r.severity === 'critical')
  const normalResults = results.filter(r => r.severity === 'normal')
  const ignoreResults = results.filter(r => r.severity === 'ignore')
  const sizeGroups = Object.values(results.reduce((acc, result) => {
    const sizeLabel = result.fileWidth && result.fileHeight
      ? `${result.fileWidth}x${result.fileHeight}`
      : '未知尺寸'
    const format = result.fileFormat || '未知格式'
    const key = sizeLabel
    if (!acc[key]) {
      acc[key] = {
        key,
        sizeLabel,
        formats: new Set<string>(),
        results: [] as AcceptanceResult[],
        criticalCount: 0,
        normalCount: 0,
        passCount: 0,
        channels: new Set<string>(),
      }
    }
    const group = acc[key]
    group.results.push(result)
    group.formats.add(format)
    if (result.severity === 'critical') group.criticalCount++
    else if (result.severity === 'normal') group.normalCount++
    else group.passCount++
    if (result.specChannel && result.specChannel !== '-') {
      group.channels.add(result.specChannel)
    }
    return acc
  }, {} as Record<string, {
    key: string
    sizeLabel: string
    formats: Set<string>
    results: AcceptanceResult[]
    criticalCount: number
    normalCount: number
    passCount: number
    channels: Set<string>
  }>)).sort((a, b) => {
    const aProblem = a.criticalCount + a.normalCount
    const bProblem = b.criticalCount + b.normalCount
    if (bProblem !== aProblem) return bProblem - aProblem
    return b.results.length - a.results.length
  })
  const issueSizeCount = sizeGroups.filter(g => g.criticalCount > 0 || g.normalCount > 0).length
  const passSizeCount = sizeGroups.filter(g => g.criticalCount === 0 && g.normalCount === 0).length

  if (!batchId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">请先选择批次</h2>
          <p className="text-sm text-muted-foreground">在侧边栏选择一个批次后再进行验收</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold">素材验收</h2>
        <p className="text-xs text-muted-foreground">上传素材文件，自动校验尺寸、格式、大小</p>
      </div>

      {/* Upload Area - Drag & Drop */}
      <Card className="p-4">
        <div className="space-y-3">
          <Label className="text-xs">选择素材文件 (支持 PNG/JPG/GIF/WEBP)</Label>

          {/* Drop Zone */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : files.length > 0
                  ? 'border-emerald-300 bg-emerald-50/50 hover:border-emerald-400'
                  : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/20'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              type="file" multiple accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileChange}
            />
            <div className="pointer-events-none">
              {isDragging ? (
                <>
                  <div className="relative inline-block">
                    <FileImage className="h-10 w-10 mx-auto text-primary animate-bounce" />
                    <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                      <ArrowDown className="h-3 w-3" />
                    </div>
                  </div>
                  <div className="text-sm font-medium text-primary mt-3">松开鼠标即可添加</div>
                </>
              ) : files.length > 0 ? (
                <>
                  <div className="relative inline-block">
                    <ImagePlus className="h-10 w-10 mx-auto text-emerald-500" />
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                      {files.length}
                    </div>
                  </div>
                  <div className="text-sm font-medium mt-3">已选择 {files.length} 个素材</div>
                  <div className="text-xs text-muted-foreground mt-1">继续拖入更多文件，或点击选择</div>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                  <div className="text-sm font-medium mt-3">拖拽素材图片到此处</div>
                  <div className="text-xs text-muted-foreground mt-1">或点击选择文件 · 支持批量多选</div>
                  <div className="flex items-center justify-center gap-3 mt-3">
                    <Badge variant="secondary" className="text-[10px] font-normal">PNG</Badge>
                    <Badge variant="secondary" className="text-[10px] font-normal">JPG</Badge>
                    <Badge variant="secondary" className="text-[10px] font-normal">GIF</Badge>
                    <Badge variant="secondary" className="text-[10px] font-normal">WEBP</Badge>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Image Previews Grid */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">素材预览 ({files.length})</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={reset}>
                  <X className="h-3 w-3 mr-1" />清除全部
                </Button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-64 overflow-y-auto p-1">
                {files.map((f, i) => (
                  <div key={i} className="group relative aspect-square rounded-md border bg-muted/30 overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all">
                    {previews[i] ? (
                      <img
                        src={previews[i]}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileImage className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end">
                      <div className="w-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="text-[9px] text-white truncate font-mono bg-black/60 rounded px-1 py-0.5">{f.name}</div>
                        <div className="text-[9px] text-white/70 font-mono">{(f.size / 1024).toFixed(0)}KB</div>
                      </div>
                    </div>
                    {/* Remove button */}
                    <button
                      className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
              {/* Total size */}
              <div className="text-[10px] text-muted-foreground text-right">
                总大小: {(files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          )}

          <Button
            size="sm" onClick={handleAccept}
            disabled={files.length === 0 || loading}
            className="w-full"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1" />}
            {loading ? '正在验收中...' : `开始验收 (${files.length} 个文件)`}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {uploaded && (
        <>
          <Tabs value={resultView} onValueChange={(v) => setResultView(v as typeof resultView)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="size" className="text-xs">
                <Ruler className="h-3.5 w-3.5 mr-1" />
                按尺寸分组
              </TabsTrigger>
              <TabsTrigger value="status" className="text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                按问题类型
              </TabsTrigger>
            </TabsList>

            <TabsContent value="size" className="space-y-3 mt-3">
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-2.5 text-center">
                  <div className="text-lg font-bold">{sizeGroups.length}</div>
                  <div className="text-[10px] text-muted-foreground">独立尺寸数</div>
                </Card>
                <Card className="p-2.5 text-center border-amber-200 bg-amber-50">
                  <div className="text-lg font-bold text-amber-600">{issueSizeCount}</div>
                  <div className="text-[10px] text-muted-foreground">有问题尺寸</div>
                </Card>
                <Card className="p-2.5 text-center border-emerald-200 bg-emerald-50">
                  <div className="text-lg font-bold text-emerald-600">{passSizeCount}</div>
                  <div className="text-[10px] text-muted-foreground">通过尺寸</div>
                </Card>
              </div>

              <div className="space-y-2">
                {sizeGroups.map(group => {
                  const channels = Array.from(group.channels)
                  const formats = Array.from(group.formats).sort()
                  return (
                    <Card key={group.key}>
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                              <Ruler className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono">{group.sizeLabel}</span>
                              {formats.map(format => (
                                <Badge key={format} variant="outline" className="text-[10px] px-1.5">{format}</Badge>
                              ))}
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {group.results.length} 个文件 · 涉及渠道 {channels.length}
                              {channels.length > 0 && `：${channels.slice(0, 6).join('、')}`}
                              {channels.length > 6 && ` 等 ${channels.length} 个`}
                            </CardDescription>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Badge variant="outline" className="text-[10px] px-1.5 border-red-200 bg-red-50 text-red-700">
                              严重 {group.criticalCount}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 border-amber-200 bg-amber-50 text-amber-700">
                              警告 {group.normalCount}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 border-emerald-200 bg-emerald-50 text-emerald-700">
                              通过 {group.passCount}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="max-h-56 overflow-y-auto">
                          {group.results.map((r, i) => (
                            <AcceptanceItem key={`${group.key}-${i}`} result={r} />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </TabsContent>

            <TabsContent value="status" className="space-y-3 mt-3">
              <div className="grid grid-cols-4 gap-2">
                <Card className="p-2.5 text-center">
                  <div className="text-lg font-bold">{results.length}</div>
                  <div className="text-[10px] text-muted-foreground">总计</div>
                </Card>
                <Card className="p-2.5 text-center border-red-200 bg-red-50">
                  <div className="text-lg font-bold text-red-600">{criticalResults.length}</div>
                  <div className="text-[10px] text-muted-foreground">严重</div>
                </Card>
                <Card className="p-2.5 text-center border-amber-200 bg-amber-50">
                  <div className="text-lg font-bold text-amber-600">{normalResults.length}</div>
                  <div className="text-[10px] text-muted-foreground">普通</div>
                </Card>
                <Card className="p-2.5 text-center border-emerald-200 bg-emerald-50">
                  <div className="text-lg font-bold text-emerald-600">{ignoreResults.length}</div>
                  <div className="text-[10px] text-muted-foreground">通过/可忽略</div>
                </Card>
              </div>

              {criticalResults.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm text-red-600 flex items-center gap-1">
                      <AlertOctagon className="h-4 w-4" />严重问题 ({criticalResults.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="max-h-48 overflow-y-auto">
                      {criticalResults.map((r, i) => (
                        <AcceptanceItem key={i} result={r} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {normalResults.length > 0 && (
                <Card className="border-amber-200">
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />普通警告 ({normalResults.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="max-h-48 overflow-y-auto">
                      {normalResults.map((r, i) => (
                        <AcceptanceItem key={i} result={r} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {missingRequired.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm text-red-600 flex items-center gap-1">
                      <AlertOctagon className="h-4 w-4" />缺少必做素材 ({missingRequired.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {missingRequired.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-red-50 rounded px-2 py-1.5">
                          <div>
                            <span className="font-medium">{m.specChannel}</span>
                            <span className="text-muted-foreground mx-1">-</span>
                            <span>{m.specName}</span>
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground truncate max-w-60">{m.suggestedFileName}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {ignoreResults.length > 0 && (
                <Card className="border-emerald-200">
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />通过 / 可忽略 ({ignoreResults.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="max-h-48 overflow-y-auto">
                      {ignoreResults.map((r, i) => (
                        <AcceptanceItem key={i} result={r} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {/* Quick Re-acceptance for Failed Files */}
          {(criticalResults.length > 0 || normalResults.length > 0) && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">需要返工</div>
                  <div className="text-xs text-muted-foreground">
                    {criticalResults.length > 0 && ` ${criticalResults.length} 个严重`}
                    {criticalResults.length > 0 && normalResults.length > 0 && ' ·'}
                    {normalResults.length > 0 && ` ${normalResults.length} 个警告`}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    // Reset file list but keep results visible as reference
                    Object.values(previews).forEach(url => URL.revokeObjectURL(url))
                    setFiles([])
                    setPreviews({})
                    setUploaded(false)
                    toast({ title: '请上传修正后的文件', description: '只会验收此次上传的文件' })
                    // Scroll to top of upload area
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  重新上传验收
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ========== Logs View ==========
function LogsView({ batchId, onRefresh }: {
  batchId: string
  onRefresh: () => void
}) {
  const [logs, setLogs] = useState<Array<{
    id: string; batchId: string | null; action: string; target: string;
    detail: string; meta: string; createdAt: string
  }>>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [actionFilter, setActionFilter] = useState<string>('all')

  const actionLabels: Record<string, { label: string; color: string; icon: string }> = {
    batch_create: { label: '创建批次', color: 'bg-blue-100 text-blue-700', icon: '📦' },
    task_create: { label: '生成任务', color: 'bg-indigo-100 text-indigo-700', icon: '📋' },
    task_status: { label: '状态变更', color: 'bg-amber-100 text-amber-700', icon: '🔄' },
    task_batch: { label: '批量操作', color: 'bg-purple-100 text-purple-700', icon: '⚡' },
    task_remark: { label: '备注修改', color: 'bg-cyan-100 text-cyan-700', icon: '💬' },
    task_delete: { label: '删除任务', color: 'bg-red-100 text-red-700', icon: '🗑️' },
    acceptance: { label: '素材验收', color: 'bg-emerald-100 text-emerald-700', icon: '✅' },
    import: { label: '规格导入', color: 'bg-orange-100 text-orange-700', icon: '📥' },
    export: { label: '数据导出', color: 'bg-slate-100 text-slate-700', icon: '📤' },
    other: { label: '其他', color: 'bg-gray-100 text-gray-700', icon: '📌' },
  }

  const fetchLogs = async (filter?: string) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    if (batchId && batchId !== 'undefined') params.set('batchId', batchId)
    if (filter && filter !== 'all') params.set('action', filter)
    const res = await fetch(`/api/logs?${params}`)
    const data = await res.json()
    setLogs(data.logs || [])
    setTotal(data.total || 0)
    setLoading(false)
  }

  useEffect(() => { fetchLogs() }, [batchId])

  const handleFilter = (action: string) => {
    setActionFilter(action)
    fetchLogs(action)
  }

  const handleClear = async () => {
    if (!confirm('确定清空日志？')) return
    const params = batchId ? `?batchId=${batchId}` : ''
    await fetch(`/api/logs${params}`, { method: 'DELETE' })
    fetchLogs(actionFilter)
    onRefresh()
  }

  // Group logs by date
  const groupedLogs = logs.reduce((acc, log) => {
    const date = new Date(log.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    if (!acc[date]) acc[date] = []
    acc[date].push(log)
    return acc
  }, {} as Record<string, typeof logs>)

  // Count by action type
  const actionCounts = logs.reduce((acc, log) => {
    acc[log.action] = (acc[log.action] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">更新日志</h2>
          <p className="text-xs text-muted-foreground">素材操作轨迹追踪 · 共 {total} 条记录</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fetchLogs(actionFilter)}>
            <RefreshCw className="h-3 w-3 mr-1" />刷新
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs text-red-500" onClick={handleClear}>
            <Trash2 className="h-3 w-3 mr-1" />清空
          </Button>
        </div>
      </div>

      {/* Filter by action type */}
      <div className="flex flex-wrap gap-1.5">
        <Badge
          variant={actionFilter === 'all' ? 'default' : 'outline'}
          className="text-xs cursor-pointer"
          onClick={() => handleFilter('all')}
        >
          全部 ({total})
        </Badge>
        {Object.entries(actionLabels)
          .filter(([key]) => actionCounts[key])
          .map(([key, cfg]) => (
            <Badge
              key={key}
              variant={actionFilter === key ? 'default' : 'outline'}
              className="text-xs cursor-pointer"
              onClick={() => handleFilter(key)}
            >
              {cfg.icon} {cfg.label} ({actionCounts[key] || 0})
            </Badge>
          ))}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <Card className="p-8 text-center">
          <ScrollText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">暂无操作日志</p>
          <p className="text-xs text-muted-foreground mt-1">开始使用系统后，操作记录会在这里显示</p>
        </Card>
      ) : (
        <div className="space-y-4 max-h-[calc(100vh-280px)] overflow-auto">
          {Object.entries(groupedLogs).map(([date, dateLogs]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px bg-border flex-1" />
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{date}</span>
                <div className="h-px bg-border flex-1" />
              </div>
              <div className="space-y-1.5 ml-1">
                {dateLogs.map(log => {
                  const cfg = actionLabels[log.action] || actionLabels.other
                  let metaInfo: Record<string, unknown> = {}
                  try { metaInfo = log.meta ? JSON.parse(log.meta) : {} } catch {}

                  return (
                    <div key={log.id} className="flex items-start gap-3 group hover:bg-muted/30 rounded-md px-2 py-1.5 -mx-2 transition-colors">
                      <div className="mt-1.5 shrink-0">
                        <div className="w-2 h-2 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </Badge>
                          {log.target && (
                            <span className="text-xs font-medium truncate max-w-60">{log.target}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{log.detail}</p>
                        {log.action === 'acceptance' && metaInfo && (
                          <div className="flex gap-3 mt-1">
                            <span className="text-[10px] text-emerald-600">通过 {metaInfo.pass}</span>
                            <span className="text-[10px] text-amber-600">警告 {metaInfo.normal}</span>
                            <span className="text-[10px] text-red-600">严重 {metaInfo.critical}</span>
                          </div>
                        )}
                        {log.action === 'task_batch' && metaInfo && (
                          <div className="mt-1">
                            <span className="text-[10px] text-purple-600">批量 {metaInfo.count} 个: {metaInfo.fromStatus} → {metaInfo.toStatus}</span>
                          </div>
                        )}
                        {log.action === 'batch_create' && metaInfo && (
                          <div className="flex gap-3 mt-1">
                            <span className="text-[10px] text-muted-foreground">任务 {metaInfo.taskCount}</span>
                            <span className="text-[10px] text-muted-foreground">渠道 {metaInfo.channelCount}</span>
                            <span className="text-[10px] text-muted-foreground">尺寸 {metaInfo.uniqueSizes}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {formatTime(log.createdAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ========== Categorize View ==========
function CategorizeView() {
  const [data, setData] = useState<CategorizeData | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'types' | 'sizes' | 'priority'>('overview')
  const [expandedType, setExpandedType] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/specs/categorize')
      const d = await res.json()
      if (!cancelled) setData(d)
    })()
    return () => { cancelled = true }
  }, [])

  if (!data) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>

  const { summary } = data

  return (
    <div className="p-4 space-y-4 max-w-7xl">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5" />智能归类
        </h2>
        <p className="text-xs text-muted-foreground">分析素材复用关系，帮你减少重复工作量</p>
      </div>

      {/* 工作量节省总览 */}
      <Card className="p-5 border-2 border-primary/20 bg-primary/[0.02]">
        <div className="text-center mb-4">
          <div className="text-4xl font-bold text-primary">{summary.savedPercent}%</div>
          <div className="text-sm text-muted-foreground mt-1">工作量可节省</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '素材规格总数', value: summary.totalSpecs, sub: `${summary.totalChannels}种类型` },
            { label: '实际需做素材', value: summary.uniqueAssets, sub: '去重后独立素材' },
            { label: '可复用素材', value: summary.reusableAssets, sub: '覆盖2+渠道' },
            { label: '减少重复', value: summary.savedWork, sub: '条规格可合并' },
          ].map(s => (
            <div key={s.label} className="text-center p-3 bg-card rounded-lg border">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              <div className="text-[10px] text-muted-foreground/70">{s.sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tab 切换 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="text-xs">按素材类型</TabsTrigger>
          <TabsTrigger value="sizes" className="text-xs">按共享尺寸</TabsTrigger>
          <TabsTrigger value="priority" className="text-xs">高优先必做</TabsTrigger>
          <TabsTrigger value="tip" className="text-xs">制作建议</TabsTrigger>
        </TabsList>

        {/* ========== 按素材类型归类 ========== */}
        <TabsContent value="overview" className="space-y-3 mt-3">
          <p className="text-xs text-muted-foreground">
            相同类型的素材，不同渠道只需要不同尺寸的变体。做一个「icon」可能只需要 5~6 种尺寸就能覆盖所有渠道。
          </p>
          <div className="max-h-[calc(100vh-380px)] overflow-y-auto space-y-2">
            {data.materialTypes.slice(0, 40).map(mt => (
              <Card key={mt.normalized} className="overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => setExpandedType(expandedType === mt.normalized ? null : mt.normalized)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="font-medium text-sm shrink-0">{mt.name}</div>
                    <div className="flex gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] px-1.5">{mt.totalSpecs}条</Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5">{mt.totalChannels}渠道</Badge>
                      <Badge className="text-[10px] px-1.5 bg-amber-100 text-amber-700 hover:bg-amber-100">{mt.uniqueSizes}种尺寸</Badge>
                    </div>
                  </div>
                  <ArrowRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expandedType === mt.normalized ? 'rotate-90' : ''}`} />
                </button>
                {expandedType === mt.normalized && (
                  <div className="border-t px-4 py-2 bg-muted/20">
                    <div className="text-[10px] text-muted-foreground mb-1.5">
                      ↓ 只需做 {mt.uniqueSizes} 个不同尺寸的变体，即可覆盖 {mt.totalSpecs} 条规格
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {mt.sizes.sort((a, b) => b.count - a.count).map((s, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-card border rounded px-2 py-1 text-[11px]">
                          <span className="font-mono text-muted-foreground">{s.w}x{s.h}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{s.format}</Badge>
                          <span className="text-muted-foreground">→ {s.channels.length}渠道</span>
                          <span className="font-medium text-primary">{s.count}条</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ========== 按共享尺寸归类 ========== */}
        <TabsContent value="sizes" className="space-y-3 mt-3">
          <p className="text-xs text-muted-foreground">
            同一尺寸可以被多种素材类型复用。做一个 512x512 的图，可以同时作为 icon、头像、小图用。
          </p>
          <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs h-8 w-28">尺寸</TableHead>
                  <TableHead className="text-xs h-8">可用的素材类型</TableHead>
                  <TableHead className="text-xs h-8 w-20 text-center">规格数</TableHead>
                  <TableHead className="text-xs h-8 w-20 text-center">渠道数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sharedSizes.map((s, i) => (
                  <TableRow key={i} className="text-xs">
                    <TableCell className="py-2 font-mono font-medium">{s.width}x{s.height}</TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {s.materialNames.slice(0, 8).map(n => (
                          <Badge key={n} variant="secondary" className="text-[10px] px-1.5">{n}</Badge>
                        ))}
                        {s.materialNames.length > 8 && (
                          <Badge variant="outline" className="text-[10px] px-1.5">+{s.materialNames.length - 8}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center font-medium">{s.totalSpecs}</TableCell>
                    <TableCell className="py-2 text-center">{s.channels.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ========== 高优先级必做 ========== */}
        <TabsContent value="priority" className="space-y-3 mt-3">
          <p className="text-xs text-muted-foreground">
            必做 + 覆盖多个渠道的素材，优先安排制作。做一个就能投多个渠道，性价比最高。
          </p>
          <div className="max-h-[calc(100vh-380px)] overflow-y-auto space-y-2">
            {data.highPriority.map((item, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{item.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{item.width}x{item.height}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5">{item.format}</Badge>
                      <Badge className="text-[10px] px-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">必做</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.channels.slice(0, 15).map(ch => (
                        <span key={ch} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{ch}</span>
                      ))}
                      {item.channels.length > 15 && (
                        <span className="text-[10px] text-muted-foreground">+{item.channels.length - 15}个渠道</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-primary">{item.channels.length}</div>
                    <div className="text-[10px] text-muted-foreground">个渠道</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ========== 制作建议 ========== */}
        <TabsContent value="tip" className="space-y-4 mt-3">
          <div className="space-y-3">
            <Card className="p-4 border-l-4 border-l-emerald-500">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-sm">核心建议：先做 icon</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                icon 是覆盖渠道最多、尺寸最标准化的素材类型。172 条 icon 规格只需要约 31 种尺寸变体。
                建议优先制作 512x512（覆盖62个渠道）和 200x200（覆盖31个渠道）这两个最通用的尺寸。
              </p>
            </Card>

            <Card className="p-4 border-l-4 border-l-amber-500">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-sm">五图/截图：统一为竖版</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                五图和截图类素材高度集中在 480x800 和 720x1280 两种竖版尺寸。
                建议以 720x1280 为主设计稿，等比缩放得到 480x800 版本，一次设计覆盖约 100+ 条规格。
              </p>
            </Card>

            <Card className="p-4 border-l-4 border-l-blue-500">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-sm">Banner：按尺寸分组批量做</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Banner 尺寸最分散（237种），但其中 1920x1080 和 1280x720 覆盖了最多渠道。
                建议先做这两个横版通用尺寸，再针对大渠道补充特殊尺寸。
              </p>
            </Card>

            <Card className="p-4 border-l-4 border-l-purple-500">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-purple-600" />
                <span className="font-medium text-sm">制作流程优化</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                推荐工作流：① 在「任务生成器」选择全部渠道生成任务清单 →
                ② 在「智能归类」查看哪些可以合并做 →
                ③ 设计时按「高优先必做」排序 →
                ④ 做好一个尺寸后直接导出多个渠道的文件名版本 →
                ⑤ 用「素材验收」批量检查
              </p>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-3 font-medium">快速参考：最通用的 10 个素材尺寸</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { size: '512x512', label: 'icon', ch: '62渠道' },
                  { size: '480x800', label: '五图', ch: '69渠道' },
                  { size: '200x200', label: '小icon', ch: '38渠道' },
                  { size: '720x1280', label: '竖版图', ch: '38渠道' },
                  { size: '1920x1080', label: '横版banner', ch: '31渠道' },
                  { size: '1280x720', label: '视频封面', ch: '19渠道' },
                  { size: '1024x1024', label: '大icon', ch: '20渠道' },
                  { size: '750x420', label: '详情头图', ch: '15渠道' },
                  { size: '1080x1920', label: '竖版大图', ch: '14渠道' },
                  { size: '750x1334', label: '竖版截图', ch: '12渠道' },
                ].map(item => (
                  <div key={item.size} className="bg-muted/50 rounded-lg p-2 text-center">
                    <div className="font-mono text-sm font-medium">{item.size}</div>
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                    <div className="text-[10px] text-primary font-medium">{item.ch}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ========== Helper Components ==========
function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    critical: { label: '严重', cls: 'bg-red-100 text-red-700 border-red-200' },
    normal: { label: '普通', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    ignore: { label: '可忽略', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  }
  const c = config[severity] || config.ignore
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${c.cls}`}>{c.label}</Badge>
}

function StatusBadge({ status, clickable, onClick }: { status: string; clickable?: boolean; onClick?: () => void }) {
  const config: Record<string, { label: string; cls: string; icon?: string }> = {
    '待制作': { label: '待制作', cls: 'bg-slate-100 text-slate-700' },
    '制作中': { label: '制作中', cls: 'bg-blue-100 text-blue-700' },
    '已完成': { label: '已完成', cls: 'bg-emerald-100 text-emerald-700' },
    '异常': { label: '异常', cls: 'bg-red-100 text-red-700' },
  }
  const c = config[status] || config['待制作']
  if (clickable && onClick) {
    return (
      <Badge
        className={`text-[10px] px-1.5 py-0 cursor-pointer hover:opacity-80 transition-opacity ${c.cls}`}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        title="点击切换状态"
      >
        {c.label}
      </Badge>
    )
  }
  return <Badge className={`text-[10px] px-1.5 py-0 ${c.cls}`}>{c.label}</Badge>
}

function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { cls: string }> = {
    '高': { cls: 'bg-red-100 text-red-700' },
    '普通': { cls: 'bg-slate-100 text-slate-600' },
    '低': { cls: 'bg-slate-50 text-slate-500' },
  }
  const c = config[priority] || config['普通']
  return <Badge className={`text-[10px] px-1.5 py-0 ${c.cls}`}>{priority}</Badge>
}

function AcceptanceItem({ result }: { result: AcceptanceResult }) {
  return (
    <div className="flex items-start justify-between text-xs border-b last:border-0 py-2 gap-2">
      <div className="min-w-0">
        <div className="font-mono truncate">{result.fileName}</div>
        <div className="text-muted-foreground mt-0.5">
          匹配: {result.specChannel} - {result.specName}
          {result.fileWidth && result.fileHeight && ` (${result.fileWidth}x${result.fileHeight} ${result.fileFormat || ''})`}
          {result.fileSize && ` | ${result.fileSize}KB`}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <SeverityBadge severity={result.severity} />
        <div className="text-[10px] text-muted-foreground mt-1 max-w-60">{result.message}</div>
      </div>
    </div>
  )
}
