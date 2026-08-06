const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bearTodo', {
  health: () => ipcRenderer.invoke('app:health'),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (title, projectId, parentId = null) => ipcRenderer.invoke('tasks:create', title, projectId, parentId),
  saveTask: (task, expectedRevision) => ipcRenderer.invoke('tasks:save', task, expectedRevision),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (name, parentId = null) => ipcRenderer.invoke('projects:create', name, parentId),
  renameProject: (projectId, name) => ipcRenderer.invoke('projects:rename', projectId, name),
  archiveProject: (projectId) => ipcRenderer.invoke('projects:archive', projectId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  changeWorkspace: () => ipcRenderer.invoke('settings:change-workspace'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
})
