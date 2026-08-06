import matter from 'gray-matter'
import type { Task } from '../domain/task.js'
const known = new Set(['schema','id','revision','title','listId','status','important','myDay','parentId','due','reminder','repeat','tags','attachments','createdAt','updatedAt','completedAt'])
export function parseTask(source: string): Task {
  const { data, content } = matter(source)
  if (data.schema !== 'bearai.todo/task@1') throw new Error('不支持的任务格式')
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !known.has(key)))
  return { ...data, parentId:data.parentId??null, tags: data.tags ?? [], attachments: data.attachments ?? [], note: content.replace(/^\n/, ''), extra } as Task
}
export function serializeTask(task: Task): string {
  const { note, extra, ...data } = task
  return matter.stringify(note, { ...extra, ...data })
}
