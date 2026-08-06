import { describe, expect, it } from 'vitest'
import type { Task } from '../src/domain/task'
import { childTasks, localDateKey, myDaySuggestions, queryTasks } from '../src/domain/taskQueries'
function task(patch:Partial<Task>={}):Task{return{schema:'bearai.todo/task@1',id:crypto.randomUUID(),revision:1,title:'任务',listId:'inbox',parentId:null,status:'active',important:false,tags:[],attachments:[],createdAt:'2026-08-05T00:00:00Z',updatedAt:'2026-08-05T00:00:00Z',note:'',extra:{},...patch}}
describe('smart task queries',()=>{
  const today='2026-08-05';const values=[task({id:'day',myDay:today}),task({id:'star',important:true}),task({id:'due',due:'2026-08-10'}),task({id:'done',status:'completed'}),task({id:'custom',listId:'list-a'})]
  it('uses local calendar dates for My Day',()=>{expect(localDateKey(new Date(2026,7,5,23,30))).toBe(today);expect(queryTasks(values,'my-day',today).map(x=>x.id)).toEqual(['day'])})
  it('queries all six smart/default views and restores completed tasks by status',()=>{expect(queryTasks(values,'important').map(x=>x.id)).toContain('star');expect(queryTasks(values,'planned').map(x=>x.id)).toContain('due');expect(queryTasks(values,'all')).toHaveLength(4);expect(queryTasks(values,'completed').map(x=>x.id)).toEqual(['done']);expect(queryTasks(values,'inbox').map(x=>x.id)).not.toContain('custom');expect(queryTasks(values,'list-a').map(x=>x.id)).toEqual(['custom'])})
  it('suggests important and dated active tasks not already in My Day',()=>{expect(myDaySuggestions(values,today).map(x=>x.id)).toEqual(['star','due'])})
})
describe('child tasks',()=>{
  it('keeps child tasks out of top-level views and returns them under the parent',()=>{const parent=task({id:'parent'}),child=task({id:'child',parentId:'parent'});expect(queryTasks([parent,child],'all').map(value=>value.id)).toEqual(['parent']);expect(childTasks([parent,child],'parent').map(value=>value.id)).toEqual(['child'])})
  it('does not cascade parent completion to children',()=>{const child=task({id:'child',parentId:'parent'}),completedParent=task({id:'parent',status:'completed'});expect(childTasks([completedParent,child],'parent')[0].status).toBe('active')})
})
