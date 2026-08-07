export type TaskStatus = 'active' | 'completed'
export type TaskKind = 'simple'|'advanced'
export type RepeatRule = {frequency:'daily'|'weekly'|'monthly'|'yearly';interval:number}
export interface TaskAttachment {id:string;name:string;relativePath:string;mime:string;size:number;createdAt:string}
export interface UserIdentity {id:string;name:string;email:string}
export interface TaskComment {id:string;taskId:string;parentCommentId:string|null;authorId:string;body:string;createdAt:string;updatedAt:string;revision:number}
export interface Task {
  schema: 'bearai.todo/task@1'|'bearai.todo/task@2'; id: string; revision: number; title: string
  projectId:string; listId?: string; status: TaskStatus; favorite:boolean; important?: boolean; myDay?: string | null
  parentId?: string | null
  kind?:TaskKind; due?: string | null; reminder?: string | null; repeat?: RepeatRule | null; assigneeIds?:string[]
  tags: string[]; attachments: TaskAttachment[]
  createdAt: string; updatedAt: string; completedAt?: string | null
  note: string; extra: Record<string, unknown>
}
export class RevisionConflictError extends Error {
  constructor(public readonly expected: number, public readonly actual: number) {
    super(`任务已被外部修改（期望 revision ${expected}，实际 ${actual}）`)
  }
}
