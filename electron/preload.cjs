const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bearTodo', {
  health: () => ipcRenderer.invoke('app:health'),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (title, listId = 'inbox') => ipcRenderer.invoke('tasks:create', title, listId),
  saveTask: (task, expectedRevision) => ipcRenderer.invoke('tasks:save', task, expectedRevision),
  listLists: () => ipcRenderer.invoke('lists:list'),
  createList: (name, groupId = null) => ipcRenderer.invoke('lists:create', name, groupId),
  saveList: (list, expectedRevision) => ipcRenderer.invoke('lists:save', list, expectedRevision),
  archiveList: (list) => ipcRenderer.invoke('lists:archive', list),
  listGroups: () => ipcRenderer.invoke('groups:list'),
  createGroup: (name) => ipcRenderer.invoke('groups:create', name),
  saveGroup: (group, expectedRevision) => ipcRenderer.invoke('groups:save', group, expectedRevision),
  archiveGroup: (group) => ipcRenderer.invoke('groups:archive', group),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
})

