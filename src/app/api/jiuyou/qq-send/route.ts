import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const QQ_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'
const QQ_API_BASE = 'https://api.sgroup.qq.com'
const MAX_ZIP_BYTES = 4 * 1024 * 1024
const DEFAULT_QQBOT_APP_ID = '1905575806'

function buildDefaultNotice(fileName: string) {
  return `【九游素材】验收已通过，素材包「${fileName}」已发到本群，请相关同学查收使用。`
}

function getConfig() {
  return {
    appId: process.env.QQBOT_APP_ID?.trim() || DEFAULT_QQBOT_APP_ID,
    appSecret: process.env.QQBOT_APP_SECRET?.trim() || '',
    groupOpenId: process.env.QQBOT_GROUP_OPENID?.trim() || '',
  }
}

function cleanFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120) || '九游素材包.zip'
}

async function getAccessToken(appId: string, appSecret: string) {
  const response = await fetch(QQ_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, clientSecret: appSecret }),
    cache: 'no-store',
  })

  const text = await response.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // Keep an empty object and surface the raw response below.
  }

  if (!response.ok || typeof data.access_token !== 'string' || !data.access_token) {
    const message = typeof data.message === 'string' ? data.message : text || `HTTP ${response.status}`
    throw new Error(`QQ 鉴权失败：${message}`)
  }

  return data.access_token
}

async function sendGroupTextMessage(
  groupOpenId: string,
  token: string,
  content: string
): Promise<{ ok: boolean; error?: string; traceId?: string }> {
  try {
    const response = await fetch(
      `${QQ_API_BASE}/v2/groups/${encodeURIComponent(groupOpenId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `QQBot ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msg_type: 0,
          content,
        }),
        cache: 'no-store',
      }
    )

    const responseText = await response.text()
    let data: Record<string, unknown> = {}
    try {
      data = responseText ? JSON.parse(responseText) : {}
    } catch {
      // Keep empty object if JSON parse fails.
    }

    const traceId = response.headers.get('x-tps-trace-id') || undefined

    if (!response.ok) {
      const message =
        typeof data.message === 'string'
          ? data.message
          : responseText || `HTTP ${response.status}`
      return { ok: false, error: message, traceId }
    }

    return { ok: true, traceId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '群文本消息发送失败',
    }
  }
}

export async function GET() {
  const config = getConfig()
  return NextResponse.json({
    configured: Boolean(config.appId && config.appSecret && config.groupOpenId),
    appConfigured: Boolean(config.appId && config.appSecret),
    groupConfigured: Boolean(config.groupOpenId),
  })
}

export async function POST(request: NextRequest) {
  try {
    const config = getConfig()
    if (!config.appId || !config.appSecret || !config.groupOpenId) {
      return NextResponse.json({
        error: 'QQ群自动发送尚未配置完成',
        missing: [
          !config.appId ? 'QQBOT_APP_ID' : null,
          !config.appSecret ? 'QQBOT_APP_SECRET' : null,
          !config.groupOpenId ? 'QQBOT_GROUP_OPENID' : null,
        ].filter(Boolean),
      }, { status: 503 })
    }

    const formData = await request.formData()
    const zip = formData.get('file')
    const packageName = String(formData.get('packageName') || '').trim()
    const customNotice = String(formData.get('notice') || '').trim()

    if (!(zip instanceof File)) {
      return NextResponse.json({ error: '没有收到 ZIP 文件' }, { status: 400 })
    }
    if (zip.size <= 0) {
      return NextResponse.json({ error: 'ZIP 文件为空' }, { status: 400 })
    }
    if (zip.size > MAX_ZIP_BYTES) {
      return NextResponse.json({
        error: `ZIP 超过 ${(MAX_ZIP_BYTES / 1024 / 1024).toFixed(0)}MB，当前 ${(zip.size / 1024 / 1024).toFixed(2)}MB`,
      }, { status: 413 })
    }

    const token = await getAccessToken(config.appId, config.appSecret)
    const buffer = Buffer.from(await zip.arrayBuffer())
    const fileName = cleanFileName(packageName || zip.name || '九游素材包.zip')

    const qqResponse = await fetch(
      `${QQ_API_BASE}/v2/groups/${encodeURIComponent(config.groupOpenId)}/files`,
      {
        method: 'POST',
        headers: {
          Authorization: `QQBot ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_type: 4,
          file_data: buffer.toString('base64'),
          file_name: fileName,
          srv_send_msg: true,
        }),
        cache: 'no-store',
      },
    )

    const responseText = await qqResponse.text()
    let qqData: Record<string, unknown> = {}
    try {
      qqData = responseText ? JSON.parse(responseText) : {}
    } catch {
      // Surface the raw response below if needed.
    }

    if (!qqResponse.ok) {
      const message = typeof qqData.message === 'string'
        ? qqData.message
        : responseText || `HTTP ${qqResponse.status}`
      return NextResponse.json({
        error: `QQ 发送失败：${message}`,
        qqStatus: qqResponse.status,
        traceId: qqResponse.headers.get('x-tps-trace-id') || undefined,
      }, { status: 502 })
    }

    const noticeContent = customNotice || buildDefaultNotice(fileName)
    const textResult = await sendGroupTextMessage(
      config.groupOpenId,
      token,
      noticeContent
    )

    return NextResponse.json({
      ok: true,
      sent: true,
      fileName,
      size: zip.size,
      fileUuid: typeof qqData.file_uuid === 'string' ? qqData.file_uuid : undefined,
      ttl: typeof qqData.ttl === 'number' ? qqData.ttl : undefined,
      traceId: qqResponse.headers.get('x-tps-trace-id') || undefined,
      noticeSent: textResult.ok,
      noticeError: textResult.ok ? undefined : textResult.error,
      noticeTraceId: textResult.traceId,
    })
  } catch (error) {
    console.error('[jiuyou qq-send]', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'QQ群发送失败',
    }, { status: 500 })
  }
}
