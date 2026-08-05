import { randomUUID } from 'node:crypto'
import type { ListGroup, TodoList } from '../domain/list.js'
import { AtomicMarkdownRepository } from './atomicMarkdownRepository.js'
import { parseGroup, parseList, serializeGroup, serializeList } from './metadataCodec.js'

export class ListRepository {
  private lists; private groups
  constructor(root:string){this.lists=new AtomicMarkdownRepository(root,'lists',parseList,serializeList);this.groups=new AtomicMarkdownRepository(root,'groups',parseGroup,serializeGroup)}
  async listAll(includeArchived=false){return (await this.lists.list()).filter(item=>includeArchived||!item.archived).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name))}
  async groupAll(includeArchived=false){return (await this.groups.list()).filter(item=>includeArchived||!item.archived).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name))}
  async createList(name:string,groupId:string|null=null){const now=new Date().toISOString();const existing=await this.lists.list();const value:TodoList={schema:'bearai.todo/list@1',id:randomUUID(),revision:1,name:name.trim(),groupId,order:existing.length,archived:false,createdAt:now,updatedAt:now,extra:{}};if(!value.name)throw new Error('列表名称不能为空');return this.lists.insert(value)}
  saveList(value:TodoList,expectedRevision:number){if(value.id==='inbox')throw new Error('默认任务列表不能修改');return this.lists.save(value,expectedRevision)}
  async archiveList(value:TodoList){return this.saveList({...value,archived:true},value.revision)}
  async createGroup(name:string){const now=new Date().toISOString();const existing=await this.groups.list();const value:ListGroup={schema:'bearai.todo/group@1',id:randomUUID(),revision:1,name:name.trim(),order:existing.length,collapsed:false,archived:false,createdAt:now,updatedAt:now,extra:{}};if(!value.name)throw new Error('列表组名称不能为空');return this.groups.insert(value)}
  saveGroup(value:ListGroup,expectedRevision:number){return this.groups.save(value,expectedRevision)}
  async archiveGroup(value:ListGroup){return this.saveGroup({...value,archived:true},value.revision)}
}

