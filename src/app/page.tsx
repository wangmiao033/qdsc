'use client'

import { useEffect, useState } from 'react'
import { Ruler } from 'lucide-react'
import LegacyMainPage from '@/components/legacy-main-page'
import JiuyouSpecValidator from '@/components/jiuyou-spec-validator'

const SIDEBAR_GROUPS = [
  {
    label: '总览',
    items: [
      ['dashboard', '工作台'],
      ['productionBoard', '生产看板'],
      ['sizeWorkflow', '按尺寸生产'],
    ],
  },
  {
    label: '流程',
    items: [
      ['specs', '素材规格库'],
      ['categorize', '智能归类'],
      ['digest', '需求消化'],
      ['tasks', '任务生成器'],
      ['acceptance', '素材验收'],
      ['assetTransit', '素材中转站'],
    ],
  },
  {
    label: '图片工具',
    items: [
      ['iconCrop', 'Icon 裁剪'],
      ['bannerCrop', 'Banner 裁剪'],
      ['aiSafeOutpaint', 'AI 安全扩图'],
      ['storeScreenshot', '商店五图母版裁剪'],
      ['quickResize', '快速改图'],
      ['imageConvert', '格式转换'],
      ['jiuyouSpecs', '九游规格整理'],
    ],
  },
  {
    label: '记录',
    items: [['logs', '更新日志']],
  },
] as const

function readView() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('view') || ''
}

function go(view: string) {
  window.location.href = `/?view=${encodeURIComponent(view)}`
}

function injectJiuyouNavEntry() {
  if (typeof document === 'undefined' || document.getElementById('qdsc-jiuyou-nav-entry')) return true

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button,a,[role="button"]'))
  const formatItem = candidates.find(node => node.textContent?.replace(/\s+/g, ' ').trim() === '格式转换')
  if (!formatItem) return false

  const entry = document.createElement('button')
  entry.id = 'qdsc-jiuyou-nav-entry'
  entry.type = 'button'
  entry.className = formatItem.className
  entry.setAttribute('title', '九游规格整理：1:1 核对九游图片尺寸')
  entry.innerHTML = `<span aria-hidden="true" style="display:inline-flex;width:16px;align-items:center;justify-content:center;font-weight:900">✓</span><span>九游规格整理</span>`
  entry.onclick = () => go('jiuyouSpecs')
  formatItem.insertAdjacentElement('afterend', entry)
  return true
}

function JiuyouShell() {
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-zinc-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-[82px] items-center gap-3 border-b border-zinc-100 px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-sm font-black text-white">▥</div>
          <div>
            <div className="text-sm font-black">素材工作台</div>
            <div className="text-[10px] font-semibold text-zinc-400">游戏素材综合管理</div>
          </div>
        </div>
        <div className="border-b border-zinc-100 p-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-400">搜索功能...</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {SIDEBAR_GROUPS.map(group => (
            <div key={group.label} className="mb-4">
              <div className="mb-1 px-2 text-[10px] font-black text-zinc-400">{group.label}</div>
              <div className="space-y-1">
                {group.items.map(([id, label]) => {
                  const active = id === 'jiuyouSpecs'
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => go(id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold transition ${active ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'}`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center text-[10px] ${active ? 'text-violet-300' : 'text-zinc-400'}`}>{active ? '✓' : '◇'}</span>
                      <span>{label}</span>
                      {active && <span className="ml-auto rounded bg-violet-500 px-1.5 py-0.5 text-[9px] font-black text-white">九游</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-[200px]">
        <header className="sticky top-0 z-20 flex h-[56px] items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur md:px-5">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-violet-600" />
            <div>
              <div className="text-xs font-black text-zinc-900">图片工具</div>
              <div className="text-[10px] font-semibold text-zinc-400">九游规格整理</div>
            </div>
          </div>
          <button onClick={() => go('bannerCrop')} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-600 shadow-sm hover:bg-zinc-50">返回 Banner 裁剪</button>
        </header>
        <main><JiuyouSpecValidator /></main>
      </div>
    </div>
  )
}

export default function Page() {
  const [view, setView] = useState('')

  useEffect(() => {
    const sync = () => setView(readView())
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  useEffect(() => {
    if (view === 'jiuyouSpecs') return
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (injectJiuyouNavEntry() || attempts > 30) window.clearInterval(timer)
    }, 150)
    return () => window.clearInterval(timer)
  }, [view])

  if (view === 'jiuyouSpecs') return <JiuyouShell />
  return <LegacyMainPage />
}
