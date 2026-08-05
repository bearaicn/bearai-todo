import { describe, expect, it } from 'vitest'
import type { Task } from '../src/domain/task'
import { localDateKey, myDaySuggestions, queryTasks } from '../src/domain/taskQueries'
import { addStep, removeStep, renameStep, toggleStep } from '../src/domain/taskSteps'
function task(patch:Partial<Task>={}):Task{return{schema:'bearai.todo/task@1',id:crypto.randomUUID(),revision:1,title:'任务',listId:'inbox',status:'active',important:false,tags:[],steps:[],attachments:[],createdAt:'2026-08-05T00:00:00Z',updatedAt:'2026-08-05T00:00:00Z',note:'',extra:{},...patch}}
describe('smart task queries',()=>{
  const today='2026-08-05';const values=[task({id:'day',myDay:today}),task({id:'star',important:true}),task({id:'due',due:'2026-08-10'}),task({id:'done',status:'completed'}),task({id:'custom',listId:'list-a'})]
  it('uses local calendar dates for My Day',()=>{expect(localDateKey(new Date(2026,7,5,23,30))).toBe(today);expect(queryTasks(values,'my-day',today).map(x=>x.id)).toEqual(['day'])})
  it('queries all six smart/default views and restores completed tasks by status',()=>{expect(queryTasks(values,'important').map(x=>x.id)).toContain('star');expect(queryTasks(values,'planned').map(x=>x.id)).toContain('due');expect(queryTasks(values,'all')).toHaveLength(4);expect(queryTasks(values,'completed').map(x=>x.id)).toEqual(['done']);expect(queryTasks(values,'inbox').map(x=>x.id)).not.toContain('custom');expect(queryTasks(values,'list-a').map(x=>x.id)).toEqual(['custom'])})
  it('suggests important and dated active tasks not already in My Day',()=>{expect(myDaySuggestions(values,today).map(x=>x.id)).toEqual(['star','due'])})
})
describe('task steps',()=>{
  it('adds, renames, completes, restores and removes a step immutably',()=>{const original=task();const added=addStep(original,'第一步');expect(original.steps).toEqual([]);const id=added.steps[0].id;const renamed=renameStep(added,id,'准备材料');expect(renamed.steps[0].title).toBe('准备材料');const completed=toggleStep(renamed,id);expect(completed.steps[0].completed).toBe(true);expect(toggleStep(completed,id).steps[0].completed).toBe(false);expect(removeStep(completed,id).steps).toEqual([])})
  it('rejects blank step names',()=>{expect(()=>addStep(task(),'  ')).toThrow('不能为空')})
})
