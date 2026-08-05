import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('bearTodo', {
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (title:string) => ipcRenderer.invoke('tasks:create', title),
  saveTask: (task:unknown, expectedRevision:number) => ipcRenderer.invoke('tasks:save', task, expectedRevision)
})
