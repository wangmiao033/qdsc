import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const maxDuration = 120

function getConfig() {
  const apiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY
  const baseUrl = (process.env.AI_IMAGE_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.AI_IMAGE_MODEL || 'gpt-image-1'
  const quality = process.env.AI_IMAGE_QUALITY || 'medium'
  const requestSize = process.env.AI_IMAGE_REQUEST_SIZE || 'auto'
  return { apiKey, baseUrl, model, quality, requestSize }
}

function getImageBase64(result: unknown) {
  const data = (result as { data?: Array<Record<string, unknown>> }).data
  const first = Array.isArray(data) ? data[0] : null
  if (!first) return null
  return (
    typeof first.b64_json === 'string' ? first.b64_json :
    typeof first.base64 === 'string' ? first.base64 :
    null
  )
}

export async function POST(request: NextRequest) {
  const { apiKey, baseUrl, model, quality, requestSize } = getConfig()

  if (!apiKey) {
    return NextResponse.json({
      error: 'AI 图片服务未配置。请在服务端环境变量中配置 AI_IMAGE_API_KEY 或 OPENAI_API_KEY。',
    }, { status: 503 })
  }

  const form = await request.formData()
  const image = form.get('image')
  const mask = form.get('mask')
  const prompt = String(form.get('prompt') || '').trim()
  const outputWidth = Number(form.get('width') || 0)
  const outputHeight = Number(form.get('height') || 0)

  if (!(image instanceof File) || !(mask instanceof File)) {
    return NextResponse.json({ error: '缺少 image 或 mask 文件' }, { status: 400 })
  }

  if (!prompt || !outputWidth || !outputHeight) {
    return NextResponse.json({ error: '缺少 prompt、width 或 height 参数' }, { status: 400 })
  }

  const upstreamForm = new FormData()
  upstreamForm.append('model', model)
  upstreamForm.append('image', image, image.name || 'input.png')
  upstreamForm.append('mask', mask, mask.name || 'mask.png')
  upstreamForm.append('prompt', prompt)
  upstreamForm.append('size', requestSize)
  upstreamForm.append('quality', quality)
  upstreamForm.append('n', '1')

  const response = await fetch(`${baseUrl}/images/edits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: upstreamForm,
  })

  const text = await response.text()
  let result: unknown = null
  try {
    result = text ? JSON.parse(text) : null
  } catch {
    result = null
  }

  if (!response.ok) {
    const message =
      (result as { error?: { message?: string } } | null)?.error?.message ||
      text ||
      `AI 图片编辑请求失败：${response.status}`
    return NextResponse.json({ error: message }, { status: response.status })
  }

  const base64 = getImageBase64(result)
  if (!base64) {
    return NextResponse.json({ error: 'AI 返回结果里没有图片数据' }, { status: 502 })
  }

  const normalized = await sharp(Buffer.from(base64, 'base64'))
    .resize(outputWidth, outputHeight, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer()

  return NextResponse.json({
    base64: normalized.toString('base64'),
    mimeType: 'image/png',
    model,
    size: `${outputWidth}x${outputHeight}`,
  })
}
