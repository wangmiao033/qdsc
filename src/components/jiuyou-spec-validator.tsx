'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import {
  Bot,
  CheckCircle2,
  Copy,
  Download,
  Info,
  Loader2,
  PackageCheck,
  RotateCcw,
  Ruler,
  Send,
  Upload,
  XCircle,
} from 'lucide-react'

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

type QqStatus = {
  configured: boolean
  appConfigured: boolean
  groupConfigured: boolean
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
    if (lower.includes('banner')) return 'banner'
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

function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|\r\n]/g, '_').replace(/\s+/g, ' ').trim() || '九游素材包'
}

function makeTimeStamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
}

export default function JiuyouSpecValidator() {
  const [files, setFiles] = useState<CheckedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [packageName, setPackageName] = useState('九游素材包')
  const [packaging, setPackaging] = useState(false)
  const [sending, setSending] = useState(false)
  const [qqStatus, setQqStatus] = useState<QqStatus | null>(null)
  const [deliveryMessage, setDeliveryMessage] = useState('')
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

  const canPackage = summary.total > 0 && summary.pass === summary.total && summary.fail === 0 && summary.pending === 0

  const refreshQqStatus = async () => {
    try {
      const response = await fetch('/api/jiuyou/qq-send', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as QqStatus
      setQqStatus(data)
    } catch {
      setQqStatus({ configured: false, appConfigured: false, groupConfigured: false })
    }
  }

  useEffect(() => {
    void refreshQqStatus()
  }, [])

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
    setDeliveryMessage('')
  }

  const clearAll = () => {
    files.forEach(file => URL.revokeObjectURL(file.url))
    setFiles([])
    setDeliveryMessage('')
  }

  const removeFile = (id: string) => {
    setFiles(current => {
      const target = current.find(item => item.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return current.filter(item => item.id !== id)
    })
    setDeliveryMessage('')
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
    setDeliveryMessage('验收结果已复制')
  }

  const createZipPackage = async () => {
    if (!canPackage) throw new Error('还有未通过或未选择用途的图片，不能打包')

    const zip = new JSZip()
    const manifest: string[] = [
      '【九游素材验收清单】',
      `打包时间：${new Date().toLocaleString('zh-CN')}`,
      `通过数量：${summary.pass}/${summary.total}`,
      '',
    ]

    files.forEach((item, index) => {
      const spec = JIUYOU_SPECS.find(specItem => specItem.id === item.specId)
      const result = inspect(item)
      const specName = spec?.name || '未分类'
      const safeOriginal = sanitizeName(item.file.name)
      const zipPath = `${String(index + 1).padStart(2, '0')}_${sanitizeName(specName)}_${safeOriginal}`
      zip.file(zipPath, item.file)
      manifest.push(`✅ ${specName}｜${item.width}×${item.height}｜${formatBytes(item.file.size)}｜${item.file.name}｜${result.status === 'pass' ? '通过' : result.reasons.join('；')}`)
    })

    zip.file('九游验收结果.txt', `\uFEFF${manifest.join('\r\n')}`)
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    const zipName = `${sanitizeName(packageName)}_${makeTimeStamp()}.zip`
    return { blob, zipName }
  }

  const downloadPackage = async () => {
    if (!canPackage) {
      setDeliveryMessage(`不能打包：不通过 ${summary.fail} 张，待选择用途 ${summary.pending} 张`)
      return
    }

    setPackaging(true)
    setDeliveryMessage('')
    try {
      const { blob, zipName } = await createZipPackage()
      saveAs(blob, zipName)
      setDeliveryMessage(`已生成 ${zipName}，共 ${summary.pass} 张通过素材`)
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : '打包失败')
    } finally {
      setPackaging(false)
    }
  }

  const sendPackageToQq = async () => {
    if (!canPackage) {
      setDeliveryMessage(`不能发送：不通过 ${summary.fail} 张，待选择用途 ${summary.pending} 张`)
      return
    }

    setSending(true)
    setDeliveryMessage('正在打包并发送到 QQ 群…')
    try {
      const { blob, zipName } = await createZipPackage()
      const formData = new FormData()
      formData.append('file', new File([blob], zipName, { type: 'application/zip' }))
      formData.append('packageName', zipName)
      formData.append('passedCount', String(summary.pass))

      const specNames = [...new Set(files.map(f => JIUYOU_SPECS.find(s => s.id === f.specId)?.name).filter(Boolean))]
      const notice = `【九游素材】验收已通过，共 ${summary.pass} 张素材（${specNames.join('、')}），素材包「${zipName}」已发到本群，请相关同学查收使用。`
      formData.append('notice', notice)

      const response = await fetch('/api/jiuyou/qq-send', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json().catch(() => ({})) as {
        error?: string
        missing?: string[]
        fileName?: string
        noticeSent?: boolean
        noticeError?: string
      }

      if (!response.ok) {
        const missing = Array.isArray(data.missing) && data.missing.length ? `（缺少：${data.missing.join('、')}）` : ''
        throw new Error(`${data.error || `QQ群发送失败 HTTP ${response.status}`}${missing}`)
      }

      if (data.noticeSent) {
        setDeliveryMessage(`✅ 已自动发送到 QQ 群：${data.fileName || zipName}（含文字通知）`)
      } else {
        setDeliveryMessage(`✅ 已自动发送到 QQ 群：${data.fileName || zipName}（⚠️ 文字通知失败：${data.noticeError || '未知错误'}）`)
      }
      await refreshQqStatus()
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : 'QQ群发送失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-violet-600 p-2 text-white"><Ruler className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-black text-zinc-950">九游规格整理</h1>
              <p className="mt-0.5 text-xs font-semibold text-zinc-500">严格按像素 1:1 核对 · 验收通过后可一键打包并自动发到 QQ 群</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <section className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-violet-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-zinc-950">
              <PackageCheck className="h-4 w-4 text-sky-600" />验收完成 → ZIP 打包 → QQ 群
            </div>
            <div className="mt-1 text-[11px] font-semibold text-zinc-500">只有全部图片通过后，打包和自动发送按钮才会启用。</div>
          </div>
          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black ${qqStatus?.configured ? 'bg-emerald-100 text-emerald-700' : qqStatus === null ? 'bg-zinc-100 text-zinc-500' : 'bg-amber-100 text-amber-700'}`}>
            <Bot className="h-3.5 w-3.5" />
            {qqStatus === null ? '检查 QQ 机器人…' : qqStatus.configured ? 'QQ群自动发送已连接' : 'QQ群自动发送待配置'}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-1 block text-[10px] font-black text-zinc-500">素材包名称</label>
            <input
              value={packageName}
              onChange={event => setPackageName(event.target.value)}
              placeholder="例如：云上征途_九游素材"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800 outline-none focus:border-violet-400"
            />
            <div className="mt-1 text-[10px] font-semibold text-zinc-400">系统会自动追加时间戳，并在 ZIP 内附带「九游验收结果.txt」。</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadPackage}
              disabled={!canPackage || packaging || sending}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {packaging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              下载 ZIP
            </button>
            <button
              onClick={sendPackageToQq}
              disabled={!canPackage || packaging || sending || !qqStatus?.configured}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sky-600 px-4 text-xs font-black text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? '发送中…' : '打包并发 QQ 群'}
            </button>
          </div>
        </div>

        {!canPackage && files.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-[11px] font-bold text-amber-700">
            当前还不能打包：不通过 {summary.fail} 张 · 待选择用途 {summary.pending} 张。
          </div>
        )}
        {qqStatus && !qqStatus.configured && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800">
            QQ 自动发送代码已就位，但生产环境还缺配置：{!qqStatus.appConfigured ? '机器人 AppID / AppSecret' : ''}{!qqStatus.appConfigured && !qqStatus.groupConfigured ? ' + ' : ''}{!qqStatus.groupConfigured ? '目标群 Group OpenID' : ''}。配置完成后本按钮会自动变为可用。
          </div>
        )}
        {deliveryMessage && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] font-bold ${deliveryMessage.startsWith('✅') || deliveryMessage.includes('已生成') || deliveryMessage.includes('已复制') ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-white/80 text-zinc-700'}`}>
            {deliveryMessage}
          </div>
        )}
      </section>

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
                      onChange={event => {
                        setFiles(current => current.map(item => item.id === file.id ? { ...item, specId: event.target.value as JiuyouSpecId } : item))
                        setDeliveryMessage('')
                      }}
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
