import type { Task } from './domain/task'
declare global { interface Window { bearTodo?: { listTasks():Promise<Task[]>; createTask(title:string):Promise<Task>; saveTask(task:Task, expectedRevision:number):Promise<Task> } } }
export {}
