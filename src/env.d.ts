import type { Task } from './domain/task'
import type { Project, ProjectTheme } from './domain/project'
declare global { interface Window { bearTodo?: {
  health():Promise<{ok:boolean;dataRoot:string}>
  listTasks():Promise<Task[]>; createTask(title:string,projectId:string,parentId?:string|null):Promise<Task>; saveTask(task:Task,expectedRevision:number):Promise<Task>
  listProjects():Promise<Project[]>;createProject(name:string,parentId?:string|null):Promise<Project>;renameProject(projectId:string,name:string):Promise<Project>;updateProject(projectId:string,patch:Partial<Pick<Project,'name'|'icon'|'description'|'sidebarColor'|'theme'|'collapsed'>>):Promise<Project>;moveProject(projectId:string,parentId:string|null):Promise<Project>;archiveProject(projectId:string):Promise<Project>
  getSettings():Promise<{workspacePath:string;theme:ProjectTheme}>;setTheme(theme:ProjectTheme):Promise<{workspacePath:string|null;theme:ProjectTheme}>;changeWorkspace():Promise<{canceled:boolean;workspacePath?:string;migration?:{projects:number;tasks:number;source:string;target:string;sourceRemoved:boolean}}>
  minimizeWindow():void; toggleMaximizeWindow():void; closeWindow():void
} } }
export {}
