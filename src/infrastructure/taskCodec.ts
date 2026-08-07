import matter from 'gray-matter'
import type { Task } from '../domain/task.js'
const known = new Set(['schema','id','revision','title','projectId','listId','status','favorite','important','myDay','parentId','kind','due','reminder','repeat','assigneeIds','tags','attachments','createdAt','updatedAt','completedAt'])
export function parseTask(source: string): Task {
  const { data, content } = matter(source)
  if (data.schema !== 'bearai.todo/task@1'&&data.schema!=='bearai.todo/task@2') throw new Error('不支持的任务格式')
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !known.has(key)))
  return { ...data,projectId:data.projectId??data.listId??'inbox',favorite:data.favorite??data.important??false,parentId:data.parentId??null,kind:data.kind??'simple',assigneeIds:data.assigneeIds??[],tags:data.tags??[],attachments:data.attachments??[],note:content.replace(/^\n/,''),extra } as Task
}
export function serializeTask(task: Task): string {
  const { note, extra, ...data } = task
  return matter.stringify(note, { ...extra, ...data })
}
