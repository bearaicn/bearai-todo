import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'; import { tmpdir } from 'node:os'
import { TaskRepository } from '../src/infrastructure/taskRepository'; import { parseTask, serializeTask } from '../src/infrastructure/taskCodec'
const roots:string[]=[]; async function repo(){const root=await mkdtemp(join(tmpdir(),'bear-todo-'));roots.push(root);return{root,repository:new TaskRepository(root)}}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
describe('Markdown task repository',()=>{
  it('creates a readable task file',async()=>{const{root,repository}=await repo();const task=await repository.create('第一件事');const text=await readFile(join(root,'tasks',`${task.id}.md`),'utf8');expect(text).toContain('bearai.todo/task@1');expect(parseTask(text).title).toBe('第一件事')})
  it('lists tasks and persists a revisioned update',async()=>{const{repository}=await repo();const first=await repository.create('第一件事');const second=await repository.create('第二件事');const saved=await repository.save({...first,important:true},1);expect(saved.revision).toBe(2);expect((await repository.get(first.id)).important).toBe(true);expect((await repository.list()).map(task=>task.id)).toContain(second.id)})
  it('preserves unknown frontmatter and note body',()=>{const task=parseTask('---\nschema: bearai.todo/task@1\nid: abc\nrevision: 1\ntitle: T\nlistId: inbox\nstatus: active\nimportant: false\ncreatedAt: now\nupdatedAt: now\npluginValue:\n  nested: 42\n---\n原始正文\n');const round=parseTask(serializeTask(task));expect(round.extra.pluginValue).toEqual({nested:42});expect(round.note).toBe('原始正文\n')})
  it('rejects stale saves after an external edit',async()=>{const{root,repository}=await repo();const task=await repository.create('原任务');const path=join(root,'tasks',`${task.id}.md`);const external={...task,revision:2,title:'外部修改'};await writeFile(path,serializeTask(external),'utf8');await expect(repository.save({...task,title:'应用修改'},1)).rejects.toThrow('外部修改');expect((await repository.get(task.id)).title).toBe('外部修改')})
})
