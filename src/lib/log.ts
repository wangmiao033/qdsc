import { db } from '@/lib/db'

type LogAction = 'task_status' | 'task_remark' | 'task_create' | 'task_delete' | 'task_batch' | 'batch_create' | 'acceptance' | 'import' | 'export' | 'other'

export async function logActivity(params: {
  batchId?: string
  action: LogAction | string
  target?: string
  detail?: string
  meta?: Record<string, unknown>
}) {
  try {
    await db.activityLog.create({
      data: {
        batchId: params.batchId || null,
        action: params.action,
        target: params.target || '',
        detail: params.detail || '',
        meta: params.meta ? JSON.stringify(params.meta) : '',
      },
    })
  } catch {
    // Log silently - don't break the main operation
  }
}
