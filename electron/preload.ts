import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('bearTodo', {
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (title:string, listId:string='inbox') => ipcRenderer.invoke('tasks:create', title,listId),
  saveTask: (task:unknown, expectedRevision:number) => ipcRenderer.invoke('tasks:save', task, expectedRevision),
  listLists: () => ipcRenderer.invoke('lists:list'),
  createList: (name:string, groupId:string|null=null) => ipcRenderer.invoke('lists:create',name,groupId),
  saveList: (list:unknown, expectedRevision:number) => ipcRenderer.invoke('lists:save',list,expectedRevision),
  archiveList: (list:unknown) => ipcRenderer.invoke('lists:archive',list),
  listGroups: () => ipcRenderer.invoke('groups:list'),
  createGroup: (name:string) => ipcRenderer.invoke('groups:create',name),
  saveGroup: (group:unknown, expectedRevision:number) => ipcRenderer.invoke('groups:save',group,expectedRevision),
  archiveGroup: (group:unknown) => ipcRenderer.invoke('groups:archive',group)
})
