'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ExternalLink, FolderUp, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'

const SCGL_BASE_URL = (process.env.NEXT_PUBLIC_SCGL_BASE_URL || 'https://scgl.hnchpower.cn').replace(/\/$/, '')
const SCGL_IMPORT_URL = `${SCGL_BASE_URL}/api/external-import/qdsc`
const MAX_BROWSER_IMPORT_BYTES = 4 * 1024 * 1024

type LibraryProject = {
  id: string
  name: string
  description?: string | null
}

type LibraryChannel = {
  id: string
  name: string
  description?: string | null
  projectId: string
}

type CatalogResponse = {
  projects?: LibraryProject[]
  channels?: LibraryChannel[]
  error?: string
}

type OutputItem = {
  key: string
  name: string
  blobUrl: string
}

function findResultCard() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="card"]')).find(card => {
    const title = card.querySelector<HTMLElement>('[data-slot="card-title"]')
    return title?.textContent?.includes('改图结果')
  }) || null
}

function readOutputsFromCard(card: HTMLElement): OutputItem[] {
  const titleNodes = Array.from(card.querySelectorAll<HTMLElement>('[title]'))
  const outputs: OutputItem[] = []
  const used = new Set<string>()

  for (const titleNode of titleNodes) {
    const name = titleNode.getAttribute('title')?.trim() || ''
    if (!name || used.has(name)) continue

    const row = titleNode.closest<HTMLElement>('div.flex.items-center.gap-3.border')
    if (!row) continue
    const image = row.querySelector<HTMLImageElement>('img[src^="blob:"]')
    if (!image?.src) continue

    used.add(name)
    outputs.push({ key: name, name, blobUrl: image.src })
  }

  return outputs
}

function findRowForOutput(card: HTMLElement, name: string) {
  const titleNode = Array.from(card.querySelectorAll<HTMLElement>('[title]')).find(node => node.getAttribute('title') === name)
  return titleNode?.closest<HTMLElement>('div.flex.items-center.gap-3.border') || null
}

