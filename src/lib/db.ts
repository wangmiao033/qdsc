import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Vercel Serverless SQLite 兼容层
 *
 * 核心问题：Vercel 函数目录是只读的，SQLite 需要写入 WAL 文件
 * 解决方案：将数据库文件从部署目录复制到 /tmp 可写目录
 *
 * 注意：Vercel Serverless 的 /tmp 是临时的（冷启动后清空）
 * - 读操作：每次冷启动会从源文件重新复制，数据完整
 * - 写操作：写入的数据在当前实例生命周期内有效，但冷启动后会丢失
 * - 对于素材规格库这种以读为主的场景，这是可接受的
 */
function resolveDatabasePath(): string {
  const isVercel = !!process.env.VERCEL

  // 确定 DB 源文件路径（在部署目录中，只读）
  const cwd = process.cwd()
  const possibleSourcePaths = [
    path.join(cwd, 'db', 'custom.db'),        // 标准路径
    path.join(cwd, '.next', 'server', 'db', 'custom.db'), // Next.js standalone
    path.join(cwd, 'api', 'db', 'custom.db'),  // Vercel Serverless Functions
  ]

  let sourcePath = ''
  for (const p of possibleSourcePaths) {
    if (fs.existsSync(p)) {
      sourcePath = p
      console.log(`[DB] Found database at: ${p} (${(fs.statSync(p).size / 1024).toFixed(1)}KB)`)
      break
    }
  }

  if (!isVercel) {
    // 本地开发环境：直接使用源文件
    const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
    console.log(`[DB] Local mode, using: ${dbUrl}`)
    return dbUrl
  }

  // Vercel 环境：复制到 /tmp
  const tmpDir = '/tmp/qdsc-db'
  const tmpDbPath = path.join(tmpDir, 'custom.db')

  try {
    // 确保 /tmp 目录存在
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    // 始终从源重新复制（确保数据最新）
    if (sourcePath) {
      fs.copyFileSync(sourcePath, tmpDbPath)
      console.log(`[DB] Vercel mode: copied ${sourcePath} -> ${tmpDbPath}`)
    } else {
      // 源文件不存在，如果 /tmp 也没有就创建空库
      if (!fs.existsSync(tmpDbPath)) {
        console.log(`[DB] Vercel mode: source not found, creating empty DB at ${tmpDbPath}`)
        // Prisma 会在连接时自动创建表结构（如果使用 db push）
      }
    }
  } catch (err) {
    console.error(`[DB] Vercel copy failed:`, err)
  }

  return `file:${tmpDbPath}`
}

const dbUrl = resolveDatabasePath()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: dbUrl.startsWith('file:') ? dbUrl : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
