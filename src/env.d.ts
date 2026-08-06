import type { Task } from './domain/task'
import type { Project } from './domain/project'
declare global { interface Window { bearTodo?: {
  health():Promise<{ok:boolean;dataRoot:string}>
  listTasks():Promise<Task[]>; createTask(title:string,projectId:string,parentId?:string|null):Promise<Task>; saveTask(task:Task,expectedRevision:number):Promise<Task>
  listProjects():Promise<Project[]>;createProject(name:string,parentId?:string|null):Promise<Project>;renameProject(projectId:string,name:string):Promise<Project>;archiveProject(projectId:string):Promise<Project>
  getSettings():Promise<{workspacePath:string;theme:string}>;changeWorkspace():Promise<{canceled:boolean;workspacePath?:string;migration?:{projects:number;tasks:number;source:string;target:string}}>
  minimizeWindow():void; toggleMaximizeWindow():void; closeWindow():void
} } }
export {}
