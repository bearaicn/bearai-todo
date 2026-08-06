import type { Task } from './task.js'
export type SmartViewId='today'|'favorites'|'planned'|'completed'
export function queryTasks(tasks:Task[],view:SmartViewId|string){return tasks.filter(task=>{if(task.parentId)return false;if(view==='today')return task.status==='active';if(view==='favorites')return task.status==='active'&&task.favorite;if(view==='planned')return task.status==='active'&&Boolean(task.due);if(view==='completed')return task.status==='completed';return task.status==='active'&&task.projectId===view}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
export function childTasks(tasks:Task[],parentId:string){return tasks.filter(task=>task.parentId===parentId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))}
