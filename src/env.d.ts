import type { Task } from './domain/task'
import type { ListGroup, TodoList } from './domain/list'
declare global { interface Window { bearTodo?: {
  health():Promise<{ok:boolean;dataRoot:string}>
  listTasks():Promise<Task[]>; createTask(title:string,listId?:string):Promise<Task>; saveTask(task:Task,expectedRevision:number):Promise<Task>
  listLists():Promise<TodoList[]>; createList(name:string,groupId?:string|null):Promise<TodoList>; saveList(list:TodoList,expectedRevision:number):Promise<TodoList>; archiveList(list:TodoList):Promise<TodoList>
  listGroups():Promise<ListGroup[]>; createGroup(name:string):Promise<ListGroup>; saveGroup(group:ListGroup,expectedRevision:number):Promise<ListGroup>; archiveGroup(group:ListGroup):Promise<ListGroup>
  minimizeWindow():void; toggleMaximizeWindow():void; closeWindow():void
} } }
export {}
