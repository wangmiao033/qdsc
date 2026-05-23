'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, Clock, Loader2,
  Plus, ArrowRight, Layers, Zap, Target, Database, Package, Play,
  Search, Filter, BarChart3, Check, Copy, Download, XCircle, Info,
  Upload, RotateCcw, Eye, Star
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
import { useToast } from '@/hooks/use-toast'

// ========== Types ==========
interface ChannelData {
  channel: string
  specCount: number
  types: string[]
  requiredCount: number
  highPriorityCount: number
  specs: Array<{
    id: string
    name: string
    width: number
    height: number
    format: string
    isRequired: boolean
    priority: string
    maxSize: number
  }>
}

interface SizeGroup {
  key: string
  width: number
  height: number
  format: string
  channels: string[]
  names: string[]
  taskCount: number
  requiredCount: number
}

interface BoardData {
  summary: {
    totalSpecs: number
    totalChannels: number
    totalRequired: number
    totalSizes: number
    sharedSizes: number
    uniqueSizes: number
  }
  channels: ChannelData[]
  sizeGroups: SizeGroup[]
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

// ========== Target Channel Configuration ==========
const TARGET_CHANNEL_GROUPS = [
  {
    name: '独立渠道',
    description: '规格独立的渠道，素材不可复用',
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
    description: '渠道之间存在关联关系，部分规格可能复用',
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
    description: '剩余需制作的渠道',
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

// Resolve all DB channel names for a target channel
function resolveDbChannels(main: string, aliases: string[], dbChannels: string[]): string[] {
  const result = new Set<string>()
  for (const ch of dbChannels) {
    if (ch === main || aliases.includes(ch)) {
      result.add(ch)
    }
    // Also match if DB channel includes main or aliases
    if (ch.includes(main) || main.includes(ch)) {
      result.add(ch)
    }
    for (const alias of aliases) {
      if (ch.includes(alias) || alias.includes(ch)) {
        result.add(ch)
      }
    }
  }
  // Always include the main name itself if it exists in DB
  if (dbChannels.includes(main)) result.add(main)
  return [...result]
}

// ========== Production Board Component ==========
export default function ProductionBoardView({
  onBatchChange,
  onRefresh
}: {
  onBatchChange: (id: string) => void
  onRefresh: () => void
}) {
  const [step, setStep] = useState(1) // 1=渠道准备, 2=快速建任务, 3=制作看板, 4=交付总览
  const [boardData, setBoardData] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [gameName, setGameName] = useState('')
  const [batchName, setBatchName] = useState('')
  const [selectedDbChannels, setSelectedDbChannels] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createdBatchId, setCreatedBatchId] = useState<string>('')
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'byChannel' | 'bySize'>('bySize')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  // Load board data
  const loadBoardData = useCallback(async () => {
    setLoading(true)
    try {
      // Get all target channel main names
      const allTargetNames = TARGET_CHANNEL_GROUPS.flatMap(g => g.channels.map(c => c.main))
      const res = await fetch(`/api/production-board?channels=${encodeURIComponent(allTargetNames.join(','))}`)
      const data = await res.json()
      setBoardData(data)

      // Auto-select all channels that have specs
      const channelsWithSpecs = new Set(data.channels.map((c: ChannelData) => c.channel))
      const autoSelected = TARGET_CHANNEL_GROUPS.flatMap(g =>
        g.channels.flatMap(c => resolveDbChannels(c.main, c.aliases, [...channelsWithSpecs]))
      )
      setSelectedDbChannels([...new Set(autoSelected)])
    } catch (err) {
      console.error('Failed to load board data:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadBoardData() }, [loadBoardData])

  // Load tasks when step 3 or 4
  useEffect(() => {
    if (!createdBatchId) return
    if (step < 3) return
    const loadTasks = async () => {
      setTasksLoading(true)
      const res = await fetch(`/api/tasks?batchId=${createdBatchId}`)
      const data = await res.json()
      setTasks(data)
      setTasksLoading(false)
    }
    loadTasks()
  }, [createdBatchId, step])

  // Compute target channel status (which have specs in DB)
  const targetChannelStatus = (() => {
    if (!boardData) return []
    const dbChannelSet = new Set(boardData.channels.map(c => c.channel))

    return TARGET_CHANNEL_GROUPS.map(group => ({
      ...group,
      channels: group.channels.map(ch => {
        const dbChannels = resolveDbChannels(ch.main, ch.aliases, [...dbChannelSet])
        const totalSpecCount = dbChannels.reduce((sum, dc) => {
          const found = boardData.channels.find(c => c.channel === dc)
          return sum + (found?.specCount || 0)
        }, 0)
        const totalTypes = [...new Set(dbChannels.flatMap(dc => {
          const found = boardData.channels.find(c => c.channel === dc)
          return found?.types || []
        }))]
        const hasSpecs = totalSpecCount > 0
        return {
          ...ch,
          dbChannels,
          hasSpecs,
          specCount: totalSpecCount,
          types: totalTypes,
        }
      })
    }))
  })()

  // Count ready channels
  const readyCount = targetChannelStatus.reduce((sum, g) =>
    sum + g.channels.filter(c => c.hasSpecs).length, 0)
  const totalCount = targetChannelStatus.reduce((sum, g) => sum + g.channels.length, 0)

  // Task generation preview
  const previewTaskCount = boardData
    ? boardData.channels
        .filter(c => selectedDbChannels.includes(c.channel))
        .reduce((sum, c) => sum + c.specCount, 0)
    : 0

  // Handle task creation
  const handleCreateBatch = async () => {
    if (!gameName || !batchName) {
      toast({ title: '请填写游戏名称和批次名称', variant: 'destructive' })
      return
    }
    if (selectedDbChannels.length === 0) {
      toast({ title: '请至少选择一个渠道', variant: 'destructive' })
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
          channels: selectedDbChannels,
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
      setStep(3) // Move to production board
    } catch {
      toast({ title: '请求失败', variant: 'destructive' })
    }
    setCreating(false)
  }

  // Handle task status change
  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status: newStatus }),
    })
    // Reload tasks
    const res = await fetch(`/api/tasks?batchId=${createdBatchId}`)
    const data = await res.json()
    setTasks(data)
  }

  // Batch status update
  const handleBatchStatusUpdate = async (taskIds: string[], newStatus: string) => {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds, status: newStatus }),
    })
    const res = await fetch(`/api/tasks?batchId=${createdBatchId}`)
    const data = await res.json()
    setTasks(data)
  }

  // Copy task list
  const handleCopyList = () => {
    const text = tasks.map((t, i) =>
      `${i + 1}. [${t.status}] ${t.specChannel} - ${t.specName} (${t.specWidth}x${t.specHeight} ${t.specFormat})`
    ).join('\n')
    navigator.clipboard.writeText(`📋 ${gameName} - ${batchName}\n总计: ${tasks.length} 项\n\n${text}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Filtered tasks
  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (channelFilter !== 'all' && t.specChannel !== channelFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!t.specChannel.toLowerCase().includes(q) &&
          !t.specName.toLowerCase().includes(q) &&
          !t.suggestedFileName.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Task stats
  const taskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === '待制作').length,
    inProgress: tasks.filter(t => t.status === '制作中').length,
    completed: tasks.filter(t => t.status === '已完成').length,
    error: tasks.filter(t => t.status === '异常').length,
  }
  const completionRate = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0

  // Group tasks by size
  const tasksBySize = (() => {
    const groups = new Map<string, TaskItem[]>()
    for (const t of filteredTasks) {
      const key = `${t.specWidth}x${t.specHeight}_${t.specFormat}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(t)
    }
    return [...groups.entries()]
      .map(([key, items]) => ({
        key,
        width: items[0].specWidth,
        height: items[0].specHeight,
        format: items[0].specFormat,
        tasks: items.sort((a, b) => a.specChannel.localeCompare(b.specChannel)),
        completed: items.filter(t => t.status === '已完成').length,
      }))
      .sort((a, b) => {
        // Shared sizes first
        if (b.tasks.length !== a.tasks.length) return b.tasks.length - a.tasks.length
        return (b.width * b.height) - (a.width * a.height)
      })
  })()

  // Group tasks by channel
  const tasksByChannel = (() => {
    const groups = new Map<string, TaskItem[]>()
    for (const t of filteredTasks) {
      if (!groups.has(t.specChannel)) groups.set(t.specChannel, [])
      groups.get(t.specChannel)!.push(t)
    }
    return [...groups.entries()]
      .map(([channel, items]) => ({
        channel,
        tasks: items,
        completed: items.filter(t => t.status === '已完成').length,
        pending: items.filter(t => t.status === '待制作').length,
        inProgress: items.filter(t => t.status === '制作中').length,
        error: items.filter(t => t.status === '异常').length,
      }))
      .sort((a, b) => b.tasks.length - a.tasks.length)
  })()

  // Delivery summary
  const deliverySummary = (() => {
    return tasksByChannel.map(ch => {
      const rate = ch.tasks.length > 0 ? Math.round((ch.completed / ch.tasks.length) * 100) : 0
      const missingRequired = ch.tasks.filter(t => t.specIsRequired && t.status !== '已完成')
      return {
        ...ch,
        rate,
        missingRequired,
        isComplete: rate === 100,
        hasIssues: ch.error > 0 || missingRequired.length > 0,
      }
    }).sort((a, b) => {
      // Completed first, then by progress
      if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1
      return a.rate - b.rate
    })
  })()

  // ========== Render Steps ==========
  const steps = [
    { num: 1, label: '渠道准备', icon: Database },
    { num: 2, label: '快速建任务', icon: Zap },
    { num: 3, label: '制作看板', icon: Target },
    { num: 4, label: '交付总览', icon: Package },
  ]

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <div>
            <h2 className="text-lg font-semibold">加载生产看板...</h2>
            <p className="text-sm text-muted-foreground">正在分析渠道规格数据</p>
          </div>
        </div>
      </div>
    )
  }

  if (!boardData) return null

  return (
    <div className="h-full flex flex-col">
      {/* Step Navigation */}
      <div className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-1">
            <BarChart3 className="h-5 w-5 text-primary mr-2" />
            <span className="font-bold text-sm">生产看板</span>
            <span className="text-xs text-muted-foreground ml-2">
              {totalCount} 个目标渠道 · {boardData.summary.totalSpecs} 条规格
            </span>
          </div>
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <button
                  onClick={() => {
                    if (s.num <= 2 || createdBatchId) setStep(s.num)
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    step === s.num
                      ? 'bg-primary text-primary-foreground'
                      : step > s.num
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  }`}
                >
                  {step > s.num ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <s.icon className="h-3.5 w-3.5" />
                  )}
                  {s.label}
                </button>
                {i < steps.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mx-0.5" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto">
        {/* ========== Step 1: 渠道准备 ========== */}
        {step === 1 && (
          <div className="p-4 space-y-4 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">渠道准备</h2>
                <p className="text-xs text-muted-foreground">
                  检查目标渠道的规格数据是否就绪，{readyCount}/{totalCount} 个渠道已有规格
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadBoardData}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />刷新
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">目标渠道</span>
                </div>
                <div className="text-2xl font-bold mt-1">{totalCount}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-muted-foreground">已就绪</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-emerald-600">{readyCount}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-muted-foreground">可复用尺寸</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-amber-600">{boardData.summary.sharedSizes}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-muted-foreground">预估工作量</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-blue-600">{boardData.summary.uniqueSizes}</div>
                <div className="text-[10px] text-muted-foreground">独立尺寸 (做一次，多处复用)</div>
              </Card>
            </div>

            {/* Channel Groups */}
            {targetChannelStatus.map(group => (
              <Card key={group.name}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">{group.name}</CardTitle>
                      <CardDescription className="text-xs">{group.description}</CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {group.channels.filter(c => c.hasSpecs).length}/{group.channels.length} 就绪
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {group.channels.map(ch => (
                      <div
                        key={ch.main}
                        className={`flex items-center gap-2 p-2 rounded-md border text-xs transition-colors ${
                          ch.hasSpecs
                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
                            : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                        }`}
                      >
                        {ch.hasSpecs ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{ch.main}</div>
                          {ch.hasSpecs ? (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {ch.specCount} 条规格 · {ch.types.length} 种类型
                            </div>
                          ) : (
                            <div className="text-[10px] text-red-500 mt-0.5">规格缺失，需先导入</div>
                          )}
                          {ch.dbChannels.length > 1 && ch.hasSpecs && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              含: {ch.dbChannels.filter(d => d !== ch.main).join(', ')}
                            </div>
                          )}
                        </div>
                        {ch.hasSpecs && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0">
                            {ch.specCount}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Action */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">
                    {readyCount === totalCount
                      ? '所有渠道规格已就绪，可以开始创建任务！'
                      : `还有 ${totalCount - readyCount} 个渠道缺少规格数据，请先在「素材规格库」或「需求消化」中导入。`
                    }
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setStep(2)}
                  disabled={readyCount === 0}
                >
                  下一步: 快速建任务
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ========== Step 2: 快速建任务 ========== */}
        {step === 2 && (
          <div className="p-4 space-y-4 max-w-5xl mx-auto">
            <div>
              <h2 className="text-lg font-semibold">快速建任务</h2>
              <p className="text-xs text-muted-foreground">
                一键为所有已就绪渠道生成制作任务
              </p>
            </div>

            {/* Basic Info */}
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">游戏名称 *</Label>
                  <Input
                    className="h-9"
                    placeholder="例: 仙剑奇侠传"
                    value={gameName}
                    onChange={e => setGameName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">批次名称 *</Label>
                  <Input
                    className="h-9"
                    placeholder="例: 第一批全渠道素材"
                    value={batchName}
                    onChange={e => setBatchName(e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Channel Selection */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">渠道选择</CardTitle>
                    <CardDescription className="text-xs">
                      已选 {selectedDbChannels.length} 个渠道 (去重后)，预计生成 {previewTaskCount} 个任务
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        // Select all channels that have specs
                        const allWithSpecs = boardData.channels.map(c => c.channel)
                        setSelectedDbChannels([...new Set(allWithSpecs)])
                      }}
                    >
                      全选
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setSelectedDbChannels([])}
                    >
                      清空
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-3">
                  {targetChannelStatus.map(group => (
                    <div key={group.name}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-muted-foreground">{group.name}</span>
                        <Separator className="flex-1" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[10px] h-5 px-1.5"
                          onClick={() => {
                            const groupDbChannels = group.channels
                              .filter(c => c.hasSpecs)
                              .flatMap(c => c.dbChannels)
                            setSelectedDbChannels(prev => {
                              const set = new Set(prev)
                              groupDbChannels.forEach(ch => set.add(ch))
                              return [...set]
                            })
                          }}
                        >
                          全选此组
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.channels.map(ch => {
                          const isSelected = ch.dbChannels.some(dc => selectedDbChannels.includes(dc))
                          const allSelected = ch.dbChannels.every(dc => selectedDbChannels.includes(dc))
                          return (
                            <button
                              key={ch.main}
                              onClick={() => {
                                if (!ch.hasSpecs) return
                                setSelectedDbChannels(prev => {
                                  const set = new Set(prev)
                                  if (allSelected) {
                                    ch.dbChannels.forEach(dc => set.delete(dc))
                                  } else {
                                    ch.dbChannels.forEach(dc => set.add(dc))
                                  }
                                  return [...set]
                                })
                              }}
                              disabled={!ch.hasSpecs}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                                !ch.hasSpecs
                                  ? 'opacity-40 cursor-not-allowed border-muted'
                                  : allSelected
                                  ? 'border-primary bg-primary/10 text-primary font-medium'
                                  : isSelected
                                  ? 'border-primary/50 bg-primary/5 text-primary'
                                  : 'border-muted hover:border-primary/30'
                              }`}
                            >
                              {allSelected ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : isSelected ? (
                                <Minus className="h-3.5 w-3.5" />
                              ) : (
                                <div className="h-3.5 w-3.5 rounded border border-muted-foreground/30" />
                              )}
                              {ch.main}
                              {ch.hasSpecs && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-0.5">
                                  {ch.specCount}
                                </Badge>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Size Reuse Preview */}
            {boardData.sizeGroups.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">尺寸复用分析</CardTitle>
                  <CardDescription className="text-xs">
                    {boardData.summary.sharedSizes} 个共享尺寸 (做一次可交付多渠道) · {boardData.summary.uniqueSizes} 个独立尺寸
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="max-h-60 overflow-auto space-y-1.5">
                    {boardData.sizeGroups
                      .filter(sg => sg.channels.some(ch => selectedDbChannels.includes(ch)))
                      .slice(0, 20)
                      .map(sg => {
                      const isSelectedChannels = sg.channels.filter(ch => selectedDbChannels.includes(ch))
                      return (
                        <div
                          key={sg.key}
                          className={`flex items-center gap-2 text-xs p-2 rounded ${
                            isSelectedChannels.length > 1
                              ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800'
                              : 'bg-muted/50'
                          }`}
                        >
                          <Badge
                            className={`text-[9px] px-1.5 py-0 shrink-0 ${
                              isSelectedChannels.length > 1
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                                : 'bg-muted text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {isSelectedChannels.length > 1 ? '共享' : '独立'}
                          </Badge>
                          <span className="font-mono font-medium shrink-0 w-20">{sg.width}x{sg.height}</span>
                          <span className="text-muted-foreground shrink-0">{sg.format}</span>
                          <span className="flex-1 truncate text-muted-foreground">
                            {isSelectedChannels.length > 1
                              ? `${isSelectedChannels.length} 渠道共享: ${isSelectedChannels.join(', ')}`
                              : isSelectedChannels[0] || '-'
                            }
                          </span>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0">
                            {sg.names.slice(0, 2).join('/')}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Generate Button */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">
                    即将为 <span className="text-primary">{selectedDbChannels.length}</span> 个渠道生成 <span className="text-primary">{previewTaskCount}</span> 个任务
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    游戏名: {gameName || '(未填写)'} · 批次名: {batchName || '(未填写)'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" />上一步
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateBatch}
                    disabled={creating || !gameName || !batchName || selectedDbChannels.length === 0}
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-1" />
                    )}
                    {creating ? '生成中...' : '一键生成任务'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ========== Step 3: 制作看板 ========== */}
        {step === 3 && (
          <div className="p-4 space-y-4 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">制作看板</h2>
                <p className="text-xs text-muted-foreground">
                  {gameName} - {batchName} · 共 {taskStats.total} 个任务 · 完成率 {completionRate}%
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyList}>
                  {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copied ? '已复制' : '复制清单'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  window.open(`/api/tasks/export?batchId=${createdBatchId}&mode=all`, '_blank')
                }}>
                  <Download className="h-3.5 w-3.5 mr-1" />导出
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: '总任务', value: taskStats.total, icon: Target, color: 'text-foreground' },
                { label: '已完成', value: taskStats.completed, icon: CheckCircle2, color: 'text-emerald-600' },
                { label: '制作中', value: taskStats.inProgress, icon: Clock, color: 'text-blue-600' },
                { label: '待制作', value: taskStats.pending, icon: Clock, color: 'text-amber-600' },
                { label: '异常', value: taskStats.error, icon: AlertTriangle, color: 'text-red-600' },
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

            {/* Progress */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">总体进度</span>
                <span className="text-sm font-bold">{completionRate}%</span>
              </div>
              <Progress value={completionRate} className="h-2" />
            </Card>

            {/* Filters */}
            <Card className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">视图:</Label>
                  <div className="flex border rounded-md overflow-hidden">
                    <button
                      onClick={() => setViewMode('bySize')}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                        viewMode === 'bySize' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                      }`}
                    >
                      <Layers className="h-3 w-3 inline mr-1" />按尺寸
                    </button>
                    <button
                      onClick={() => setViewMode('byChannel')}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                        viewMode === 'byChannel' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                      }`}
                    >
                      <Database className="h-3 w-3 inline mr-1" />按渠道
                    </button>
                  </div>
                </div>
                <Separator orientation="vertical" className="h-5" />
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">状态:</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-7 text-xs w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="待制作">待制作</SelectItem>
                      <SelectItem value="制作中">制作中</SelectItem>
                      <SelectItem value="已完成">已完成</SelectItem>
                      <SelectItem value="异常">异常</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {viewMode === 'bySize' && (
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">渠道:</Label>
                    <Select value={channelFilter} onValueChange={setChannelFilter}>
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部渠道</SelectItem>
                        {[...new Set(tasks.map(t => t.specChannel))].sort().map(ch => (
                          <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex-1" />
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-7 text-xs pl-7 w-40"
                    placeholder="搜索渠道/素材名..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Task Board */}
            {tasksLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : viewMode === 'bySize' ? (
              /* By Size View */
              <div className="space-y-3">
                {tasksBySize.map(group => {
                  const rate = group.tasks.length > 0 ? Math.round((group.completed / group.tasks.length) * 100) : 0
                  const isShared = group.tasks.length > 1
                  return (
                    <Card key={group.key}>
                      <CardHeader className="py-2.5 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-xs px-2 ${
                              isShared
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                            }`}>
                              {isShared ? `${group.tasks.length}渠道共享` : '独立尺寸'}
                            </Badge>
                            <span className="font-mono font-semibold text-sm">{group.width}x{group.height}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5">{group.format}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{group.completed}/{group.tasks.length} 完成</span>
                            <Progress value={rate} className="h-1.5 w-20" />
                            {isShared && group.completed < group.tasks.length && group.completed > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-6 px-2"
                                onClick={() => {
                                  const pendingIds = group.tasks
                                    .filter(t => t.status === '待制作' || t.status === '制作中')
                                    .map(t => t.id)
                                  if (pendingIds.length > 0) {
                                    handleBatchStatusUpdate(pendingIds, '已完成')
                                  }
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />全部完成
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="flex flex-wrap gap-1.5">
                          {group.tasks.map(task => (
                            <TaskChip key={task.id} task={task} onStatusChange={handleStatusChange} />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
                {tasksBySize.length === 0 && (
                  <Card className="p-8 text-center text-muted-foreground text-sm">
                    没有匹配的任务
                  </Card>
                )}
              </div>
            ) : (
              /* By Channel View */
              <div className="space-y-3">
                {tasksByChannel.map(group => {
                  const rate = group.tasks.length > 0 ? Math.round((group.completed / group.tasks.length) * 100) : 0
                  return (
                    <Card key={group.channel}>
                      <CardHeader className="py-2.5 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{group.channel}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              {group.tasks.length} 项
                            </Badge>
                            {group.error > 0 && (
                              <Badge variant="destructive" className="text-[10px] px-1.5">
                                {group.error} 异常
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{group.completed}/{group.tasks.length}</span>
                            <Progress value={rate} className="h-1.5 w-20" />
                            {group.completed < group.tasks.length && group.completed > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-6 px-2"
                                onClick={() => {
                                  const pendingIds = group.tasks
                                    .filter(t => t.status === '待制作' || t.status === '制作中')
                                    .map(t => t.id)
                                  if (pendingIds.length > 0) {
                                    handleBatchStatusUpdate(pendingIds, '已完成')
                                  }
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />全部完成
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                          {group.tasks.map(task => (
                            <TaskChip key={task.id} task={task} onStatusChange={handleStatusChange} compact />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* Next step */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  完成制作后，进入交付总览查看各渠道交付状态
                </span>
                <Button size="sm" onClick={() => setStep(4)}>
                  交付总览 <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ========== Step 4: 交付总览 ========== */}
        {step === 4 && (
          <div className="p-4 space-y-4 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">交付总览</h2>
                <p className="text-xs text-muted-foreground">
                  各渠道交付状态总览 · 总完成率 {completionRate}%
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  window.open(`/api/tasks/export?batchId=${createdBatchId}&mode=bychannel`, '_blank')
                }}>
                  <Download className="h-3.5 w-3.5 mr-1" />按渠道导出
                </Button>
              </div>
            </div>

            {/* Overall Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">可交付渠道</div>
                <div className="text-2xl font-bold mt-1 text-emerald-600">
                  {deliverySummary.filter(d => d.isComplete).length}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">制作中</div>
                <div className="text-2xl font-bold mt-1 text-blue-600">
                  {deliverySummary.filter(d => !d.isComplete && d.rate > 0).length}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">未开始</div>
                <div className="text-2xl font-bold mt-1 text-amber-600">
                  {deliverySummary.filter(d => d.rate === 0).length}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">有异常</div>
                <div className="text-2xl font-bold mt-1 text-red-600">
                  {deliverySummary.filter(d => d.error > 0).length}
                </div>
              </Card>
            </div>

            {/* Delivery Table */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">渠道交付状态</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="max-h-[60vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs h-8 w-40">渠道</TableHead>
                        <TableHead className="text-xs h-8 text-center w-20">进度</TableHead>
                        <TableHead className="text-xs h-8 text-center w-16">完成</TableHead>
                        <TableHead className="text-xs h-8 text-center w-16">待做</TableHead>
                        <TableHead className="text-xs h-8 text-center w-16">异常</TableHead>
                        <TableHead className="text-xs h-8 w-32">完成率</TableHead>
                        <TableHead className="text-xs h-8">必做未完成</TableHead>
                        <TableHead className="text-xs h-8 w-24">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliverySummary.map(d => (
                        <TableRow key={d.channel} className="text-xs">
                          <TableCell className="py-2 font-medium">{d.channel}</TableCell>
                          <TableCell className="py-2 text-center">
                            {d.isComplete ? (
                              <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 hover:bg-emerald-100">可交付</Badge>
                            ) : d.rate > 0 ? (
                              <Badge className="bg-blue-100 text-blue-700 text-[10px] px-1.5 hover:bg-blue-100">进行中</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-1.5">未开始</Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-center text-emerald-600">{d.completed}</TableCell>
                          <TableCell className="py-2 text-center text-amber-600">{d.pending + d.inProgress}</TableCell>
                          <TableCell className="py-2 text-center">
                            {d.error > 0 ? <span className="text-red-600">{d.error}</span> : '-'}
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              <Progress value={d.rate} className="h-1.5 flex-1" />
                              <span className="text-xs w-8 text-right">{d.rate}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            {d.missingRequired.length > 0 ? (
                              <span className="text-red-500 text-[10px]">
                                {d.missingRequired.length} 项必做未完成
                              </span>
                            ) : (
                              <span className="text-emerald-500 text-[10px]">全部必做已完成</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-[10px] h-6 px-1.5"
                                onClick={() => {
                                  setChannelFilter(d.channel)
                                  setViewMode('byChannel')
                                  setStep(3)
                                }}
                              >
                                <Eye className="h-3 w-3 mr-0.5" />查看
                              </Button>
                              {d.isComplete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[10px] h-6 px-1.5 text-emerald-600"
                                  onClick={() => {
                                    window.open(`/api/tasks/export?batchId=${createdBatchId}&mode=bychannel&channel=${encodeURIComponent(d.channel)}`, '_blank')
                                  }}
                                >
                                  <Download className="h-3 w-3 mr-0.5" />导出
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Back */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">返回制作看板继续制作</span>
                <Button variant="outline" size="sm" onClick={() => setStep(3)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />制作看板
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

// ========== Task Chip Component ==========
function TaskChip({
  task,
  onStatusChange,
  compact = false
}: {
  task: TaskItem
  onStatusChange: (id: string, status: string) => void
  compact?: boolean
}) {
  const statusConfig: Record<string, { color: string; bg: string; hover: string }> = {
    '待制作': { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', hover: 'hover:bg-amber-100' },
    '制作中': { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', hover: 'hover:bg-blue-100' },
    '已完成': { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', hover: 'hover:bg-emerald-100' },
    '异常': { color: 'text-red-700', bg: 'bg-red-50 border-red-200', hover: 'hover:bg-red-100' },
  }
  const config = statusConfig[task.status] || statusConfig['待制作']

  const nextStatus: Record<string, string> = {
    '待制作': '制作中',
    '制作中': '已完成',
    '已完成': '待制作',
    '异常': '待制作',
  }

  return (
    <button
      onClick={() => onStatusChange(task.id, nextStatus[task.status])}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${config.bg} ${config.color} ${config.hover}`}
      title={`${task.specChannel} - ${task.specName} (${task.specWidth}x${task.specHeight}) [点击切换状态]`}
    >
      <StatusDot status={task.status} />
      {compact ? (
        <>
          <span className="truncate max-w-16">{task.specName}</span>
          <span className="font-mono text-[10px] opacity-70">{task.specWidth}x{task.specHeight}</span>
        </>
      ) : (
        <>
          <span className="font-medium truncate max-w-20">{task.specChannel}</span>
          <span className="text-[10px] opacity-70">{task.specName}</span>
          <span className="font-mono text-[10px] opacity-70">{task.specWidth}x{task.specHeight}</span>
        </>
      )}
      {task.specIsRequired && <Star className="h-2.5 w-2.5 opacity-50" />}
    </button>
  )
}

// ========== Status Dot ==========
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    '待制作': 'bg-amber-400',
    '制作中': 'bg-blue-400',
    '已完成': 'bg-emerald-400',
    '异常': 'bg-red-400',
  }
  return <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[status] || 'bg-gray-400'}`} />
}

// Helper: Minus icon for partial selection
function Minus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
