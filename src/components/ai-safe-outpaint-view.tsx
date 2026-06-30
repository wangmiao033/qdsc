'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, FileArchive, ImagePlus, Loader2,
  RefreshCw, ShieldCheck, Sparkles, Upload
} from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'

interface SourceImage {
  id: string
  file: File
  name: string
  baseName: string
  width: number
  height: number
  size: number
  previewUrl: string
}

interface TargetSize {
  key: string
  width: number
  height: number
  note: string
}

interface OutpaintPlan {
  target: TargetSize
  drawX: number
  drawY: number
  drawWidth: number
  drawHeight: number
  padLeft: number
  padRight: number
  padTop: number
  padBottom: number
  sourceScale: number
  preservedPercent: number
  outpaintPercent: number
  sides: string[]
}

const TARGET_SIZES: TargetSize[] = [
  { key: '2000x600', width: 2000, height: 600, note: '同母版比例，可直接输出' },
  { key: '1600x440', width: 1600, height: 440, note: '更扁，建议补左右边缘' },
  { key: '1344x383', width: 1344, height: 383, note: '更扁，建议补左右边缘' },
  { key: '1440x472', width: 1440, height: 472, note: '更高，建议补上下边缘' },
  { key: '1032x342', width: 1032, height: 342, note: '更高，建议补上下边缘' },
]

function getBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'ai_safe_outpaint'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = url
  })
}

async function readSourceImage(file: File): Promise<SourceImage> {
  const previewUrl = URL.createObjectURL(file)
  try {
    const image = await loadImageElement(previewUrl)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('无法读取图片尺寸')
    return {
      id: `${file.name}-${file.lastModified}-${file.size}-${crypto.randomUUID()}`,
      file,
      name: file.name,
      baseName: getBaseName(file.name),
      width,
      height,
      size: file.size,
      previewUrl,
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error
  }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('图片编码失败'))
    }, 'image/png')
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getSides(plan: Pick<OutpaintPlan, 'padLeft' | 'padRight' | 'padTop' | 'padBottom'>) {
  const sides: string[] = []
  if (plan.padLeft > 0) sides.push('左')
  if (plan.padRight > 0) sides.push('右')
  if (plan.padTop > 0) sides.push('上')
  if (plan.padBottom > 0) sides.push('下')
  return sides
}

function createPlan(source: SourceImage, target: TargetSize, offsetX: number, offsetY: number): OutpaintPlan {
  const scale = Math.min(target.width / source.width, target.height / source.height)
  const drawWidth = Math.round(source.width * scale)
  const drawHeight = Math.round(source.height * scale)
  const maxX = Math.max(0, target.width - drawWidth)
  const maxY = Math.max(0, target.height - drawHeight)
  const drawX = Math.round(clamp(maxX / 2 + (maxX / 2) * (offsetX / 100), 0, maxX))
  const drawY = Math.round(clamp(maxY / 2 + (maxY / 2) * (offsetY / 100), 0, maxY))
  const padLeft = drawX
  const padRight = target.width - drawX - drawWidth
  const padTop = drawY
  const padBottom = target.height - drawY - drawHeight
  const preservedArea = drawWidth * drawHeight
  const targetArea = target.width * target.height
  const plan = {
    target,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
    padLeft,
    padRight,
    padTop,
    padBottom,
    sourceScale: scale,
    preservedPercent: Math.round((preservedArea / targetArea) * 100),
    outpaintPercent: Math.round(((targetArea - preservedArea) / targetArea) * 100),
    sides: [] as string[],
  }
  return { ...plan, sides: getSides(plan) }
}

function drawGuidePattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#f8f3e8'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.26)'
  ctx.lineWidth = Math.max(6, Math.round(width / 180))
  const step = Math.max(52, Math.round(width / 28))
  for (let x = -height; x < width + height; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, height)
    ctx.lineTo(x + height, 0)
    ctx.stroke()
  }
}

