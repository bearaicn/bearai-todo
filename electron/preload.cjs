const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bearTodo', {
  health: () => ipcRenderer.invoke('app:health'),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (title, projectId, parentId = null) => ipcRenderer.invoke('tasks:create', title, projectId, parentId),
  saveTask: (task, expectedRevision) => ipcRenderer.invoke('tasks:save', task, expectedRevision),
  addAttachments: taskId => ipcRenderer.invoke('attachments:add',taskId),
  removeAttachment: attachment => ipcRenderer.invoke('attachments:remove',attachment),
  previewAttachment: attachment => ipcRenderer.invoke('attachments:preview',attachment),
  downloadAttachment: attachment => ipcRenderer.invoke('attachments:download',attachment),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  listArchivedProjects: () => ipcRenderer.invoke('projects:list-archived'),
  createProject: (name, parentId = null) => ipcRenderer.invoke('projects:create', name, parentId),
  renameProject: (projectId, name) => ipcRenderer.invoke('projects:rename', projectId, name),
  updateProject: (projectId, patch) => ipcRenderer.invoke('projects:update', projectId, patch),
  moveProject: (projectId, parentId = null) => ipcRenderer.invoke('projects:move', projectId, parentId),
  archiveProject: (projectId) => ipcRenderer.invoke('projects:archive', projectId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: theme => ipcRenderer.invoke('settings:set-theme', theme),
  setPreferences: patch => ipcRenderer.invoke('settings:set-preferences', patch),
  chooseThemeBackground: () => ipcRenderer.invoke('settings:choose-theme-background'),
  changeWorkspace: () => ipcRenderer.invoke('settings:change-workspace'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
})
