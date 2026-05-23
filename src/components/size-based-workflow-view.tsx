'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Clock, Loader2,
  Layers, Zap, Target, Play, Search, Filter, BarChart3, Check, Copy,
  RotateCcw, Star, Sparkles, TrendingUp, Ruler, ImagePlus, Eye,
  ArrowRight, Package, XCircle, Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'

// ========== Types ==========
interface SizeSpec {
  id: string
  channel: string
  name: string
  isRequired: boolean
  priority: string
  maxSize: number
}

interface SizeGroupItem {
  key: string
  width: number
  height: number
  format: string
  specs: SizeSpec[]
  channels: string[]
  names: string[]
  taskCount: number
  requiredCount: number
  highPriorityCount: number
  categories: string[]
}

interface DimensionGroup {
  dimension: string
  width: number
  height: number
  formats: Array<{ format: string; key: string; channelCount: number; specCount: number }>
  totalChannels: string[]
  totalSpecCount: number
}

interface TaskProgress {
  total: number
  completed: number
  pending: number
  inProgress: number
}

interface SizeWorkflowData {
  summary: {
    totalSpecs: number
    totalChannels: number
    totalSizes: number
    sharedSizes: number
    uniqueSizes: number
    sharedSpecs: number
    workSavings: number
  }
  sizeGroups: SizeGroupItem[]
  dimensionGroups: DimensionGroup[]
  taskProgress: Record<string, TaskProgress>
}

// ========== Target Channel Configuration ==========
const TARGET_CHANNEL_GROUPS = [
  {
    name: '独立渠道',
    channels: [
      { main: '爱趣', aliases: [] },
      { main: '巴兔', aliases: [] },
      { main: '葫芦侠', aliases: [] },
      { main: '虫虫', aliases: [] },
      { main: '7723', aliases: [] },
      { main: '百分网', aliases: [] },
      { main: '咪噜游戏', aliases: ['咪噜/9917'] },
      { main: '3387游戏', aliases: ['3387'] },
      { main: '3733', aliases: [] },
      { main: '闪趣', aliases: [] },
      { main: '八门', aliases: ['八门神器'] },
      { main: '红果游戏', aliases: [] },
      { main: '9917', aliases: [] },
      { main: '277', aliases: [] },
      { main: 'u2game', aliases: [] },
      { main: '果盘', aliases: [] },
    ]
  },
  {
    name: '有关联渠道',
    channels: [
      { main: '触点（BTGO）', aliases: ['触点', 'BTGO', 'BTGO、速趣'] },
      { main: '335wan（赏金猎人）', aliases: ['335wan', '5144'] },
      { main: '3DMGame', aliases: ['3dm'] },
      { main: '朋克游戏', aliases: ['朋克'] },
      { main: '游戏友', aliases: [] },
      { main: '曼巴游戏（天宇游）', aliases: ['曼巴游戏', '天宇游'] },
      { main: '九一玩（司墨007手游）', aliases: ['九一玩', '司墨'] },
    ]
  },
  {
    name: '其他渠道',
    channels: [
      { main: '游戏Fan聚合(新)', aliases: ['游戏fan'] },
      { main: '紫霞游戏', aliases: ['紫霞'] },
      { main: 'st手游(瓜子)', aliases: ['瓜子'] },
      { main: '乐疯玩（乐疯玩网络）', aliases: ['乐疯玩'] },
      { main: '梨子手游', aliases: [] },
      { main: '3011游戏', aliases: [] },
      { main: '集悦科技(7K)', aliases: ['集悦'] },
      { main: '六方', aliases: [] },
      { main: '233乐园', aliases: ['233', '233手游'] },
      { main: '当乐', aliases: [] },
    ]
  }
]

const ALL_TARGET_NAMES = TARGET_CHANNEL_GROUPS.flatMap(g => g.channels.map(c => c.main))

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  '图标': 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400',
  '横幅': 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  '截图': 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400',
  '启动页': 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400',
  '其他': 'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-400',
}

