'use client'

import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Copy, FileImage, Info, RotateCcw, Ruler, Upload, XCircle } from 'lucide-react'

type JiuyouSpecId = 'splash' | 'popup' | 'banner' | 'feed' | 'tab' | 'egg'

type JiuyouSpec = {
  id: JiuyouSpecId
  name: string
  dimension: string
  width?: number
  height: number
  maxWidth?: number
  maxBytes: number
  formats: string[]
  strictSize?: boolean
  note: string
  manual: string[]
}

type CheckedFile = {
  id: string
  file: File
  url: string
  width: number
  height: number
  format: string
  specId: JiuyouSpecId | ''
}

const JIUYOU_SPECS: JiuyouSpec[] = [
  {
    id: 'splash',
    name: '闪屏',
    dimension: '1080 × 2340',
    width: 1080,
    height: 2340,
    maxBytes: 1024 * 1024,
    formats: ['JPG', 'JPEG', 'PNG', 'WEBP'],
    strictSize: true,
    note: '图片 ≤ 1MB · 必须包含游戏名或 Logo',
    manual: ['安全区：顶部约 240px、底部约 540px、左右约 80px', '重要人物、Logo、文案不得进入出血区'],
  },
  {
    id: 'popup',
    name: '大弹窗',
    dimension: '720 × 1100',
    width: 720,
    height: 1100,
    maxBytes: 1024 * 1024,
    formats: ['PNG', 'WEBP'],
    strictSize: true,
    note: '图片 ≤ 1MB · PNG / WEBP',
    manual: ['左上角放游戏 Logo', '不可自带关闭按钮；右上角由系统提供关闭键'],
  },
  {
    id: 'banner',
    name: '首页 Banner',
    dimension: '720 × 405',
    width: 720,
    height: 405,
    maxBytes: 500 * 1024,
    formats: ['JPG', 'JPEG', 'PNG'],
    strictSize: true,
    note: '图片 ≤ 500KB · JPG / PNG',
    manual: ['不可加按钮、文字标题', '左上角可放游戏 Logo', '不可使用白底图'],
  },
  {
    id: 'feed',
    name: '首页信息流',
    dimension: '720 × 405',
    width: 720,
    height: 405,
    maxBytes: 500 * 1024,
    formats: ['JPG', 'JPEG', 'PNG'],
    strictSize: true,
    note: '图片 ≤ 500KB · JPG / PNG',
    manual: ['允许卖点文案和游戏 Logo', '不可制作假按钮', '画面主体需清晰'],
  },
  {
    id: 'tab',
    name: '首页 Tab',
    dimension: '高 54px · 宽 ≤ 320px',
    height: 54,
    maxWidth: 320,
    maxBytes: 100 * 1024,
    formats: ['PNG', 'WEBP'],
    note: '图片 ≤ 100KB · PNG / WEBP',
    manual: ['高度必须 54px，宽度不得超过 320px', 'Logo 四周保留透明间距', '黑色 Logo 建议加约 2px 白描边；不可输出纯白 Logo'],
  },
  {
    id: 'egg',
    name: '首页彩蛋',
    dimension: '152 × 152',
    width: 152,
    height: 152,
    maxBytes: 300 * 1024,
    formats: ['PNG', 'WEBP'],
    strictSize: true,
    note: '图片 ≤ 300KB · PNG / WEBP',
    manual: ['必须使用圆形背景框造型，不可直接做正方形卡片', '不得出现不合理边缘切割', '底部卖点文字 ≤ 5 个字'],
  },
]

function getFileFormat(file: File) {
  const ext = file.name.split('.').pop()?.toUpperCase() || ''
  if (ext === 'JPE') return 'JPEG'
  return ext
}

