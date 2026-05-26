'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Crop, Download, FileArchive, ImagePlus, Loader2, Maximize2, Move,
  RefreshCw, Smartphone,   Trash2, Upload, ZoomIn
} from 'lucide-react'
import {
  STORE_OUTPUT_SIZES,
  STORE_SCREENSHOT_MASTERS,
  STORE_SCREENSHOT_SLOTS,
  STORE_SLOT_COUNT,
  STORE_TOTAL_OUTPUTS,
  STORE_ZIP_ROOT,
} from '@/data/store-screenshot-spec'
import {
  clampCropAdjust,
  DEFAULT_STORE_CROP_ADJUST,
  drawStoreScreenshotCrop,
  formatBytes,
  generateAllStoreScreenshotOutputs,
  readStoreScreenshotSource,
  type StoreCropAdjust,
  type StoreScreenshotOutput,
  type StoreScreenshotSource,
} from '@/lib/store-screenshot-crop'
import { cn } from '@/lib/utils'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'

const PREVIEW_MAX = 280

function getPreviewCanvasSize(targetW: number, targetH: number) {
  const ratio = targetW / targetH
  if (ratio >= 1) {
    return { width: PREVIEW_MAX, height: Math.round(PREVIEW_MAX / ratio) }
  }
  return { width: Math.round(PREVIEW_MAX * ratio), height: PREVIEW_MAX }
}

function CropPreviewCanvas({
  source,
  target,
  adjust,
  onAdjustChange,
}: {
  source: StoreScreenshotSource
  target: { width: number; height: number }
  adjust: StoreCropAdjust
  onAdjustChange: (next: StoreCropAdjust) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; focusX: number; focusY: number } | null>(null)

  const canvasSize = useMemo(
    () => getPreviewCanvasSize(target.width, target.height),
    [target.width, target.height]
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const full = drawStoreScreenshotCrop(source.image, target, clampCropAdjust(adjust))
    canvas.width = canvasSize.width
    canvas.height = canvasSize.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(full, 0, 0, canvasSize.width, canvasSize.height)
  }, [source, target, adjust, canvasSize])

  useEffect(() => {
    redraw()
  }, [redraw])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      focusX: adjust.focusX,
      focusY: adjust.focusY,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    const sensitivity = 0.35 / Math.max(canvasSize.width, canvasSize.height)
    onAdjustChange(clampCropAdjust({
      ...adjust,
      focusX: dragRef.current.focusX - dx * sensitivity,
      focusY: dragRef.current.focusY - dy * sensitivity,
    }))
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    }
    dragRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg border border-border bg-muted cursor-grab active:cursor-grabbing touch-none max-w-full"
      style={{ width: canvasSize.width, height: canvasSize.height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      aria-label="拖动调整裁剪区域"
    />
  )
}

