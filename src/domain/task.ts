export type TaskStatus = 'active' | 'completed'
export interface TaskStep { id: string; title: string; completed: boolean }
export interface Task {
  schema: 'bearai.todo/task@1'; id: string; revision: number; title: string
  listId: string; status: TaskStatus; important: boolean; myDay?: string | null
  due?: string | null; reminder?: string | null; repeat?: Record<string, unknown> | null
  tags: string[]; steps: TaskStep[]; attachments: unknown[]
  createdAt: string; updatedAt: string; completedAt?: string | null
  note: string; extra: Record<string, unknown>
}
export class RevisionConflictError extends Error {
  constructor(public readonly expected: number, public readonly actual: number) {
    super(`任务已被外部修改（期望 revision ${expected}，实际 ${actual}）`)
  }
}

