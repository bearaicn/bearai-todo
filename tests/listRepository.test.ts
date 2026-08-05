import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path';import { tmpdir } from 'node:os'
import { ListRepository } from '../src/infrastructure/listRepository'
import { parseList } from '../src/infrastructure/metadataCodec'
const roots:string[]=[];async function setup(){const root=await mkdtemp(join(tmpdir(),'bear-lists-'));roots.push(root);return{root,repository:new ListRepository(root)}}
afterEach(async()=>Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true}))))
describe('list and group Markdown repository',()=>{
  it('persists lists and groups as Markdown',async()=>{const{root,repository}=await setup();const group=await repository.createGroup('工作');const list=await repository.createList('项目',group.id);expect((await repository.groupAll())[0].name).toBe('工作');expect((await repository.listAll())[0].groupId).toBe(group.id);expect(await readFile(join(root,'lists',`${list.id}.md`),'utf8')).toContain('bearai.todo/list@1')})
  it('renames, orders and archives without deleting the file',async()=>{const{root,repository}=await setup();const list=await repository.createList('旧名称');const saved=await repository.saveList({...list,name:'新名称',order:7},list.revision);expect(saved.revision).toBe(2);await repository.archiveList(saved);expect(await repository.listAll()).toEqual([]);expect((await repository.listAll(true))[0].archived).toBe(true);expect(parseList(await readFile(join(root,'lists',`${list.id}.md`),'utf8')).name).toBe('新名称')})
  it('persists group rename, order and collapse before safe archive',async()=>{const{repository}=await setup();const group=await repository.createGroup('组');await repository.createList('成员',group.id);const saved=await repository.saveGroup({...group,name:'新组',order:3,collapsed:true},group.revision);expect(saved).toMatchObject({name:'新组',order:3,collapsed:true,revision:2});await repository.archiveGroup(saved);expect(await repository.groupAll()).toEqual([]);expect((await repository.listAll())[0].archived).toBe(false)})
})