export default function StoreScreenshotCropView() {
  const [slots, setSlots] = useState<Record<number, StoreScreenshotSource>>({})
  const [adjusts, setAdjusts] = useState<Record<number, StoreCropAdjust>>(() => {
    const init: Record<number, StoreCropAdjust> = {}
    for (let i = 1; i <= STORE_SLOT_COUNT; i += 1) {
      init[i] = { ...DEFAULT_STORE_CROP_ADJUST }
    }
    return init
  })
  const [activeSlot, setActiveSlot] = useState(1)
  const [activeSizeKey, setActiveSizeKey] = useState(STORE_OUTPUT_SIZES[0].key)
  const [outputs, setOutputs] = useState<StoreScreenshotOutput[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isZipping, setIsZipping] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingSlotRef = useRef<number>(1)
  const dragCounterRef = useRef(0)
  const slotsRef = useRef(slots)
  const outputsRef = useRef(outputs)
  const { toast } = useToast()

  const uploadedCount = Object.keys(slots).length
  const activeSource = slots[activeSlot]
  const activeSize = STORE_OUTPUT_SIZES.find(size => size.key === activeSizeKey) || STORE_OUTPUT_SIZES[0]
  const activeAdjust = adjusts[activeSlot] || DEFAULT_STORE_CROP_ADJUST
  const allReady = uploadedCount === STORE_SLOT_COUNT
  const totalOutputSize = outputs.reduce((sum, output) => sum + output.blob.size, 0)

  const sourcesList = useMemo(
    () => STORE_SCREENSHOT_SLOTS
      .map(meta => slots[meta.index])
      .filter((source): source is StoreScreenshotSource => Boolean(source)),
    [slots]
  )

  useEffect(() => { slotsRef.current = slots }, [slots])
  useEffect(() => { outputsRef.current = outputs }, [outputs])
  useEffect(() => {
    return () => {
      Object.values(slotsRef.current).forEach(source => URL.revokeObjectURL(source.previewUrl))
      outputsRef.current.forEach(output => URL.revokeObjectURL(output.url))
    }
  }, [])

  const invalidateOutputs = () => {
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setOutputs([])
    setProgress(0)
  }

  const setSlotAdjust = (slotIndex: number, patch: Partial<StoreCropAdjust>) => {
    invalidateOutputs()
    setAdjusts(prev => ({
      ...prev,
      [slotIndex]: clampCropAdjust({ ...(prev[slotIndex] || DEFAULT_STORE_CROP_ADJUST), ...patch }),
    }))
  }

  const assignSource = async (
    slotIndex: number,
    file: File,
    slotMap: Record<number, StoreScreenshotSource>
  ) => {
    const old = slotMap[slotIndex]
    if (old) URL.revokeObjectURL(old.previewUrl)
    const source = await readStoreScreenshotSource(slotIndex, file)
    slotMap[slotIndex] = source
    return source
  }

  const handleFiles = async (files: File[], startSlot?: number) => {
    const imageFiles = files.filter(file =>
      file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)
    )
    if (imageFiles.length === 0) {
      toast({ title: '请选择图片', description: '支持 PNG / JPG / JPEG / WebP', variant: 'destructive' })
      return
    }

    setIsReading(true)
    let slot = startSlot ?? pendingSlotRef.current
    let added = 0
    const nextSlots = { ...slots }
    const nextAdjusts = { ...adjusts }

    for (const file of imageFiles) {
      if (slot > STORE_SLOT_COUNT) break
      while (slot <= STORE_SLOT_COUNT && nextSlots[slot]) {
        slot += 1
      }
      if (slot > STORE_SLOT_COUNT) break
      try {
        await assignSource(slot, file, nextSlots)
        nextAdjusts[slot] = { ...DEFAULT_STORE_CROP_ADJUST }
        added += 1
        setActiveSlot(slot)
        slot += 1
      } catch (error) {
        const reason = error instanceof Error ? error.message : '读取失败'
        toast({ title: `${file.name} 读取失败`, description: reason, variant: 'destructive' })
      }
    }

    if (added > 0) {
      invalidateOutputs()
      setSlots(nextSlots)
      setAdjusts(nextAdjusts)
      const count = Object.keys(nextSlots).length
      toast({ title: `已更新 ${added} 张`, description: `当前 ${count}/${STORE_SLOT_COUNT} 张` })
    }

    setIsReading(false)
  }

  const removeSlot = (slotIndex: number) => {
    const target = slots[slotIndex]
    if (target) URL.revokeObjectURL(target.previewUrl)
    invalidateOutputs()
    setSlots(prev => {
      const next = { ...prev }
      delete next[slotIndex]
      return next
    })
  }

  const resetAll = () => {
    Object.values(slots).forEach(source => URL.revokeObjectURL(source.previewUrl))
    outputs.forEach(output => URL.revokeObjectURL(output.url))
    setSlots({})
    setOutputs([])
    setProgress(0)
    const init: Record<number, StoreCropAdjust> = {}
    for (let i = 1; i <= STORE_SLOT_COUNT; i += 1) {
      init[i] = { ...DEFAULT_STORE_CROP_ADJUST }
    }
    setAdjusts(init)
    setActiveSlot(1)
  }

  const openPicker = (slotIndex: number) => {
    pendingSlotRef.current = slotIndex
    if (fileInputRef.current) fileInputRef.current.value = ''
    fileInputRef.current?.click()
  }

  const handleGenerate = async () => {
    if (!allReady || isGenerating) {
      if (!allReady) {
        toast({
          title: '请先上传 5 张商店截图',
          description: `当前 ${uploadedCount}/${STORE_SLOT_COUNT} 张`,
          variant: 'destructive',
        })
      }
      return
    }

    invalidateOutputs()
    setIsGenerating(true)
    const { outputs: nextOutputs, failed } = await generateAllStoreScreenshotOutputs(
      sourcesList,
      adjusts,
      setProgress
    )
    setOutputs(nextOutputs)
    setIsGenerating(false)

    if (failed > 0) {
      toast({ title: `完成 ${nextOutputs.length} 张，失败 ${failed} 张`, variant: 'destructive' })
    } else {
      toast({ title: `已生成 ${nextOutputs.length} 张`, description: `${STORE_OUTPUT_SIZES.length} 尺寸 × 5 图` })
    }
  }

  const downloadZip = async () => {
    if (outputs.length === 0 || isZipping) return
    setIsZipping(true)
    try {
      const zip = new JSZip()
      const root = zip.folder(STORE_ZIP_ROOT)
      outputs.forEach(output => {
        const folder = root?.folder(output.sizeKey)
        folder?.file(output.name, output.blob)
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `${STORE_ZIP_ROOT}.zip`)
    } finally {
      setIsZipping(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] px-4 py-5 space-y-5 min-[1440px]:px-6">
      <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            商店五图母版裁剪
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Store Screenshot 五图 · 独立于 Banner · 12 尺寸 × 5 张 = 60 张输出
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={resetAll} disabled={uploadedCount === 0 && outputs.length === 0}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          重置
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[1440px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 min-[1440px]:sticky min-[1440px]:top-4 min-[1440px]:self-start">
          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" />
                上传五图原稿
              </CardTitle>
              <CardDescription className="text-xs">固定 5 槽位，可逐张替换或拖拽批量填入</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={event => {
                  void handleFiles(Array.from(event.target.files || []), pendingSlotRef.current)
                }}
              />
              <div
                className={cn(
                  'border border-dashed rounded-xl p-3 text-center text-xs transition-colors',
                  isDragging ? 'border-foreground bg-muted/50' : 'border-border hover:bg-muted/30'
                )}
                onDragEnter={e => { e.preventDefault(); dragCounterRef.current += 1; setIsDragging(true) }}
                onDragLeave={e => {
                  e.preventDefault()
                  dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
                  if (dragCounterRef.current === 0) setIsDragging(false)
                }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                onDrop={e => {
                  e.preventDefault()
                  dragCounterRef.current = 0
                  setIsDragging(false)
                  void handleFiles(Array.from(e.dataTransfer.files || []), 1)
                }}
              >
                {isReading ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />读取中</span>
                ) : (
                  <span className="text-muted-foreground">拖入最多 5 张图，按槽位顺序填入</span>
                )}
              </div>

              {STORE_SCREENSHOT_SLOTS.map(meta => {
                const source = slots[meta.index]
                const isActive = activeSlot === meta.index
                return (
                  <div
                    key={meta.index}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border p-2 transition-colors',
                      isActive ? 'border-foreground bg-muted/40' : 'border-border/80'
                    )}
                  >
                    {source ? (
                      <img src={source.previewUrl} alt="" className="h-12 w-8 rounded object-cover border shrink-0" />
                    ) : (
                      <div className="h-12 w-8 rounded border border-dashed bg-muted/30 shrink-0 flex items-center justify-center text-[10px] text-muted-foreground">
                        {meta.fileName}
                      </div>
                    )}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setActiveSlot(meta.index)}
                    >
                      <div className="text-xs font-medium">{meta.label} · {meta.description}</div>
                      {source ? (
                        <div className="text-[10px] text-muted-foreground truncate">{source.width}×{source.height}</div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground">未上传</div>
                      )}
                    </button>
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openPicker(meta.index)} title="上传/替换">
                        <ImagePlus className="h-3.5 w-3.5" />
                      </Button>
                      {source && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeSlot(meta.index)} aria-label="删除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="flex items-stretch divide-x divide-border rounded-lg border bg-muted/20 text-center text-xs">
                <div className="flex-1 py-2">
                  <div className="text-base font-semibold tabular-nums">{uploadedCount}/{STORE_SLOT_COUNT}</div>
                  <div className="text-[10px] text-muted-foreground">已上传</div>
                </div>
                <div className="flex-1 py-2">
                  <div className="text-base font-semibold tabular-nums">{STORE_OUTPUT_SIZES.length}</div>
                  <div className="text-[10px] text-muted-foreground">目标尺寸</div>
                </div>
                <div className="flex-1 py-2">
                  <div className="text-base font-semibold tabular-nums">{STORE_TOTAL_OUTPUTS}</div>
                  <div className="text-[10px] text-muted-foreground">预计输出</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardContent className="px-4 py-4 space-y-3">
              <Button
                className="w-full h-9 rounded-lg bg-foreground text-background hover:bg-foreground/90"
                disabled={!allReady || isGenerating || isReading}
                onClick={() => void handleGenerate()}
              >
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" />生成中...</>
                ) : (
                  <><Crop className="h-4 w-4 mr-1" />生成全部尺寸（{STORE_TOTAL_OUTPUTS} 张）</>
                )}
              </Button>
              {isGenerating && <Progress value={progress} className="h-1.5" />}
              {outputs.length > 0 && (
                <Button variant="outline" className="w-full h-8 text-xs rounded-lg" disabled={isZipping} onClick={() => void downloadZip()}>
                  {isZipping ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileArchive className="h-3.5 w-3.5 mr-1" />}
                  下载 ZIP（{outputs.length} 张 · {formatBytes(totalOutputSize)}）
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 gap-4 min-[1200px]:grid-cols-2">
            <Card className="rounded-xl border border-border/80 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm font-medium">单图裁剪调整</CardTitle>
                <CardDescription className="text-xs">
                  {STORE_SCREENSHOT_SLOTS.find(s => s.index === activeSlot)?.description}
                  · 预览比例 {activeSize.key} · 拖动平移 · 滑块缩放
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {activeSource ? (
                  <>
                    <div className="flex justify-center">
                      <CropPreviewCanvas
                        source={activeSource}
                        target={activeSize}
                        adjust={activeAdjust}
                        onAdjustChange={next => setSlotAdjust(activeSlot, next)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs rounded-lg"
                        onClick={() => setSlotAdjust(activeSlot, DEFAULT_STORE_CROP_ADJUST)}
                      >
                        <Maximize2 className="h-3.5 w-3.5 mr-1" />
                        居中复位
                      </Button>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Move className="h-3 w-3" /> 拖动画布调整构图
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <Label className="text-muted-foreground flex items-center gap-1"><ZoomIn className="h-3 w-3" />缩放</Label>
                        <span className="font-mono">{activeAdjust.zoom.toFixed(2)}×</span>
                      </div>
                      <Slider
                        value={[activeAdjust.zoom]}
                        min={1}
                        max={3}
                        step={0.01}
                        onValueChange={([zoom]) => setSlotAdjust(activeSlot, { zoom })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="py-16 text-center text-sm text-muted-foreground">请先上传该槽位图片</div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border border-border/80 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-sm font-medium">目标尺寸（12）</CardTitle>
                <CardDescription className="text-xs">点击尺寸查看五图同尺寸预览</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {STORE_OUTPUT_SIZES.map(size => (
                    <button
                      key={size.key}
                      type="button"
                      onClick={() => setActiveSizeKey(size.key)}
                      className={cn(
                        'font-mono text-[11px] px-2 py-1 rounded-md border transition-colors',
                        activeSizeKey === size.key
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border hover:border-foreground/40'
                      )}
                    >
                      {size.key}
                    </button>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-medium">{activeSize.key} 五图预览</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {STORE_SCREENSHOT_SLOTS.map(meta => {
                      const source = slots[meta.index]
                      if (!source) {
                        return (
                          <div key={meta.index} className="rounded-lg border border-dashed p-3 text-center text-[10px] text-muted-foreground">
                            {meta.fileName} 未上传
                          </div>
                        )
                      }
                      const adjust = adjusts[meta.index] || DEFAULT_STORE_CROP_ADJUST
                      return (
                        <button
                          key={meta.index}
                          type="button"
                          className={cn(
                            'rounded-lg border overflow-hidden text-left transition-colors',
                            activeSlot === meta.index ? 'border-foreground ring-1 ring-foreground' : 'border-border/80'
                          )}
                          onClick={() => setActiveSlot(meta.index)}
                        >
                          <SizePreviewThumb source={source} size={activeSize} adjust={adjust} />
                          <div className="px-1.5 py-1 text-[9px] truncate">{meta.fileName} {meta.description}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl border border-border/80 shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-sm font-medium">Store Screenshot 母版（4 套 · 只读）</CardTitle>
              <CardDescription className="text-xs">与 Banner 无关 · 每套母版覆盖的渠道输出尺寸如下</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 min-[1440px]:grid-cols-4 gap-3">
                {STORE_SCREENSHOT_MASTERS.map(master => (
                  <div key={master.code} className="rounded-xl border border-border/80 p-3 text-xs">
                    <div className="font-mono text-[10px] text-muted-foreground">{master.code} · {master.master} · {master.ratioLabel}</div>
                    <div className="text-sm font-medium mt-0.5">{master.label}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {master.sizes.map(key => (
                        <Badge key={key} variant="outline" className="text-[9px] px-1 py-0 font-mono">{key}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {outputs.length > 0 && (
            <Card className="rounded-xl border border-border/80 shadow-sm">
              <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">生成结果</CardTitle>
                  <CardDescription className="text-xs">{STORE_ZIP_ROOT}/尺寸/01~05.png</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isZipping} onClick={() => void downloadZip()}>
                  <Download className="h-3 w-3 mr-1" />ZIP
                </Button>
              </CardHeader>
              <CardContent className="px-4 pb-4 max-h-[320px] overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {STORE_OUTPUT_SIZES.map(size => {
                    const count = outputs.filter(output => output.sizeKey === size.key).length
                    if (count === 0) return null
                    return (
                      <Badge key={size.key} variant="secondary" className="text-[10px] font-mono">
                        {size.key} · {count} 张
                      </Badge>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function SizePreviewThumb({
  source,
  size,
  adjust,
}: {
  source: StoreScreenshotSource
  size: { width: number; height: number; key: string }
  adjust: StoreCropAdjust
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasSize = getPreviewCanvasSize(size.width, size.height)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const full = drawStoreScreenshotCrop(source.image, size, clampCropAdjust(adjust))
    canvas.width = canvasSize.width
    canvas.height = canvasSize.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(full, 0, 0, canvasSize.width, canvasSize.height)
  }, [source, size, adjust, canvasSize])

  return (
    <canvas
      ref={canvasRef}
      className="w-full bg-muted"
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
    />
  )
}
