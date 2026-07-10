import { NextRequest, NextResponse } from 'next/server'

export const ADMIN_ACTION_HEADER = 'x-qdsc-admin-token'

function getAdminToken() {
  return (
    process.env.QDSC_ADMIN_TOKEN ||
    process.env.ADMIN_ACTION_TOKEN ||
    process.env.ADMIN_PASSWORD ||
    ''
  ).trim()
}

export function requireAdminAction(req: NextRequest) {
  const expectedToken = getAdminToken()
  if (!expectedToken) {
    return NextResponse.json(
      { error: '未配置管理口令，请在环境变量 QDSC_ADMIN_TOKEN 中设置后再执行此操作' },
      { status: 503 },
    )
  }

  const providedToken = (req.headers.get(ADMIN_ACTION_HEADER) || '').trim()
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json(
      { error: '管理口令错误或缺失' },
      { status: 401 },
    )
  }

  return null
}
