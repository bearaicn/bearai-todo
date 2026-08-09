import { describe, expect, it } from 'vitest'
import type { Task } from '../src/domain/task'
import { childTasks, completedProjectTasks, dueState, partitionChildTasks, queryTasks } from '../src/domain/taskQueries'
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
  it('places completed children in a separate group after active siblings',()=>{const active=task({id:'active-child',parentId:'parent',order:2}),completed=task({id:'done-child',parentId:'parent',order:1,status:'completed'}),groups=partitionChildTasks([active,completed],'parent');expect(groups.active.map(value=>value.id)).toEqual(['active-child']);expect(groups.completed.map(value=>value.id)).toEqual(['done-child'])})
})
describe('completed project section',()=>{
  it('returns only completed top-level tasks from the current project',()=>{const values=[task({id:'done-a',status:'completed'}),task({id:'active'}),task({id:'other',projectId:'project-b',status:'completed'}),task({id:'child',parentId:'done-a',status:'completed'})];expect(completedProjectTasks(values,'project-a').map(value=>value.id)).toEqual(['done-a'])})
  it('filters completed tasks by title, note or tag',()=>{const values=[task({id:'title',title:'发布版本',status:'completed'}),task({id:'note',note:'包含验收证据',status:'completed'}),task({id:'tag',tags:['客户'],status:'completed'})];expect(completedProjectTasks(values,'project-a','验收').map(value=>value.id)).toEqual(['note']);expect(completedProjectTasks(values,'project-a','客户').map(value=>value.id)).toEqual(['tag'])})
})