async function makeGuideBlob(source: SourceImage, plan: OutpaintPlan) {
  const image = await loadImageElement(source.previewUrl)
  const canvas = document.createElement('canvas')
  canvas.width = plan.target.width
  canvas.height = plan.target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  drawGuidePattern(ctx, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, plan.drawX, plan.drawY, plan.drawWidth, plan.drawHeight)

  ctx.strokeStyle = '#111827'
  ctx.lineWidth = Math.max(3, Math.round(canvas.width / 700))
  ctx.strokeRect(plan.drawX, plan.drawY, plan.drawWidth, plan.drawHeight)

  ctx.fillStyle = 'rgba(17, 24, 39, 0.72)'
  ctx.font = `${Math.max(18, Math.round(canvas.width / 64))}px sans-serif`
  const label = plan.sides.length > 0
    ? `AI only redraw: ${plan.sides.join('/')} edge`
    : 'No AI redraw needed'
  ctx.fillText(label, 24, Math.max(34, Math.round(canvas.height * 0.08)))

  return canvasToBlob(canvas)
}

async function makeMaskBlob(plan: OutpaintPlan) {
  const canvas = document.createElement('canvas')
  canvas.width = plan.target.width
  canvas.height = plan.target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.fillRect(plan.drawX, plan.drawY, plan.drawWidth, plan.drawHeight)
  return canvasToBlob(canvas)
}

function makePrompt(source: SourceImage, plan: OutpaintPlan) {
  if (plan.sides.length === 0) {
    return `${plan.target.key}: source ratio already matches target. Export directly without AI repaint.`
  }

  return [
    `Outpaint only the ${plan.sides.join(', ')} edge area for ${plan.target.key}.`,
    'Keep the original pasted image area unchanged pixel-for-pixel.',
    'Do not redraw or alter the game logo, Chinese title text, character face, character body, hand, armor, or existing castle.',
    'Extend the existing fantasy battlefield environment naturally with matching sky, mountains, golden light, castle atmosphere, banners, and foreground texture.',
    'No blur padding, no duplicated logo, no new text, no watermark, no layout change.',
    `Original image ${source.width}x${source.height} is placed at x=${plan.drawX}, y=${plan.drawY}, width=${plan.drawWidth}, height=${plan.drawHeight}.`,
  ].join(' ')
}

function PlanPreview({ source, plan }: { source: SourceImage; plan: OutpaintPlan }) {
  const left = `${(plan.drawX / plan.target.width) * 100}%`
  const top = `${(plan.drawY / plan.target.height) * 100}%`
  const width = `${(plan.drawWidth / plan.target.width) * 100}%`
  const height = `${(plan.drawHeight / plan.target.height) * 100}%`

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border bg-amber-50"
      style={{ aspectRatio: `${plan.target.width} / ${plan.target.height}` }}
    >
      <div className="absolute inset-0 opacity-70 [background-image:repeating-linear-gradient(135deg,rgba(217,119,6,.18)_0,rgba(217,119,6,.18)_10px,transparent_10px,transparent_22px)]" />
      <img
        src={source.previewUrl}
        alt={source.name}
        className="absolute border border-foreground/70 object-fill"
        style={{ left, top, width, height }}
      />
      <div className="absolute left-2 top-2 rounded bg-background/90 px-2 py-1 text-[10px] font-medium shadow-sm">
        {plan.sides.length > 0 ? `AI 重画：${plan.sides.join(' / ')}` : '无需重画'}
      </div>
    </div>
  )
}

