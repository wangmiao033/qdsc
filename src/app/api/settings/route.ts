import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// 获取设置项
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }

  const setting = await db.systemSetting.findUnique({ where: { key } })
  if (!setting) {
    return NextResponse.json({ key, value: null })
  }

  return NextResponse.json({ key: setting.key, value: setting.value })
}

// 创建或更新设置项
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { key, value } = body

  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }

  const setting = await db.systemSetting.upsert({
    where: { key },
    update: { value: value || '' },
    create: { key, value: value || '' },
  })

  return NextResponse.json({ key: setting.key, value: setting.value })
}