// ========== Component ==========
export default function SizeBasedWorkflowView({
  onBatchChange,
  onRefresh,
}: {
  onBatchChange: (id: string) => void
  onRefresh: () => void
}) {
  const [data, setData] = useState<SizeWorkflowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<'overview' | 'produce' | 'deliver'>('overview')
  const [expandedSizes, setExpandedSizes] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [shareFilter, setShareFilter] = useState<'all' | 'shared' | 'unique'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [gameName, setGameName] = useState('')
  const [batchName, setBatchName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdBatchId, setCreatedBatchId] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<string>('')
  const { toast } = useToast()

  // Load size workflow data
  const loadData = useCallback(async (batchId?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        channels: ALL_TARGET_NAMES.join(','),
      })
      if (batchId) params.set('batchId', batchId)
      const res = await fetch(`/api/size-workflow?${params}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Failed to load size workflow:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Handle batch creation
  const handleCreateBatch = async () => {
    if (!gameName || !batchName) {
      toast({ title: '请填写游戏名称和批次名称', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName,
          batchName,
          channels: data?.sizeGroups.flatMap(sg => sg.channels) || [],
        }),
      })
      const batch = await res.json()
      if (batch.error) {
        toast({ title: '生成失败', description: batch.error, variant: 'destructive' })
        setCreating(false)
        return
      }
      setCreatedBatchId(batch.id)
      onBatchChange(batch.id)
      toast({
        title: '任务生成成功!',
        description: `批次「${gameName} - ${batchName}」已创建，共 ${batch.tasks?.length || 0} 个任务`,
      })
      // Reload data with the new batchId to get task progress
      await loadData(batch.id)
      setActiveView('produce')
    } catch {
      toast({ title: '请求失败', variant: 'destructive' })
    }
    setCreating(false)
  }

  // Handle size-level batch actions
  const handleSizeAction = async (sizeKey: string, action: 'complete' | 'start' | 'reset') => {
    if (!createdBatchId) return
    setActionLoading(sizeKey + action)
    try {
      const res = await fetch('/api/size-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: createdBatchId, sizeKey, action }),
      })
      const result = await res.json()
      if (result.error) {
        toast({ title: '操作失败', description: result.error, variant: 'destructive' })
      } else {
        toast({
          title: action === 'complete' ? '已完成' : action === 'start' ? '开始制作' : '已重置',
          description: result.message,
        })
        await loadData(createdBatchId)
      }
    } catch {
      toast({ title: '操作失败', variant: 'destructive' })
    }
    setActionLoading('')
  }

  // Toggle expanded size
  const toggleExpanded = (key: string) => {
    setExpandedSizes(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Filtered size groups
  const filteredSizeGroups = data?.sizeGroups.filter(sg => {
    if (categoryFilter !== 'all' && !sg.categories.includes(categoryFilter)) return false
    if (shareFilter === 'shared' && sg.channels.length <= 1) return false
    if (shareFilter === 'unique' && sg.channels.length > 1) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchChannel = sg.channels.some(ch => ch.toLowerCase().includes(q))
      const matchName = sg.names.some(n => n.toLowerCase().includes(q))
      const matchSize = sg.key.toLowerCase().includes(q)
      if (!matchChannel && !matchName && !matchSize) return false
    }
    return true
  }) || []

  // Compute progress stats from taskProgress
  const progressStats = (() => {
    if (!data?.taskProgress || !Object.keys(data.taskProgress).length) {
      return { total: 0, completed: 0, pending: 0, inProgress: 0, rate: 0, completedSizes: 0, totalSizes: 0 }
    }
    let total = 0, completed = 0, pending = 0, inProgress = 0
    let completedSizes = 0
    let totalSizes = Object.keys(data.taskProgress).length
    for (const [key, prog] of Object.entries(data.taskProgress)) {
      total += prog.total
      completed += prog.completed
      pending += prog.pending
      inProgress += prog.inProgress
      if (prog.completed === prog.total) completedSizes++
    }
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, pending, inProgress, rate, completedSizes, totalSizes }
  })()

  // Format file size
  const formatMaxSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '-'
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  // Copy size list
  const handleCopyList = () => {
    if (!data) return
    const text = data.sizeGroups.map((sg, i) => {
      const isShared = sg.channels.length > 1
      const status = data.taskProgress[sg.key]
        ? (status?.completed === status?.total ? '✅' : '⏳')
        : '📋'
      return `${i + 1}. ${status} ${sg.width}x${sg.height} ${sg.format} ${isShared ? `[${sg.channels.length}渠道共享]` : '[独立]'} → ${sg.channels.join(', ')}`
    }).join('\n')
    navigator.clipboard.writeText(`📏 尺寸工作流 - ${ALL_TARGET_NAMES.length}个渠道\n总计: ${data.summary.totalSizes} 个尺寸, ${data.summary.totalSpecs} 条规格\n\n${text}`)
    toast({ title: '已复制到剪贴板' })
  }

  // ========== Loading ==========
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <div>
            <h2 className="text-lg font-semibold">加载尺寸分析...</h2>
            <p className="text-sm text-muted-foreground">正在分析所有渠道的共享尺寸</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { summary } = data

  // ========== Render ==========
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-1">
            <Ruler className="h-5 w-5 text-primary mr-2" />
            <span className="font-bold text-sm">按尺寸生产</span>
            <span className="text-xs text-muted-foreground ml-2">
              {summary.totalSizes} 个尺寸 · 覆盖 {summary.totalSpecs} 条规格 · 节省 {summary.workSavings}% 工作量
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(['overview', 'produce', 'deliver'] as const).map((view, i) => {
              const labels = [
                { key: 'overview', label: '尺寸总览', icon: Layers },
                { key: 'produce', label: '按尺寸制作', icon: Target },
                { key: 'deliver', label: '渠道交付', icon: Package },
              ]
              const item = labels[i]
              return (
                <div key={view} className="flex items-center">
                  <button
                    onClick={() => setActiveView(view)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeView === view
                        ? 'bg-primary text-primary-foreground'
                        : createdBatchId && view === 'produce' || view === 'overview'
                        ? 'hover:bg-muted text-muted-foreground'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                  {i < 2 && <span className="mx-0.5 text-muted-foreground">›</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* ========== View 1: 尺寸总览 ========== */}
        {activeView === 'overview' && (
          <div className="p-4 space-y-4 max-w-7xl mx-auto">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">独立尺寸数</span>
                </div>
                <div className="text-2xl font-bold mt-1">{summary.totalSizes}</div>
                <div className="text-[10px] text-muted-foreground">只需做这么多次</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-muted-foreground">共享尺寸</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-amber-600">{summary.sharedSizes}</div>
                <div className="text-[10px] text-muted-foreground">做一次覆盖多渠道</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-violet-600" />
                  <span className="text-xs text-muted-foreground">独立尺寸</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-violet-600">{summary.uniqueSizes}</div>
                <div className="text-[10px] text-muted-foreground">仅1个渠道使用</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-muted-foreground">工作量节省</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-emerald-600">{summary.workSavings}%</div>
                <div className="text-[10px] text-muted-foreground">{summary.totalSpecs}条规格 → {summary.totalSizes}次制作</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-muted-foreground">覆盖渠道</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-blue-600">{summary.totalChannels}</div>
                <div className="text-[10px] text-muted-foreground">目标渠道总数</div>
              </Card>
            </div>

            {/* Size Category Distribution */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">尺寸分类分布</CardTitle>
                <CardDescription className="text-xs">按素材类型归类，便于分批制作</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {(() => {
                  const categories = new Map<string, { count: number; specs: number; channels: Set<string> }>()
                  for (const sg of data.sizeGroups) {
                    for (const cat of sg.categories) {
                      if (!categories.has(cat)) {
                        categories.set(cat, { count: 0, specs: 0, channels: new Set() })
                      }
                      const c = categories.get(cat)!
                      c.count++
                      c.specs += sg.taskCount
                      sg.channels.forEach(ch => c.channels.add(ch))
                    }
                  }
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {[...categories.entries()].map(([cat, info]) => (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                          className={`p-3 rounded-lg border text-center transition-colors ${
                            categoryFilter === cat
                              ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                              : 'border-muted hover:border-primary/30'
                          }`}
                        >
                          <Badge className={`text-[9px] mb-1 ${CATEGORY_COLORS[cat] || CATEGORY_COLORS['其他']}`}>
                            {cat}
                          </Badge>
                          <div className="text-lg font-bold">{info.count}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {info.specs} 条规格 · {info.channels.size} 渠道
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>

            {/* Top Shared Sizes - The Key Insight */}
            <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-sm">核心共享尺寸 TOP 10</CardTitle>
                    <CardDescription className="text-xs">制作这些尺寸，覆盖最多渠道</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleCopyList}>
                    <Copy className="h-3 w-3 mr-1" />复制清单
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-1.5">
                  {data.sizeGroups
                    .filter(sg => sg.channels.length > 1)
                    .slice(0, 10)
                    .map((sg, idx) => (
                    <div
                      key={sg.key}
                      className="flex items-center gap-2 text-xs p-2.5 rounded-md bg-white/60 dark:bg-black/20 border border-amber-200/50 dark:border-amber-800/50"
                    >
                      <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${CATEGORY_COLORS[sg.categories[0]] || CATEGORY_COLORS['其他']}`}>
                        {sg.categories[0]}
                      </Badge>
                      <span className="font-mono font-bold shrink-0 min-w-[80px]">{sg.width}x{sg.height}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">{sg.format}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-amber-700 dark:text-amber-400">
                          {sg.channels.length} 渠道共享
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {sg.channels.slice(0, 5).join(', ')}{sg.channels.length > 5 ? ` 等${sg.channels.length}个` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium">{sg.taskCount} 条规格</div>
                        {sg.requiredCount > 0 && (
                          <div className="text-[10px] text-red-500">必填 {sg.requiredCount}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Full Size List with filters */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">全部尺寸列表</CardTitle>
                    <CardDescription className="text-xs">
                      {filteredSizeGroups.length} / {data.sizeGroups.length} 个尺寸
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-7 text-xs pl-7 w-36"
                        placeholder="搜索尺寸/渠道..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Select value={shareFilter} onValueChange={(v) => setShareFilter(v as typeof shareFilter)}>
                      <SelectTrigger className="h-7 text-xs w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="shared">共享</SelectItem>
                        <SelectItem value="unique">独立</SelectItem>
                      </SelectContent>
                    </Select>
                    {categoryFilter !== 'all' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] h-7 px-2"
                        onClick={() => setCategoryFilter('all')}
                      >
                        清除筛选
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="max-h-[60vh] overflow-y-auto space-y-1">
                  {filteredSizeGroups.map(sg => {
                    const isShared = sg.channels.length > 1
                    const isExpanded = expandedSizes.has(sg.key)
                    const progress = data.taskProgress[sg.key]
                    const isComplete = progress && progress.completed === progress.total

                    return (
                      <div key={sg.key} className={`rounded-lg border transition-colors ${
                        isComplete
                          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                          : isShared
                          ? 'border-amber-200 bg-amber-50/30 dark:border-amber-800/50 dark:bg-amber-950/10'
                          : 'border-muted bg-card'
                      }`}>
                        {/* Size Header */}
                        <div
                          className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-muted/30"
                          onClick={() => toggleExpanded(sg.key)}
                        >
                          {isComplete ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : isShared ? (
                            <Star className="h-4 w-4 text-amber-500 shrink-0" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                          )}
                          <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${CATEGORY_COLORS[sg.categories[0]] || CATEGORY_COLORS['其他']}`}>
                            {sg.categories[0]}
                          </Badge>
                          <span className="font-mono font-bold text-sm shrink-0">{sg.width}x{sg.height}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">{sg.format}</Badge>
                          {isShared && (
                            <Badge className="text-[9px] px-1.5 py-0 shrink-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
                              {sg.channels.length} 渠道共享
                            </Badge>
                          )}
                          <span className="flex-1 text-xs text-muted-foreground truncate">
                            {sg.names.slice(0, 3).join(' / ')}{sg.names.length > 3 ? ` +${sg.names.length - 3}` : ''}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {progress && (
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <Progress value={progress.total > 0 ? (progress.completed / progress.total) * 100 : 0} className="h-1.5 w-16" />
                                <span className="text-muted-foreground">{progress.completed}/{progress.total}</span>
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground w-8 text-right">{sg.taskCount}条</span>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t border-muted/50">
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                              {/* Channel list */}
                              <div>
                                <div className="text-[10px] font-medium text-muted-foreground mb-1.5">需要此尺寸的渠道 ({sg.channels.length})</div>
                                <div className="flex flex-wrap gap-1">
                                  {sg.channels.map(ch => (
                                    <Badge key={ch} variant="secondary" className="text-[9px] px-1.5 py-0">
                                      {ch}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {/* Spec details */}
                              <div>
                                <div className="text-[10px] font-medium text-muted-foreground mb-1.5">规格明细 ({sg.specs.length})</div>
                                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                  {sg.specs.map(spec => (
                                    <div key={spec.id} className="flex items-center gap-1.5 text-[10px]">
                                      {spec.isRequired && <span className="text-red-500">*</span>}
                                      <span className="font-medium">{spec.channel}</span>
                                      <span className="text-muted-foreground">-</span>
                                      <span>{spec.name}</span>
                                      {spec.priority === '高' && (
                                        <Badge className="text-[8px] px-1 py-0 bg-red-100 text-red-700">高优</Badge>
                                      )}
                                      {spec.maxSize > 0 && (
                                        <span className="text-muted-foreground">≤{formatMaxSize(spec.maxSize)}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Action: Create batch to start producing */}
            {!createdBatchId && (
              <Card className="border-primary/30">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    开始按尺寸制作
                  </CardTitle>
                  <CardDescription className="text-xs">
                    创建一个批次任务，然后按尺寸逐个制作，一键完成同尺寸的所有渠道任务
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">游戏名称 *</Label>
                      <Input
                        className="h-9"
                        placeholder="例: 仙剑奇侠传"
                        value={gameName}
                        onChange={e => setGameName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">批次名称 *</Label>
                      <Input
                        className="h-9"
                        placeholder="例: 第一批全渠道素材"
                        value={batchName}
                        onChange={e => setBatchName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      将为 {summary.totalChannels} 个渠道生成 {summary.totalSpecs} 个任务（{summary.totalSizes} 个独立尺寸）
                    </div>
                    <Button
                      size="sm"
                      onClick={handleCreateBatch}
                      disabled={creating || !gameName || !batchName}
                    >
                      {creating ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-1" />
                      )}
                      {creating ? '生成中...' : '创建批次并开始制作'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ========== View 2: 按尺寸制作 ========== */}
        {activeView === 'produce' && (
          <div className="p-4 space-y-4 max-w-7xl mx-auto">
            {/* Progress Overview */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">总尺寸</span>
                </div>
                <div className="text-2xl font-bold mt-1">{progressStats.totalSizes}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-muted-foreground">已完成</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-emerald-600">{progressStats.completedSizes}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-muted-foreground">制作中</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-blue-600">{progressStats.inProgress}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-muted-foreground">待制作</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-amber-600">{progressStats.pending}</div>
              </Card>
              <Card className="p-3 col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">总体进度</span>
                  <span className="text-sm font-bold">{progressStats.rate}%</span>
                </div>
                <Progress value={progressStats.rate} className="h-2" />
                <div className="text-[10px] text-muted-foreground mt-1">
                  {progressStats.completed} / {progressStats.total} 个任务已完成
                </div>
              </Card>
            </div>

            {/* No batch created yet */}
            {!createdBatchId && (
              <Card className="p-6 text-center">
                <div className="space-y-3">
                  <Zap className="h-10 w-10 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold">请先创建批次</h3>
                    <p className="text-xs text-muted-foreground mt-1">在「尺寸总览」中创建批次后，即可在此按尺寸制作</p>
                  </div>
                  <Button size="sm" onClick={() => setActiveView('overview')}>
                    <ArrowRight className="h-4 w-4 mr-1" />前往尺寸总览
                  </Button>
                </div>
              </Card>
            )}

            {/* Size Production Cards */}
            {createdBatchId && (
              <>
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[180px] max-w-xs">
                    <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-8 text-xs pl-7"
                      placeholder="搜索尺寸或渠道..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-8 text-xs w-28">
                      <SelectValue placeholder="类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      <SelectItem value="图标">图标</SelectItem>
                      <SelectItem value="横幅">横幅</SelectItem>
                      <SelectItem value="截图">截图</SelectItem>
                      <SelectItem value="启动页">启动页</SelectItem>
                      <SelectItem value="其他">其他</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={shareFilter} onValueChange={(v) => setShareFilter(v as typeof shareFilter)}>
                    <SelectTrigger className="h-8 text-xs w-24">
                      <SelectValue placeholder="共享" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="shared">共享</SelectItem>
                      <SelectItem value="unique">独立</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="text-xs h-8" onClick={handleCopyList}>
                    <Copy className="h-3 w-3 mr-1" />复制
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => loadData(createdBatchId)}>
                    <RotateCcw className="h-3 w-3 mr-1" />刷新
                  </Button>
                </div>

                {/* Production List - grouped by priority */}
                {(() => {
                  // Separate into: in-progress, shared (pending), unique (pending), completed
                  const inProgressSizes = filteredSizeGroups.filter(sg => {
                    const p = data.taskProgress[sg.key]
                    return p && p.inProgress > 0 && p.completed < p.total
                  })
                  const sharedPendingSizes = filteredSizeGroups.filter(sg => {
                    const p = data.taskProgress[sg.key]
                    return sg.channels.length > 1 && (!p || (p.pending > 0 && p.completed < p.total && p.inProgress === 0))
                  })
                  const uniquePendingSizes = filteredSizeGroups.filter(sg => {
                    const p = data.taskProgress[sg.key]
                    return sg.channels.length === 1 && (!p || (p.pending > 0 && p.completed < p.total && p.inProgress === 0))
                  })
                  const completedSizes = filteredSizeGroups.filter(sg => {
                    const p = data.taskProgress[sg.key]
                    return p && p.completed === p.total
                  })

                  const sections = [
                    { title: '制作中', items: inProgressSizes, color: 'blue', icon: Clock },
                    { title: '共享尺寸 · 优先制作', items: sharedPendingSizes, color: 'amber', icon: Star },
                    { title: '独立尺寸', items: uniquePendingSizes, color: 'violet', icon: Target },
                    { title: '已完成', items: completedSizes, color: 'emerald', icon: CheckCircle2 },
                  ]

                  return sections.map(section => section.items.length > 0 ? (
                    <div key={section.title}>
                      <div className="flex items-center gap-2 mb-2">
                        <section.icon className={`h-4 w-4 text-${section.color}-600`} />
                        <span className="text-sm font-medium">{section.title}</span>
                        <Badge variant="secondary" className="text-[10px]">{section.items.length}</Badge>
                        <Separator className="flex-1" />
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-4">
                        {section.items.map(sg => {
                          const progress = data.taskProgress[sg.key]
                          const isComplete = progress && progress.completed === progress.total
                          const isExpanded = expandedSizes.has(sg.key)
                          const isShared = sg.channels.length > 1
                          const isLoading = actionLoading === sg.key + 'complete' || actionLoading === sg.key + 'start'

                          return (
                            <Card key={sg.key} className={`overflow-hidden ${
                              isComplete ? 'border-emerald-300 dark:border-emerald-700' :
                              isShared ? 'border-amber-200 dark:border-amber-800' : ''
                            }`}>
                              <div className="p-3">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    {isComplete ? (
                                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                    ) : isShared ? (
                                      <Star className="h-5 w-5 text-amber-500" />
                                    ) : (
                                      <Target className="h-5 w-5 text-violet-500" />
                                    )}
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-sm">{sg.width}x{sg.height}</span>
                                        <Badge variant="outline" className="text-[9px] px-1 py-0">{sg.format}</Badge>
                                        <Badge className={`text-[9px] px-1.5 py-0 ${CATEGORY_COLORS[sg.categories[0]] || CATEGORY_COLORS['其他']}`}>
                                          {sg.categories[0]}
                                        </Badge>
                                      </div>
                                      <div className="text-[10px] text-muted-foreground mt-0.5">
                                        {sg.names.slice(0, 2).join(' / ')}{sg.names.length > 2 ? ` +${sg.names.length - 2}` : ''}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {!isComplete && createdBatchId && (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-[10px] h-7 px-2"
                                          onClick={() => handleSizeAction(sg.key, 'start')}
                                          disabled={isLoading}
                                        >
                                          {isLoading && actionLoading === sg.key + 'start' ? (
                                            <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                                          ) : (
                                            <Clock className="h-3 w-3 mr-0.5" />
                                          )}
                                          开始
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="text-[10px] h-7 px-2"
                                          onClick={() => handleSizeAction(sg.key, 'complete')}
                                          disabled={isLoading}
                                        >
                                          {isLoading && actionLoading === sg.key + 'complete' ? (
                                            <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                                          ) : (
                                            <Check className="h-3 w-3 mr-0.5" />
                                          )}
                                          完成此尺寸
                                        </Button>
                                      </>
                                    )}
                                    {isComplete && createdBatchId && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-[10px] h-7 px-2"
                                        onClick={() => handleSizeAction(sg.key, 'reset')}
                                        disabled={isLoading}
                                      >
                                        <RotateCcw className="h-3 w-3 mr-0.5" />
                                        重置
                                      </Button>
                                    )}
                                    <button onClick={() => toggleExpanded(sg.key)} className="p-0.5">
                                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                </div>

                                {/* Progress */}
                                {progress && (
                                  <div className="mb-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] text-muted-foreground">
                                        {isComplete ? '已完成' : `${progress.completed}/${progress.total} 已完成`}
                                      </span>
                                      <span className="text-[10px] font-medium">
                                        {progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}%
                                      </span>
                                    </div>
                                    <Progress
                                      value={progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}
                                      className={`h-1.5 ${isComplete ? '[&>div]:bg-emerald-500' : ''}`}
                                    />
                                  </div>
                                )}

                                {/* Channel Coverage */}
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="text-muted-foreground">覆盖渠道:</span>
                                  <div className="flex flex-wrap gap-0.5">
                                    {sg.channels.slice(0, isExpanded ? sg.channels.length : 8).map(ch => (
                                      <Badge key={ch} variant="secondary" className="text-[8px] px-1 py-0">
                                        {ch}
                                      </Badge>
                                    ))}
                                    {!isExpanded && sg.channels.length > 8 && (
                                      <Badge variant="secondary" className="text-[8px] px-1 py-0">
                                        +{sg.channels.length - 8}
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                {/* Expanded: spec details */}
                                {isExpanded && (
                                  <div className="mt-2 pt-2 border-t border-muted/50">
                                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                                      {sg.specs.map(spec => (
                                        <div key={spec.id} className="flex items-center gap-1.5 text-[10px]">
                                          {spec.isRequired && <span className="text-red-500 font-bold">*</span>}
                                          <span className="font-medium min-w-[60px]">{spec.channel}</span>
                                          <span className="text-muted-foreground">—</span>
                                          <span className="flex-1 truncate">{spec.name}</span>
                                          {spec.priority === '高' && (
                                            <Badge className="text-[8px] px-1 py-0 bg-red-100 text-red-700">高优</Badge>
                                          )}
                                          {spec.maxSize > 0 && (
                                            <span className="text-muted-foreground shrink-0">≤{formatMaxSize(spec.maxSize)}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </Card>
                          )
                        })}
                      </div>
                    </div>
                  ) : null)
                })()}
              </>
            )}
          </div>
        )}

        {/* ========== View 3: 渠道交付 ========== */}
        {activeView === 'deliver' && (
          <div className="p-4 space-y-4 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">渠道交付总览</h2>
                <p className="text-xs text-muted-foreground">
                  按渠道查看制作进度，确认每个渠道是否可以交付
                </p>
              </div>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => createdBatchId && loadData(createdBatchId)}>
                <RotateCcw className="h-3 w-3 mr-1" />刷新
              </Button>
            </div>

            {!createdBatchId ? (
              <Card className="p-6 text-center">
                <div className="space-y-3">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold">请先创建批次</h3>
                    <p className="text-xs text-muted-foreground mt-1">在「尺寸总览」中创建批次后，即可查看交付进度</p>
                  </div>
                  <Button size="sm" onClick={() => setActiveView('overview')}>
                    <ArrowRight className="h-4 w-4 mr-1" />前往尺寸总览
                  </Button>
                </div>
              </Card>
            ) : (
              (() => {
                // Build per-channel progress from sizeGroups + taskProgress
                const channelProgress = new Map<string, {
                  channel: string
                  total: number
                  completed: number
                  pending: number
                  inProgress: number
                  sizes: Array<{ key: string; width: number; height: number; format: string; status: string }>
                }>()

                for (const sg of data.sizeGroups) {
                  const progress = data.taskProgress[sg.key]
                  for (const spec of sg.specs) {
                    if (!channelProgress.has(spec.channel)) {
                      channelProgress.set(spec.channel, {
                        channel: spec.channel,
                        total: 0,
                        completed: 0,
                        pending: 0,
                        inProgress: 0,
                        sizes: [],
                      })
                    }
                    const cp = channelProgress.get(spec.channel)!
                    cp.total++
                    // Determine status from taskProgress
                    if (progress) {
                      if (progress.completed === progress.total) {
                        cp.completed++
                        cp.sizes.push({
                          key: sg.key,
                          width: sg.width,
                          height: sg.height,
                          format: sg.format,
                          status: '已完成',
                        })
                      } else if (progress.inProgress > 0) {
                        cp.inProgress++
                        cp.sizes.push({
                          key: sg.key,
                          width: sg.width,
                          height: sg.height,
                          format: sg.format,
                          status: '制作中',
                        })
                      } else {
                        cp.pending++
                        cp.sizes.push({
                          key: sg.key,
                          width: sg.width,
                          height: sg.height,
                          format: sg.format,
                          status: '待制作',
                        })
                      }
                    } else {
                      cp.pending++
                      cp.sizes.push({
                        key: sg.key,
                        width: sg.width,
                        height: sg.height,
                        format: sg.format,
                        status: '待制作',
                      })
                    }
                  }
                }

                const channels = [...channelProgress.values()].sort((a, b) => {
                  const rateA = a.total > 0 ? a.completed / a.total : 0
                  const rateB = b.total > 0 ? b.completed / b.total : 0
                  if (rateA !== rateB) return rateA - rateB // incomplete first
                  return b.total - a.total
                })

                const totalCompleted = channels.filter(c => c.completed === c.total).length

                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <Card className="p-3">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          <span className="text-xs text-muted-foreground">渠道总数</span>
                        </div>
                        <div className="text-2xl font-bold mt-1">{channels.length}</div>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="text-xs text-muted-foreground">可交付</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-emerald-600">{totalCompleted}</div>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <span className="text-xs text-muted-foreground">待完成</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-amber-600">{channels.length - totalCompleted}</div>
                      </Card>
                    </div>

                    <div className="space-y-2">
                      {channels.map(cp => {
                        const rate = cp.total > 0 ? Math.round((cp.completed / cp.total) * 100) : 0
                        const isComplete = rate === 100
                        const expanded = expandedSizes.has(`ch_${cp.channel}`)

                        return (
                          <Card key={cp.channel} className={isComplete ? 'border-emerald-200 dark:border-emerald-800' : ''}>
                            <div
                              className="p-3 cursor-pointer"
                              onClick={() => toggleExpanded(`ch_${cp.channel}`)}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {isComplete ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                  ) : (
                                    <div className="h-5 w-5 rounded-full border-2 border-amber-400 flex items-center justify-center text-[8px] font-bold text-amber-600">
                                      {rate}%
                                    </div>
                                  )}
                                  <span className="font-medium text-sm">{cp.channel}</span>
                                  {isComplete && (
                                    <Badge className="text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                      可交付
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {cp.completed}/{cp.total} 已完成
                                  </span>
                                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </div>
                              </div>
                              <Progress
                                value={rate}
                                className={`h-1.5 ${isComplete ? '[&>div]:bg-emerald-500' : ''}`}
                              />
                            </div>
                            {expanded && (
                              <div className="px-3 pb-3 border-t border-muted/50 pt-2">
                                <div className="space-y-1">
                                  {cp.sizes.map(s => (
                                    <div key={s.key} className="flex items-center gap-2 text-[10px]">
                                      {s.status === '已完成' ? (
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                      ) : s.status === '制作中' ? (
                                        <Clock className="h-3 w-3 text-blue-600" />
                                      ) : (
                                        <XCircle className="h-3 w-3 text-muted-foreground" />
                                      )}
                                      <span className="font-mono font-medium">{s.width}x{s.height}</span>
                                      <Badge variant="outline" className="text-[8px] px-1 py-0">{s.format}</Badge>
                                      <span className="text-muted-foreground">{s.status}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </Card>
                        )
                      })}
                    </div>
                  </>
                )
              })()
            )}
          </div>
        )}
      </div>
    </div>
  )
}
