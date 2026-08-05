import type { Task } from './task.js'
export type SmartListId='my-day'|'important'|'planned'|'all'|'completed'|'inbox'
export function localDateKey(now=new Date()){const year=now.getFullYear();const month=String(now.getMonth()+1).padStart(2,'0');const day=String(now.getDate()).padStart(2,'0');return `${year}-${month}-${day}`}
export function queryTasks(tasks:Task[],view:SmartListId|string,today=localDateKey()){
  return tasks.filter(task=>{
    if(view==='my-day')return task.status==='active'&&task.myDay===today
    if(view==='important')return task.status==='active'&&task.important
    if(view==='planned')return task.status==='active'&&Boolean(task.due)
    if(view==='all')return task.status==='active'
    if(view==='completed')return task.status==='completed'
    if(view==='inbox')return task.status==='active'&&task.listId==='inbox'
    return task.status==='active'&&task.listId===view
  }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
}
export function myDaySuggestions(tasks:Task[],today=localDateKey()){return tasks.filter(task=>task.status==='active'&&task.myDay!==today&&(task.important||Boolean(task.due))).sort((a,b)=>Number(b.important)-Number(a.important)||String(a.due??'9999').localeCompare(String(b.due??'9999')))}