export default function AiSafeOutpaintView() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<SourceImage | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isPacking, setIsPacking] = useState(false)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [zipFileName, setZipFileName] = useState('')

  const plans = useMemo(() => {
    if (!source) return []
    return TARGET_SIZES.map(target => createPlan(source, target, offsetX, offsetY))
  }, [source, offsetX, offsetY])

  const riskyCount = plans.filter(plan => plan.sides.length > 0).length

  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source.previewUrl)
    }
  }, [source])

  const clearSource = () => {
    if (source) URL.revokeObjectURL(source.previewUrl)
    setSource(null)
    setZipFileName('')
  }

  const addFile = async (fileList: FileList | File[]) => {
    const imageFile = Array.from(fileList).find(file =>
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
    )
    if (!imageFile) {
      toast({ title: '没有可读取的图片', description: '请上传 PNG / JPG / WebP / GIF / BMP', variant: 'destructive' })
      return
    }

    setIsReading(true)
    try {
      const nextSource = await readSourceImage(imageFile)
      if (source) URL.revokeObjectURL(source.previewUrl)
      setSource(nextSource)
      setZipFileName(`${sanitizeName(nextSource.baseName)}_ai_outpaint_plan`)
      setOffsetX(0)
      setOffsetY(0)
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片读取失败'
      toast({ title: '图片读取失败', description: message, variant: 'destructive' })
    } finally {
      setIsReading(false)
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) addFile(event.dataTransfer.files)
  }

  const downloadPlanZip = async () => {
    if (!source || plans.length === 0) return
    setIsPacking(true)
    try {
      const zip = new JSZip()
      const folder = zip.folder(`${sanitizeName(source.baseName)}_ai_safe_outpaint`)
      if (!folder) throw new Error('无法创建 ZIP 目录')

      folder.file(`source_${source.name}`, source.file)

      const planData = {
        source: {
          name: source.name,
          width: source.width,
          height: source.height,
        },
        rule: 'Keep original image unchanged. White mask area is the only AI redraw area. Black mask area must remain locked.',
        targets: plans.map(plan => ({
          size: plan.target.key,
          target: { width: plan.target.width, height: plan.target.height },
          sourcePlacement: {
            x: plan.drawX,
            y: plan.drawY,
            width: plan.drawWidth,
            height: plan.drawHeight,
          },
          aiRedrawSides: plan.sides,
          aiRedrawPercent: plan.outpaintPercent,
          prompt: makePrompt(source, plan),
        })),
      }
      folder.file('ai_outpaint_plan.json', JSON.stringify(planData, null, 2))

      for (const plan of plans) {
        const guideBlob = await makeGuideBlob(source, plan)
        const maskBlob = await makeMaskBlob(plan)
        folder.file(`${plan.target.key}_layout_guide.png`, guideBlob)
        folder.file(`${plan.target.key}_mask_white_redraw_black_keep.png`, maskBlob)
        folder.file(`${plan.target.key}_prompt.txt`, makePrompt(source, plan))
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const name = sanitizeName(zipFileName) || `${sanitizeName(source.baseName)}_ai_outpaint_plan`
      saveAs(blob, `${name}.zip`)
      toast({ title: '扩图任务包已生成', description: `包含 ${plans.length} 个尺寸的布局图、遮罩和提示词` })
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成任务包失败'
      toast({ title: '生成失败', description: message, variant: 'destructive' })
    } finally {
      setIsPacking(false)
    }
  }

  return (
    <div className="p-4 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 安全扩图
          </h2>
          <p className="text-xs text-muted-foreground">独立处理需要重画边缘的 Banner：保留原图主体，只标记需要 AI 补画的区域</p>
        </div>
        <Button variant="outline" size="sm" onClick={clearSource} disabled={!source || isReading || isPacking}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          重置
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" />
                上传母版
              </CardTitle>
              <CardDescription className="text-xs">建议上传 M7-A 的 2000x600 或同等比例母版</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/20'
                }`}
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setIsDragging(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setIsDragging(false)
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  className="hidden"
                  onChange={(event) => {
                    addFile(event.target.files || [])
                    event.target.value = ''
                  }}
                />
                {isReading ? (
                  <>
                    <Loader2 className="h-9 w-9 mx-auto text-primary animate-spin" />
                    <div className="text-sm font-medium mt-3">读取中...</div>
                  </>
                ) : source ? (
                  <>
                    <ShieldCheck className="h-9 w-9 mx-auto text-emerald-600" />
                    <div className="text-sm font-medium mt-3">已选择母版</div>
                    <div className="text-xs text-muted-foreground mt-1">点击可替换图片</div>
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-9 w-9 mx-auto text-muted-foreground" />
                    <div className="text-sm font-medium mt-3">拖入或点击上传 1 张母版</div>
                    <div className="text-xs text-muted-foreground mt-1">PNG / JPG / WebP / GIF / BMP</div>
                  </>
                )}
              </div>

              {source && (
                <div className="space-y-3">
                  <div className="rounded-md border p-2">
                    <div className="aspect-[10/3] rounded bg-muted/30 flex items-center justify-center overflow-hidden">
                      <img src={source.previewUrl} alt={source.name} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="mt-2 min-w-0">
                      <div className="text-xs font-medium truncate" title={source.name}>{source.name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                        <span className="font-mono">{source.width}x{source.height}</span>
                        <span>{formatBytes(source.size)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Card className="p-2.5 text-center">
                      <div className="text-lg font-bold">{TARGET_SIZES.length}</div>
                      <div className="text-[10px] text-muted-foreground">目标尺寸</div>
                    </Card>
                    <Card className="p-2.5 text-center">
                      <div className="text-lg font-bold text-amber-600">{riskyCount}</div>
                      <div className="text-[10px] text-muted-foreground">需扩图</div>
                    </Card>
                    <Card className="p-2.5 text-center">
                      <div className="text-lg font-bold text-emerald-600">{TARGET_SIZES.length - riskyCount}</div>
                      <div className="text-[10px] text-muted-foreground">可直出</div>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                安全放置
              </CardTitle>
              <CardDescription className="text-xs">原图完整保留；只调整原图在目标画布里的位置</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">左右位置</Label>
                  <span className="text-xs font-mono text-muted-foreground">{offsetX}</span>
                </div>
                <Slider value={[offsetX]} min={-100} max={100} step={1} onValueChange={value => setOffsetX(value[0])} disabled={!source} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">上下位置</Label>
                  <span className="text-xs font-mono text-muted-foreground">{offsetY}</span>
                </div>
                <Slider value={[offsetY]} min={-100} max={100} step={1} onValueChange={value => setOffsetY(value[0])} disabled={!source} />
              </div>

              <div className="rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-900">
                这个工具不做模糊背景，不拉伸，不裁掉原图主体。导出的遮罩里：白色区域给 AI 重画，黑色区域必须保留。
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">ZIP 任务包名称</Label>
                <Input
                  className="h-9 text-xs"
                  value={zipFileName}
                  onChange={event => setZipFileName(event.target.value)}
                  placeholder="ai_safe_outpaint_plan"
                  disabled={!source}
                />
              </div>

              <Button className="w-full" onClick={downloadPlanZip} disabled={!source || isPacking || isReading}>
                {isPacking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileArchive className="h-4 w-4 mr-1" />}
                {isPacking ? '生成中...' : '导出 AI 扩图任务包'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-8 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                M7-A 安全扩图尺寸
              </CardTitle>
              <CardDescription className="text-xs">这些尺寸不会再硬裁；不同比例会生成边缘重画遮罩</CardDescription>
            </CardHeader>
            <CardContent>
              {!source ? (
                <div className="h-72 flex items-center justify-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
                  上传母版后查看每个尺寸需要重画的区域
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {plans.map(plan => (
                    <div key={plan.target.key} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold font-mono">{plan.target.key}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{plan.target.note}</div>
                        </div>
                        {plan.sides.length > 0 ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            需 AI 重画
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            可直出
                          </Badge>
                        )}
                      </div>

                      <PlanPreview source={source} plan={plan} />

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded bg-muted/40 p-2">
                          <div className="text-xs font-semibold">{plan.preservedPercent}%</div>
                          <div className="text-[10px] text-muted-foreground">原图保留</div>
                        </div>
                        <div className="rounded bg-muted/40 p-2">
                          <div className="text-xs font-semibold text-amber-700">{plan.outpaintPercent}%</div>
                          <div className="text-[10px] text-muted-foreground">AI 重画</div>
                        </div>
                        <div className="rounded bg-muted/40 p-2">
                          <div className="text-xs font-semibold">{Math.round(plan.sourceScale * 100)}%</div>
                          <div className="text-[10px] text-muted-foreground">缩放</div>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground leading-relaxed">
                        原图位置：x {plan.drawX} / y {plan.drawY} / {plan.drawWidth}×{plan.drawHeight}
                        {plan.sides.length > 0 && (
                          <span>；AI 只重画 {plan.sides.join('、')} 边</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {source && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  下一步怎么用
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">1. 导出任务包</div>
                  <div className="text-xs text-muted-foreground mt-1">得到每个尺寸的 layout guide、mask 和 prompt。</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">2. AI 只看白区</div>
                  <div className="text-xs text-muted-foreground mt-1">白色遮罩区域重画，黑色原图区域锁定不改。</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">3. 回收成品</div>
                  <div className="text-xs text-muted-foreground mt-1">成品应保持人物、Logo、标题完整，不出现模糊补边。</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
