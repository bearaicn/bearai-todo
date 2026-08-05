import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RevisionConflictError, type Task } from '../domain/task.js'
import { parseTask, serializeTask } from './taskCodec.js'
export class TaskRepository {
  constructor(private readonly root: string) {}
  private path(id: string) { if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('非法任务 ID'); return join(this.root, 'tasks', `${id}.md`) }
  async get(id: string) { return parseTask(await readFile(this.path(id), 'utf8')) }
  async list(): Promise<Task[]> {
    const directory = join(this.root, 'tasks')
    await mkdir(directory, { recursive: true })
    const names = (await readdir(directory)).filter(name => name.endsWith('.md'))
    const tasks = await Promise.all(names.map(name => readFile(join(directory, name), 'utf8').then(parseTask)))
    return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async create(title: string, listId = 'inbox'): Promise<Task> {
    const now = new Date().toISOString()
    const task: Task = { schema:'bearai.todo/task@1', id:randomUUID(), revision:1, title, listId, status:'active', important:false, tags:[], steps:[], attachments:[], createdAt:now, updatedAt:now, note:'', extra:{} }
    await this.atomicWrite(this.path(task.id), serializeTask(task)); return task
  }
  async save(task: Task, expectedRevision: number): Promise<Task> {
    const current = await this.get(task.id)
    if (current.revision !== expectedRevision) throw new RevisionConflictError(expectedRevision, current.revision)
    const next = { ...task, revision: current.revision + 1, updatedAt: new Date().toISOString() }
    await this.atomicWrite(this.path(task.id), serializeTask(next)); return next
  }
  private async atomicWrite(path: string, content: string) {
    await mkdir(dirname(path), { recursive: true }); const temp = `${path}.${randomUUID()}.tmp`
    const handle = await open(temp, 'wx'); try { await handle.writeFile(content, 'utf8'); await handle.sync() } finally { await handle.close() }
    try { await rename(temp, path) } catch (error) { await unlink(temp).catch(() => undefined); throw error }
  }
}
