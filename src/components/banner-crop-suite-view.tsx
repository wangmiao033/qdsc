'use client'

import { useState } from 'react'
import { Crop, FileImage, GitBranch, Package, Zap } from 'lucide-react'
import BannerCropBatchView from '@/components/banner-crop-batch-view'
import BannerMasterPackView from '@/components/banner-master-pack-view'
import BannerCropView from '@/components/banner-crop-view'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function BannerCropSuiteView() {
  const [mode, setMode] = useState('pack')
  const activeLabel = mode === 'pack' ? '一键出包' : mode === 'masterPack' ? '母版配对' : '单张裁剪'

  return (
    <Tabs value={mode} onValueChange={setMode} className="w-full">
      <div className="sticky top-0 z-20 border-b border-zinc-200/90 bg-[#fbfcff]/95 px-3 py-3 shadow-sm shadow-zinc-950/[0.03] backdrop-blur supports-[backdrop-filter]:bg-[#fbfcff]/80 sm:px-4 min-[1440px]:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 min-[920px]:flex-row min-[920px]:items-center min-[920px]:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-400">
              <FileImage className="h-3.5 w-3.5" />
              图片工具
            </div>
            <div className="mt-0.5 truncate text-base font-extrabold text-zinc-950">{activeLabel}</div>
          </div>

          <div className="min-w-0 overflow-x-auto pb-0.5">
            <TabsList className="h-10 w-max rounded-lg border-zinc-200 bg-zinc-100/80 p-1 shadow-inner shadow-zinc-950/[0.03]">
              <TabsTrigger value="pack" className="h-8 gap-1.5 px-3 text-xs">
              <Package className="h-3.5 w-3.5" />
              一键出包
              <span className="rounded-sm bg-red-600 px-1 py-0 text-[9px] leading-4 text-white">测</span>
              </TabsTrigger>
              <TabsTrigger value="masterPack" className="h-8 gap-1.5 px-3 text-xs">
              <GitBranch className="h-3.5 w-3.5" />
              母版配对
              <span className="rounded-sm bg-sky-600 px-1 py-0 text-[9px] leading-4 text-white">第一期 07</span>
              </TabsTrigger>
              <TabsTrigger value="single" className="h-8 gap-1.5 px-3 text-xs">
              <Crop className="h-3.5 w-3.5" />
              单张裁剪
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-500">
            <Badge variant="outline" className="border-zinc-200 bg-white text-[10px] font-bold text-zinc-600">
              Banner 裁剪
            </Badge>
            <Badge className="border-red-600 bg-red-600 text-[10px] font-bold text-white hover:bg-red-600">
              新功能测试中
            </Badge>
            <Zap className="h-3.5 w-3.5 text-red-600" />
          </div>
        </div>
      </div>

      <TabsContent value="pack" className="m-0">
        <BannerCropBatchView />
      </TabsContent>
      <TabsContent value="masterPack" className="m-0">
        <BannerMasterPackView />
      </TabsContent>
      <TabsContent value="single" className="m-0">
        <BannerCropView />
      </TabsContent>
    </Tabs>
  )
}
