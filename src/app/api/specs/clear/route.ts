import { db } from '@/lib/db'
import { requireAdminAction } from '@/lib/admin-auth'
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function DELETE(req: NextRequest) {
  const authError = requireAdminAction(req)
  if (authError) return authError

  await db.acceptanceResult.deleteMany({})
  await db.taskItem.deleteMany({})
  await db.batch.deleteMany({})
  const count = await db.materialSpec.count()
  await db.materialSpec.deleteMany({})
  return NextResponse.json({ deleted: count })
}
