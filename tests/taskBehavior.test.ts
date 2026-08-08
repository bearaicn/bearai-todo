import { describe, expect, it } from 'vitest'
import type { Task } from '../src/domain/task'
import { childTasks, dueState, queryTasks } from '../src/domain/taskQueries'
function task(patch:Partial<Task>={}):Task{return{schema:'bearai.todo/task@2',id:crypto.randomUUID(),revision:1,title:'任务',projectId:'project-a',parentId:null,status:'active',favorite:false,tags:[],attachments:[],createdAt:'2026-08-05T00:00:00Z',updatedAt:'2026-08-05T00:00:00Z',note:'',extra:{},...patch}}
describe('smart task queries',()=>{
  const values=[task({id:'plain'}),task({id:'star',favorite:true}),task({id:'due',due:'2026-08-10'}),task({id:'done',status:'completed'}),task({id:'custom',projectId:'project-b'})]
  it('defines Today as incomplete due tasks inside the local calendar window',()=>{expect(queryTasks(values,'today',{todayWindowDays:3,now:new Date('2026-08-08T12:00:00')}).map(x=>x.id)).toEqual(['due'])})
  it('queries favorites, planned, completed and projects',()=>{expect(queryTasks(values,'favorites').map(x=>x.id)).toEqual(['star']);expect(queryTasks(values,'planned').map(x=>x.id)).toEqual(['due']);expect(queryTasks(values,'completed').map(x=>x.id)).toEqual(['done']);expect(queryTasks(values,'project-b').map(x=>x.id)).toEqual(['custom'])})
})
describe('child tasks',()=>{
  it('keeps child tasks out of top-level views and returns them under the parent',()=>{const parent=task({id:'parent',due:'2026-08-09'}),child=task({id:'child',parentId:'parent',due:'2026-08-09'});expect(queryTasks([parent,child],'today',{now:new Date('2026-08-08T12:00:00')}).map(value=>value.id)).toEqual(['parent']);expect(childTasks([parent,child],'parent').map(value=>value.id)).toEqual(['child'])})
  it('classifies date-only and timed deadlines by local calendar day',()=>{const now=new Date(2026,11,31,12);expect(dueState('2026-12-31',3,now)).toBe('today');expect(dueState('2026-12-31T09:00:00+08:00',3,now)).toBe('overdue');expect(dueState('2027-01-03',3,now)).toBe('upcoming');expect(dueState('2027-01-04',3,now)).toBe('outside')})
  it('supports zero and one day windows without elapsed-hour math',()=>{const now=new Date(2026,7,8,23,50);expect(dueState('2026-08-09',0,now)).toBe('outside');expect(dueState('2026-08-09',1,now)).toBe('upcoming')})
  it('does not cascade parent completion to children',()=>{const child=task({id:'child',parentId:'parent'}),completedParent=task({id:'parent',status:'completed'});expect(childTasks([completedParent,child],'parent')[0].status).toBe('active')})
})