export function ScglImportInjector() {
  const { toast } = useToast()
  const [batchHost, setBatchHost] = useState<HTMLElement | null>(null)
  const [singleHosts, setSingleHosts] = useState<Array<{ host: HTMLElement; item: OutputItem }>>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingItems, setPendingItems] = useState<OutputItem[]>([])
  const [projects, setProjects] = useState<LibraryProject[]>([])
  const [channels, setChannels] = useState<LibraryChannel[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [projectId, setProjectId] = useState('unassigned')
  const [channelId, setChannelId] = useState('unassigned')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [importedNames, setImportedNames] = useState<Set<string>>(new Set())

  const availableChannels = useMemo(() => {
    if (!projectId || projectId === 'unassigned') return []
    return channels.filter(channel => channel.projectId === projectId)
  }, [channels, projectId])

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError('')
    try {
      const response = await fetch(SCGL_IMPORT_URL, { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as CatalogResponse
      if (!response.ok) throw new Error(data.error || `加载素材库失败 HTTP ${response.status}`)
      const nextProjects = Array.isArray(data.projects) ? data.projects : []
      const nextChannels = Array.isArray(data.channels) ? data.channels : []
      setProjects(nextProjects)
      setChannels(nextChannels)

      const savedProject = localStorage.getItem('quick-resize-scgl-project') || 'unassigned'
      const savedChannel = localStorage.getItem('quick-resize-scgl-channel') || 'unassigned'
      const resolvedProject = savedProject !== 'unassigned' && nextProjects.some(item => item.id === savedProject)
        ? savedProject
        : 'unassigned'
      const resolvedChannel = resolvedProject !== 'unassigned'
        && savedChannel !== 'unassigned'
        && nextChannels.some(item => item.id === savedChannel && item.projectId === resolvedProject)
        ? savedChannel
        : 'unassigned'
      setProjectId(resolvedProject)
      setChannelId(resolvedChannel)
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : '无法连接素材库')
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  const scan = useCallback(() => {
    const card = findResultCard()
    if (!card) {
      setBatchHost(null)
      setSingleHosts([])
      return
    }

    const outputs = readOutputsFromCard(card)
    const zipButton = Array.from(card.querySelectorAll<HTMLButtonElement>('button')).find(button =>
      button.textContent?.includes('打包下载 ZIP')
    )

    if (zipButton?.parentElement) {
      let host = zipButton.parentElement.querySelector<HTMLElement>('[data-scgl-import-batch-slot="true"]')
      if (!host) {
        host = document.createElement('span')
        host.dataset.scglImportBatchSlot = 'true'
        host.style.display = 'inline-flex'
        host.style.marginLeft = '8px'
        zipButton.parentElement.appendChild(host)
      }
      setBatchHost(current => current === host ? current : host)
    } else {
      setBatchHost(null)
    }

    const nextHosts: Array<{ host: HTMLElement; item: OutputItem }> = []
    for (const item of outputs) {
      const row = findRowForOutput(card, item.name)
      if (!row) continue
      let host = row.querySelector<HTMLElement>('[data-scgl-import-single-slot="true"]')
      if (!host) {
        host = document.createElement('span')
        host.dataset.scglImportSingleSlot = 'true'
        host.style.display = 'inline-flex'
        host.style.marginLeft = '4px'
        row.appendChild(host)
      }
      nextHosts.push({ host, item })
    }
    setSingleHosts(nextHosts)
  }, [])

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(scan)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true })
    window.addEventListener('popstate', schedule)
    window.addEventListener('hashchange', schedule)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('popstate', schedule)
      window.removeEventListener('hashchange', schedule)
    }
  }, [scan])

  const openImport = (items: OutputItem[]) => {
    if (!items.length) return
    setPendingItems(items)
    setDialogOpen(true)
    setProgress(0)
    if (projects.length === 0 && !catalogLoading) void loadCatalog()
  }

  const handleProjectChange = (value: string) => {
    setProjectId(value)
    setChannelId('unassigned')
    localStorage.setItem('quick-resize-scgl-project', value)
    localStorage.setItem('quick-resize-scgl-channel', 'unassigned')
  }

  const handleChannelChange = (value: string) => {
    setChannelId(value)
    localStorage.setItem('quick-resize-scgl-channel', value)
  }

  const importToLibrary = async () => {
    if (!pendingItems.length || importing) return
    setImporting(true)
    setProgress(0)
    let successCount = 0
    const newlyImported = new Set<string>()

    try {
      for (let index = 0; index < pendingItems.length; index += 1) {
        const item = pendingItems[index]
        const sourceResponse = await fetch(item.blobUrl)
        if (!sourceResponse.ok) throw new Error(`读取改图结果失败：${item.name}`)
        const blob = await sourceResponse.blob()
        if (blob.size > MAX_BROWSER_IMPORT_BYTES) {
          throw new Error(`${item.name} 超过 4MB，暂时请先下载后上传素材库`)
        }

        const file = new File([blob], item.name, { type: blob.type || 'application/octet-stream' })
        const formData = new FormData()
        formData.append('file', file)
        if (projectId !== 'unassigned') formData.append('projectId', projectId)
        if (channelId !== 'unassigned') formData.append('channelId', channelId)

        const response = await fetch(SCGL_IMPORT_URL, {
          method: 'POST',
          body: formData,
        })
        const data = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(data.error || `加入素材库失败：${item.name}`)

        successCount += 1
        newlyImported.add(item.name)
        setProgress(Math.round(((index + 1) / pendingItems.length) * 100))
      }

      setImportedNames(current => new Set([...current, ...newlyImported]))
      toast({
        title: `已加入素材库 ${successCount} 个文件`,
        description: projectId === 'unassigned'
          ? '已保存到未分类'
          : `已保存到 ${projects.find(item => item.id === projectId)?.name || '所选项目'}`,
      })
      setDialogOpen(false)
    } catch (error) {
      toast({
        title: `已成功 ${successCount}/${pendingItems.length} 个`,
        description: error instanceof Error ? error.message : '加入素材库失败',
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  const batchButton = batchHost && singleHosts.length > 0
    ? createPortal(
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openImport(singleHosts.map(item => item.item))}
          className="h-8 text-xs border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
        >
          <FolderUp className="h-3.5 w-3.5 mr-1" />
          加入素材库（{singleHosts.length} 个文件）
        </Button>,
        batchHost,
      )
    : null

  return (
    <>
      {batchButton}
      {singleHosts.map(({ host, item }) => createPortal(
        <Button
          key={`${item.key}-${importedNames.has(item.name) ? 'done' : 'ready'}`}
          type="button"
          variant="outline"
          size="sm"
          disabled={importedNames.has(item.name)}
          className="h-8 text-xs"
          onClick={() => openImport([item])}
        >
          {importedNames.has(item.name) ? (
            <><CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />已入库</>
          ) : (
            <><FolderUp className="h-3.5 w-3.5 mr-1" />加入素材库</>
          )}
        </Button>,
        host,
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderUp className="h-5 w-5 text-violet-600" />
              加入素材管理库
            </DialogTitle>
            <DialogDescription>
              将本次改好的 {pendingItems.length} 个文件直接保存到 scgl.hnchpower.cn。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              {pendingItems.length === 1
                ? pendingItems[0]?.name
                : `已选择 ${pendingItems.length} 个改图结果，将逐个加入素材库。`}
            </div>

            {catalogLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />正在读取素材库项目…
              </div>
            ) : catalogError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div>{catalogError}</div>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadCatalog()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />重试
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">目标项目</Label>
                  <Select value={projectId} onValueChange={handleProjectChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">未分类</SelectItem>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">目标分类 / 渠道</Label>
                  <Select
                    value={channelId}
                    onValueChange={handleChannelChange}
                    disabled={projectId === 'unassigned'}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">未分配渠道</SelectItem>
                      {availableChannels.map(channel => (
                        <SelectItem key={channel.id} value={channel.id}>{channel.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-[10px] text-muted-foreground">会记住你上一次选择，下次无需重复设置。</div>
                </div>
              </>
            )}

            {importing && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>正在加入素材库…</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => window.open(SCGL_BASE_URL, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-4 w-4 mr-1" />打开素材库
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={importing}>
                取消
              </Button>
              <Button
                type="button"
                onClick={() => void importToLibrary()}
                disabled={catalogLoading || Boolean(catalogError) || importing || pendingItems.length === 0}
              >
                {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FolderUp className="h-4 w-4 mr-1" />}
                {importing ? '加入中…' : `加入素材库（${pendingItems.length}）`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
