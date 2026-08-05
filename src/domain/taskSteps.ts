import { randomUUID } from 'node:crypto'
import type { Task } from './task.js'
export function addStep(task:Task,title:string):Task{const value=title.trim();if(!value)throw new Error('步骤名称不能为空');return{...task,steps:[...task.steps,{id:randomUUID(),title:value,completed:false}]}}
export function renameStep(task:Task,id:string,title:string):Task{const value=title.trim();if(!value)throw new Error('步骤名称不能为空');return{...task,steps:task.steps.map(step=>step.id===id?{...step,title:value}:step)}}
export function toggleStep(task:Task,id:string):Task{return{...task,steps:task.steps.map(step=>step.id===id?{...step,completed:!step.completed}:step)}}
export function removeStep(task:Task,id:string):Task{return{...task,steps:task.steps.filter(step=>step.id!==id)}}

