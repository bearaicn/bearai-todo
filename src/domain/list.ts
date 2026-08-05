export interface TodoList {
  schema: 'bearai.todo/list@1'; id: string; revision: number; name: string
  groupId?: string | null; order: number; archived: boolean
  createdAt: string; updatedAt: string; extra: Record<string, unknown>
}
export interface ListGroup {
  schema: 'bearai.todo/group@1'; id: string; revision: number; name: string
  order: number; collapsed: boolean; archived: boolean
  createdAt: string; updatedAt: string; extra: Record<string, unknown>
}

