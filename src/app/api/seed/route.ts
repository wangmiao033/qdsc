import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function POST() {
  // Seed some demo data
  const channels = ['抖音', '微信', '快手', 'B站', '小红书', 'TapTap', 'App Store', 'Google Play']
  const materialTypes = [
    { name: '图标', w: 1024, h: 1024, fmt: 'PNG', size: 500, req: true, pri: '高' },
    { name: '开屏', w: 1080, h: 1920, fmt: 'PNG', size: 800, req: true, pri: '高' },
    { name: '横幅', w: 1200, h: 628, fmt: 'JPG', size: 300, req: true, pri: '普通' },
    { name: '信息流-竖版', w: 1080, h: 1440, fmt: 'JPG', size: 500, req: true, pri: '高' },
    { name: '信息流-方形', w: 1080, h: 1080, fmt: 'JPG', size: 500, req: false, pri: '普通' },
    { name: '详情页头图', w: 750, h: 420, fmt: 'PNG', size: 300, req: true, pri: '普通' },
    { name: '截图1', w: 1242, h: 2688, fmt: 'PNG', size: 1000, req: true, pri: '高' },
    { name: '截图2', w: 1242, h: 2688, fmt: 'PNG', size: 1000, req: true, pri: '高' },
    { name: '截图3', w: 1242, h: 2688, fmt: 'PNG', size: 1000, req: true, pri: '高' },
    { name: '宣传图-横版', w: 1920, h: 1080, fmt: 'PNG', size: 2000, req: false, pri: '普通' },
    { name: '宣传图-竖版', w: 1080, h: 1920, fmt: 'PNG', size: 2000, req: false, pri: '普通' },
    { name: '视频封面', w: 1280, h: 720, fmt: 'JPG', size: 500, req: true, pri: '普通' },
    { name: '广告图-小', w: 300, h: 250, fmt: 'JPG', size: 100, req: false, pri: '低' },
    { name: '广告图-大', w: 728, h: 90, fmt: 'JPG', size: 100, req: false, pri: '低' },
  ]

  let created = 0
  for (const ch of channels) {
    for (const mt of materialTypes) {
      // Skip some combinations to make it realistic
      if (ch === 'App Store' && !['图标', '截图1', '截图2', '截图3'].includes(mt.name)) continue
      if (ch === 'Google Play' && !['图标', '截图1', '截图2', '截图3', '开屏'].includes(mt.name)) continue
      if (ch === 'B站' && ['广告图-小', '广告图-大'].includes(mt.name)) continue

      await db.materialSpec.create({
        data: {
          channel: ch,
          name: mt.name,
          width: mt.w,
          height: mt.h,
          format: mt.fmt,
          maxSize: mt.size,
          isRequired: mt.req,
          copyLimit: mt.pri === '高' ? '不超过15个字' : '',
          forbidden: mt.pri === '高' ? '禁止使用竞品logo' : '',
          remark: '',
          priority: mt.pri,
        },
      })
      created++
    }
  }

  return NextResponse.json({ created })
}
