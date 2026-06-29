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
  orientation: 'portrait' | 'landscape'
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
  { key: '720x405', width: 720, height: 405 },
  { key: '800x450', width: 800, height: 450 },
  { key: '960x540', width: 960, height: 540 },
  { key: '1280x720', width: 1280, height: 720 },
  { key: '1600x900', width: 1600, height: 900 },
  { key: '1920x1080', width: 1920, height: 1080 },
  { key: '800x600', width: 800, height: 600 },
  { key: '1024x768', width: 1024, height: 768 },
  { key: '1200x900', width: 1200, height: 900 },
  { key: '900x600', width: 900, height: 600 },
  { key: '1200x800', width: 1200, height: 800 },
  { key: '1500x1000', width: 1500, height: 1000 },
  { key: '1600x960', width: 1600, height: 960 },
  { key: '1000x500', width: 1000, height: 500 },
  { key: '1600x800', width: 1600, height: 800 },
  { key: '1920x960', width: 1920, height: 960 },
  { key: '2000x1000', width: 2000, height: 1000 },
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
    orientation: 'portrait',
    ratioLabel: '输出 360x640 / 608x1080 / 720x1280 / 1080x1920',
    label: '主流竖图母版',
    sizes: ['360x640', '608x1080', '720x1280', '1080x1920'],
  },
  {
    code: '02',
    master: '960x1600',
    orientation: 'portrait',
    ratioLabel: '输出 370x625 / 375x625 / 480x800 / 750x1250 / 960x1600',
    label: '中竖图母版',
    sizes: ['370x625', '375x625', '480x800', '750x1250', '960x1600'],
  },
  {
    code: '03',
    master: '640x960',
    orientation: 'portrait',
    ratioLabel: '输出 640x960',
    label: '竖图母版',
    sizes: ['640x960'],
  },
  {
    code: '04',
    master: '750x1350',
    orientation: 'portrait',
    ratioLabel: '输出 480x835 / 750x1350',
    label: '特殊竖图母版',
    sizes: ['480x835', '750x1350'],
  },
  {
    code: '05',
    master: '1920x1080',
    orientation: 'landscape',
    ratioLabel: '输出 960x540 / 1280x720 / 1920x1080',
    label: '1920x1080 横版主图母版',
    sizes: ['960x540', '1280x720', '1920x1080'],
  },
  {
    code: '06',
    master: '1200x900',
    orientation: 'landscape',
    ratioLabel: '输出 800x600 / 1024x768 / 1200x900',
    label: '1200x900 横版 4:3 母版',
    sizes: ['800x600', '1024x768', '1200x900'],
  },
  {
    code: '07',
    master: '1500x1000',
    orientation: 'landscape',
    ratioLabel: '输出 900x600 / 1200x800 / 1500x1000',
    label: '1500x1000 横版 3:2 母版',
    sizes: ['900x600', '1200x800', '1500x1000'],
  },
  {
    code: '08',
    master: '2000x1000',
    orientation: 'landscape',
    ratioLabel: '输出 1000x500 / 1600x800 / 1920x960 / 2000x1000',
    label: '2000x1000 宽横版母版',
    sizes: ['1000x500', '1600x800', '1920x960', '2000x1000'],
  },
  {
    code: '09',
    master: '1600x900',
    orientation: 'landscape',
    ratioLabel: '输出 720x405 / 800x450 / 1600x900',
    label: '1600x900 横版 16:9 母版',
    sizes: ['720x405', '800x450', '1600x900'],
  },
  {
    code: '10',
    master: '1600x960',
    orientation: 'landscape',
    ratioLabel: '输出 1600x960',
    label: '1600x960 横版 5:3 母版',
    sizes: ['1600x960'],
  },
]

export const STORE_ZIP_ROOT = 'store-screenshot-output'

export const STORE_SLOT_COUNT = 5

export const STORE_TOTAL_OUTPUTS = STORE_OUTPUT_SIZES.length * STORE_SLOT_COUNT
