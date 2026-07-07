'use client'

import { useState } from 'react'
import { Crop, FileImage, Package, Zap } from 'lucide-react'
import BannerCropBatchView from '@/components/banner-crop-batch-view'
import BannerCropView from '@/components/banner-crop-view'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function BannerCropSuiteView() {
  const [mode, setMode] = useState('pack')

  return (
    <Tabs value={mode} onValueChange={setMode} className="w-full">
      <div className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 min-[1440px]:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <TabsList className="h-9 rounded-lg">
            <TabsTrigger value="pack" className="h-7 gap-1.5 px-3 text-xs">
              <Package className="h-3.5 w-3.5" />
              一键出包
              <span className="rounded-sm bg-red-600 px-1 py-0 text-[9px] leading-4 text-white">测</span>
            </TabsTrigger>
            <TabsTrigger value="single" className="h-7 gap-1.5 px-3 text-xs">
              <Crop className="h-3.5 w-3.5" />
              单张裁剪
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileImage className="h-3.5 w-3.5" />
            <span>Banner 裁剪</span>
            <Badge className="border-red-600 bg-red-600 text-[10px] text-white hover:bg-red-600">
              新功能测试中
            </Badge>
            <Zap className="h-3.5 w-3.5 text-red-600" />
          </div>
        </div>
      </div>

      <TabsContent value="pack" className="m-0">
        <BannerCropBatchView />
      </TabsContent>
      <TabsContent value="single" className="m-0">
        <BannerCropView />
      </TabsContent>
    </Tabs>
  )
}
