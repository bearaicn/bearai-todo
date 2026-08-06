export type TaskStatus = 'active' | 'completed'
export interface Task {
  schema: 'bearai.todo/task@1'|'bearai.todo/task@2'; id: string; revision: number; title: string
  projectId:string; listId?: string; status: TaskStatus; favorite:boolean; important?: boolean; myDay?: string | null
  parentId?: string | null
  due?: string | null; reminder?: string | null; repeat?: Record<string, unknown> | null
  tags: string[]; attachments: unknown[]
  createdAt: string; updatedAt: string; completedAt?: string | null
  note: string; extra: Record<string, unknown>
}
export class RevisionConflictError extends Error {
  constructor(public readonly expected: number, public readonly actual: number) {
    super(`任务已被外部修改（期望 revision ${expected}，实际 ${actual}）`)
  }
}
