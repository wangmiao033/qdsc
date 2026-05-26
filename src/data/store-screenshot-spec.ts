/** 商店五图母版规格（与 Banner 系统独立） */

export interface StoreScreenshotSlot {
  index: number
  fileName: string
  label: string
  description: string
}

export interface StoreOutputSize {
  key: string
  width: number
  height: number
}

export interface StoreScreenshotMaster {
  code: string
  master: string
  ratioLabel: string
  label: string
  sizes: string[]
}

export const STORE_SCREENSHOT_SLOTS: StoreScreenshotSlot[] = [
  { index: 1, fileName: '01', label: '图1', description: '玩法亮点图' },
  { index: 2, fileName: '02', label: '图2', description: '福利卖点图' },
  { index: 3, fileName: '03', label: '图3', description: '角色 / 战斗图' },
  { index: 4, fileName: '04', label: '图4', description: '养成系统图' },
  { index: 5, fileName: '05', label: '图5', description: '活动 / 特权图' },
]

export const STORE_OUTPUT_SIZES: StoreOutputSize[] = [
  { key: '360x640', width: 360, height: 640 },
  { key: '370x625', width: 370, height: 625 },
  { key: '375x625', width: 375, height: 625 },
  { key: '480x800', width: 480, height: 800 },
  { key: '480x835', width: 480, height: 835 },
  { key: '608x1080', width: 608, height: 1080 },
  { key: '640x960', width: 640, height: 960 },
  { key: '720x1280', width: 720, height: 1280 },
  { key: '750x1250', width: 750, height: 1250 },
  { key: '750x1350', width: 750, height: 1350 },
  { key: '960x1600', width: 960, height: 1600 },
  { key: '1080x1920', width: 1080, height: 1920 },
]

export const STORE_SCREENSHOT_MASTERS: StoreScreenshotMaster[] = [
  {
    code: '01',
    master: '1080x1920',
    ratioLabel: '9:16',
    label: '主流竖图母版',
    sizes: ['360x640', '608x1080', '720x1280', '1080x1920'],
  },
  {
    code: '02',
    master: '960x1600',
    ratioLabel: '3:5',
    label: '中竖图母版',
    sizes: ['370x625', '375x625', '480x800', '750x1250', '960x1600'],
  },
  {
    code: '03',
    master: '640x960',
    ratioLabel: '2:3',
    label: '竖图母版',
    sizes: ['640x960'],
  },
  {
    code: '04',
    master: '750x1350',
    ratioLabel: '特殊竖图',
    label: '特殊竖图母版',
    sizes: ['480x835', '750x1350'],
  },
]

export const STORE_ZIP_ROOT = 'store-screenshot-output'

export const STORE_SLOT_COUNT = 5

export const STORE_TOTAL_OUTPUTS = STORE_OUTPUT_SIZES.length * STORE_SLOT_COUNT
