import { describe, expect, it } from 'vitest'
import type { Task } from '../src/domain/task'
import { childTasks, queryTasks } from '../src/domain/taskQueries'
function task(patch:Partial<Task>={}):Task{return{schema:'bearai.todo/task@2',id:crypto.randomUUID(),revision:1,title:'任务',projectId:'project-a',parentId:null,status:'active',favorite:false,tags:[],attachments:[],createdAt:'2026-08-05T00:00:00Z',updatedAt:'2026-08-05T00:00:00Z',note:'',extra:{},...patch}}
describe('smart task queries',()=>{
  const values=[task({id:'plain'}),task({id:'star',favorite:true}),task({id:'due',due:'2026-08-10'}),task({id:'done',status:'completed'}),task({id:'custom',projectId:'project-b'})]
  it('defines Today as every incomplete top-level task',()=>{expect(queryTasks(values,'today').map(x=>x.id).sort()).toEqual(['custom','due','plain','star'].sort())})
  it('queries favorites, planned, completed and projects',()=>{expect(queryTasks(values,'favorites').map(x=>x.id)).toEqual(['star']);expect(queryTasks(values,'planned').map(x=>x.id)).toEqual(['due']);expect(queryTasks(values,'completed').map(x=>x.id)).toEqual(['done']);expect(queryTasks(values,'project-b').map(x=>x.id)).toEqual(['custom'])})
})
describe('child tasks',()=>{
  it('keeps child tasks out of top-level views and returns them under the parent',()=>{const parent=task({id:'parent'}),child=task({id:'child',parentId:'parent'});expect(queryTasks([parent,child],'today').map(value=>value.id)).toEqual(['parent']);expect(childTasks([parent,child],'parent').map(value=>value.id)).toEqual(['child'])})
  it('does not cascade parent completion to children',()=>{const child=task({id:'child',parentId:'parent'}),completedParent=task({id:'parent',status:'completed'});expect(childTasks([completedParent,child],'parent')[0].status).toBe('active')})
})