async function readImageSize(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = reject
      image.src = url
    })
    return { ...size, url }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function inferSpec(width: number, height: number, fileName: string): JiuyouSpecId | '' {
  const lower = fileName.toLowerCase()
  if (width === 1080 && height === 2340) return 'splash'
  if (width === 720 && height === 1100) return 'popup'
  if (height === 54 && width <= 320) return 'tab'
  if (width === 152 && height === 152) return 'egg'
  if (width === 720 && height === 405) {
    if (lower.includes('信息流') || lower.includes('feed')) return 'feed'
    if (lower.includes('banner') || lower.includes('banner')) return 'banner'
    return ''
  }
  return ''
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function inspect(file: CheckedFile) {
  const spec = JIUYOU_SPECS.find(item => item.id === file.specId)
  if (!spec) {
    return {
      status: 'pending' as const,
      reasons: ['请选择要核对的九游素材位'],
      sizeOk: false,
      bytesOk: false,
      formatOk: false,
    }
  }

  const sizeOk = spec.id === 'tab'
    ? file.height === 54 && file.width <= (spec.maxWidth || 320)
    : file.width === spec.width && file.height === spec.height
  const bytesOk = file.file.size <= spec.maxBytes
  const formatOk = spec.formats.includes(file.format)
  const reasons: string[] = []

  if (!sizeOk) {
    reasons.push(spec.id === 'tab'
      ? `尺寸不符：当前 ${file.width}×${file.height}，要求高 54px 且宽 ≤ 320px`
      : `尺寸不符：当前 ${file.width}×${file.height}，要求 ${spec.dimension}`)
  }
  if (!bytesOk) reasons.push(`文件过大：当前 ${formatBytes(file.file.size)}，上限 ${formatBytes(spec.maxBytes)}`)
  if (!formatOk) reasons.push(`格式不符：当前 ${file.format || '未知'}，允许 ${spec.formats.join(' / ')}`)

  return {
    status: reasons.length === 0 ? 'pass' as const : 'fail' as const,
    reasons,
    sizeOk,
    bytesOk,
    formatOk,
  }
}

export default function JiuyouSpecValidator() {
  const [files, setFiles] = useState<CheckedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const summary = useMemo(() => {
    const results = files.map(inspect)
    return {
      total: files.length,
      pass: results.filter(item => item.status === 'pass').length,
      fail: results.filter(item => item.status === 'fail').length,
      pending: results.filter(item => item.status === 'pending').length,
    }
  }, [files])

  const addFiles = async (incoming: FileList | File[]) => {
    const imageFiles = Array.from(incoming).filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name))
    const checked = await Promise.all(imageFiles.map(async file => {
      const { width, height, url } = await readImageSize(file)
      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        url,
        width,
        height,
        format: getFileFormat(file),
        specId: inferSpec(width, height, file.name),
      } as CheckedFile
    }))
    setFiles(current => [...current, ...checked])
  }

  const clearAll = () => {
    files.forEach(file => URL.revokeObjectURL(file.url))
    setFiles([])
  }

  const removeFile = (id: string) => {
    setFiles(current => {
      const target = current.find(item => item.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return current.filter(item => item.id !== id)
    })
  }

  const copyResult = async () => {
    const lines = files.map(file => {
      const spec = JIUYOU_SPECS.find(item => item.id === file.specId)
      const result = inspect(file)
      const mark = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️'
      const detail = result.status === 'pass' ? '通过' : result.reasons.join('；')
      return `${mark} ${file.file.name}｜${file.width}×${file.height}｜${formatBytes(file.file.size)}｜${spec?.name || '未选择'}｜${detail}`
    })
    await navigator.clipboard.writeText(`【九游规格验收】\n${lines.join('\n')}`)
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-violet-600 p-2 text-white"><Ruler className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-black text-zinc-950">九游规格整理</h1>
              <p className="mt-0.5 text-xs font-semibold text-zinc-500">严格按像素 1:1 核对 · 尺寸、格式、文件大小三项自动验收</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={copyResult} disabled={!files.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm disabled:opacity-40">
            <Copy className="h-3.5 w-3.5" />复制验收结果
          </button>
          <button onClick={clearAll} disabled={!files.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" />清空
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['已上传', summary.total, 'text-zinc-950'],
          ['已通过', summary.pass, 'text-emerald-600'],
          ['不通过', summary.fail, 'text-red-600'],
          ['待选择用途', summary.pending, 'text-amber-600'],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className={`text-2xl font-black ${cls}`}>{value}</div>
            <div className="mt-1 text-xs font-bold text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-violet-900">
          <Info className="h-4 w-4" />九游官方图片规格（本页验收基准）
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {JIUYOU_SPECS.map(spec => (
            <div key={spec.id} className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-black text-zinc-900">{spec.name}</div>
                <span className="rounded-md bg-zinc-950 px-2 py-1 font-mono text-[11px] font-black text-white">{spec.dimension}</span>
              </div>
              <div className="mt-2 text-[11px] font-semibold text-zinc-500">{spec.note}</div>
              <div className="mt-2 space-y-1">
                {spec.manual.map(text => <div key={text} className="text-[10px] font-medium leading-relaxed text-zinc-500">• {text}</div>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        onDragEnter={event => { event.preventDefault(); setDragging(true) }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={event => { event.preventDefault(); setDragging(false) }}
        onDrop={event => {
          event.preventDefault()
          setDragging(false)
          if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files)
        }}
        className={`rounded-2xl border-2 border-dashed p-7 text-center transition ${dragging ? 'border-violet-500 bg-violet-50' : 'border-zinc-300 bg-white'}`}
      >
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={event => event.target.files && void addFiles(event.target.files)} />
        <Upload className="mx-auto h-8 w-8 text-violet-600" />
        <div className="mt-2 text-sm font-black text-zinc-900">把九游成品图拖到这里，一次可验收多张</div>
        <div className="mt-1 text-xs font-semibold text-zinc-500">系统读取原图 naturalWidth / naturalHeight，不按比例近似，必须像素完全一致</div>
        <button onClick={() => inputRef.current?.click()} className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-violet-700">选择图片</button>
      </section>

      {files.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <div className="text-sm font-black text-zinc-950">逐张 1:1 验收</div>
            <div className="mt-1 text-[11px] font-semibold text-zinc-500">720×405 同时对应「首页 Banner / 首页信息流」，系统无法只凭尺寸判断，请手动选择实际用途。</div>
          </div>
          <div className="divide-y divide-zinc-100">
            {files.map(file => {
              const result = inspect(file)
              const selectedSpec = JIUYOU_SPECS.find(item => item.id === file.specId)
              return (
                <div key={file.id} className="grid gap-3 p-4 lg:grid-cols-[88px_minmax(0,1fr)_230px_170px] lg:items-center">
                  <img src={file.url} alt="" className="h-20 w-20 rounded-lg border border-zinc-200 object-cover" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-zinc-900">{file.file.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-[11px] font-bold text-zinc-700">{file.width} × {file.height}</span>
                      <span className="rounded bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-700">{formatBytes(file.file.size)}</span>
                      <span className="rounded bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-700">{file.format}</span>
                    </div>
                    {selectedSpec && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold">
                        <span className={result.sizeOk ? 'text-emerald-600' : 'text-red-600'}>{result.sizeOk ? '✓' : '✕'} 尺寸</span>
                        <span className={result.bytesOk ? 'text-emerald-600' : 'text-red-600'}>{result.bytesOk ? '✓' : '✕'} 文件大小</span>
                        <span className={result.formatOk ? 'text-emerald-600' : 'text-red-600'}>{result.formatOk ? '✓' : '✕'} 格式</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black text-zinc-500">核对用途</label>
                    <select
                      value={file.specId}
                      onChange={event => setFiles(current => current.map(item => item.id === file.id ? { ...item, specId: event.target.value as JiuyouSpecId } : item))}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-800 outline-none focus:border-violet-400"
                    >
                      <option value="">请选择用途</option>
                      {JIUYOU_SPECS.map(spec => <option key={spec.id} value={spec.id}>{spec.name}｜{spec.dimension}</option>)}
                    </select>
                    {result.reasons.length > 0 && <div className="mt-1 text-[10px] font-semibold leading-relaxed text-red-600">{result.reasons.join('；')}</div>}
                  </div>
                  <div className="flex items-center justify-between gap-2 lg:justify-end">
                    {result.status === 'pass' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" />通过</span>
                    ) : result.status === 'fail' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-black text-red-700"><XCircle className="h-4 w-4" />不通过</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700">待选择</span>
                    )}
                    <button onClick={() => removeFile(file.id)} className="rounded-md px-2 py-1 text-[11px] font-bold text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">删除</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold leading-relaxed text-amber-800">
        <b>自动验收范围：</b>尺寸、格式、文件大小。安全区、Logo 位置、是否含按钮/标题、圆形彩蛋造型、透明边距等视觉规范仍需人工确认；本页已把每个素材位的人工检查点固定显示，避免漏项。
      </div>
    </div>
  )
}
