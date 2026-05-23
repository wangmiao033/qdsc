import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function DELETE() {
  await db.acceptanceResult.deleteMany({})
  await db.taskItem.deleteMany({})
  await db.batch.deleteMany({})
  const count = await db.materialSpec.count()
  await db.materialSpec.deleteMany({})
  return NextResponse.json({ deleted: count })
}
