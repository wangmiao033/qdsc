import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Vercel Serverless SQLite 兼容层
 * - Vercel 函数目录是只读的，数据库文件需要复制到 /tmp 才能写入
 * - 首次访问时自动将仓库中的 db 复制到 /tmp
 */
function getDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL
  if (!envUrl) {
    // 默认值
    return 'file:./db/custom.db'
  }

  // 如果是 file: 协议且运行在 Vercel (production) 环境
  if (envUrl.startsWith('file:') && process.env.VERCEL) {
    const relativePath = envUrl.replace('file:', '')
    const sourcePath = path.join(process.cwd(), relativePath)
    const tmpDir = '/tmp/qdsc-db'
    const tmpDbPath = path.join(tmpDir, 'custom.db')

    // 确保目录存在
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    // 如果 /tmp 中还没有数据库，从源复制过去
    if (!fs.existsSync(tmpDbPath)) {
      try {
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, tmpDbPath)
          console.log(`[DB] Copied ${sourcePath} -> ${tmpDbPath}`)
        } else {
          // 源文件不存在，创建空数据库
          console.log(`[DB] Source not found at ${sourcePath}, creating new DB at ${tmpDbPath}`)
        }
      } catch (err) {
        console.error(`[DB] Copy failed:`, err)
      }
    }

    return `file:${tmpDbPath}`
  }

  return envUrl
}

const dbUrl = getDatabaseUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: dbUrl.startsWith('file:') ? dbUrl : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db