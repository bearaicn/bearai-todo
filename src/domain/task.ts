export type TaskStatus = 'active' | 'completed' | 'voided'
export type TaskKind = 'simple'|'advanced'
export type RepeatRule = {frequency:'daily'|'weekly'|'monthly'|'yearly';interval:number}
export interface TaskAttachment {id:string;name:string;relativePath:string;mime:string;size:number;createdAt:string;role?:'attachment'|'inline'}
export interface UserIdentity {id:string;name:string;email:string}
export interface TaskComment {id:string;taskId:string;parentCommentId:string|null;authorId:string;body:string;createdAt:string;updatedAt:string;revision:number}
export interface TaskStatusEvent {status:TaskStatus;at:string;reason?:string}
export interface Task {
  schema: 'bearai.todo/task@1'|'bearai.todo/task@2'; id: string; revision: number; title: string
  projectId:string; listId?: string; status: TaskStatus; favorite:boolean; important?: boolean; myDay?: string | null
  parentId?: string | null
  order?: number
  kind?:TaskKind; due?: string | null; reminder?: string | null; repeat?: RepeatRule | null; assigneeIds?:string[]
  tags: string[]; attachments: TaskAttachment[]
  createdAt: string; updatedAt: string; completedAt?: string | null; voidedAt?:string|null;voidReason?:string|null;statusHistory?:TaskStatusEvent[]
  recurrenceSourceId?:string|null;seriesKey?:string|null;instanceKey?:string|null;validOn?:string|null;rollover?:'allowed'|'forbidden'
  note: string; extra: Record<string, unknown>
}
export class RevisionConflictError extends Error {
  constructor(public readonly expected: number, public readonly actual: number) {
    super(`任务已被外部修改（期望 revision ${expected}，实际 ${actual}）`)
  }
}
export interface TaskPlacementDto {taskId:string;sourceProjectId:string;targetProjectId:string;targetParentId:string|null;beforeId?:string|null;afterId?:string|null;expectedRevision:number}
export interface EnsureTaskInstanceDto {title:string;projectId:string;parentId?:string|null;instanceKey:string;validOn:string;rollover:'allowed'|'forbidden';due?:string|null;repeat?:RepeatRule|null;note?:string;tags?:string[]}
