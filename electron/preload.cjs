const { contextBridge, ipcRenderer } = require('electron')
// Vue reactive proxies cannot cross Electron's structured-clone boundary.
// JSON DTOs are safe here because every exposed domain contract is JSON-compatible.
const dto = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

contextBridge.exposeInMainWorld('bearTodo', {
  health: () => ipcRenderer.invoke('app:health'),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (title, projectId, parentId = null) => ipcRenderer.invoke('tasks:create', title, projectId, parentId),
  saveTask: (task, expectedRevision) => ipcRenderer.invoke('tasks:save', dto(task), expectedRevision),
  placeTask: placement => ipcRenderer.invoke('tasks:place', dto(placement)),
  addAttachments: taskId => ipcRenderer.invoke('attachments:add',taskId),
  importEditorImage: (taskId,name,mime,bytes) => ipcRenderer.invoke('attachments:import-image',taskId,name,mime,bytes),
  removeAttachment: attachment => ipcRenderer.invoke('attachments:remove',dto(attachment)),
  previewAttachment: attachment => ipcRenderer.invoke('attachments:preview',dto(attachment)),
  downloadAttachment: attachment => ipcRenderer.invoke('attachments:download',dto(attachment)),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  listArchivedProjects: () => ipcRenderer.invoke('projects:list-archived'),
  createProject: (name, parentId = null) => ipcRenderer.invoke('projects:create', name, parentId),
  renameProject: (projectId, name) => ipcRenderer.invoke('projects:rename', projectId, name),
  updateProject: (projectId, patch) => ipcRenderer.invoke('projects:update', projectId, dto(patch)),
  openProjectFolder: projectId => ipcRenderer.invoke('projects:open-folder',projectId),
  moveProject: (projectId, parentId = null) => ipcRenderer.invoke('projects:move', projectId, parentId),
  reorderProject: placement => ipcRenderer.invoke('projects:reorder', dto(placement)),
  moveProjectChecked: placement => ipcRenderer.invoke('projects:move-checked', dto(placement)),
  archiveProject: (projectId) => ipcRenderer.invoke('projects:archive', projectId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: theme => ipcRenderer.invoke('settings:set-theme', theme),
  setPreferences: patch => ipcRenderer.invoke('settings:set-preferences', dto(patch)),
  chooseThemeBackground: themeId => ipcRenderer.invoke('settings:choose-theme-background', String(themeId)),
  changeWorkspace: () => ipcRenderer.invoke('settings:change-workspace'),
  listWorkspaces: () => ipcRenderer.invoke('workspaces:list'),
  switchWorkspace: workspaceId => ipcRenderer.invoke('workspaces:switch', String(workspaceId)),
  addWorkspace: () => ipcRenderer.invoke('workspaces:add'),
  createWorkspace: name => ipcRenderer.invoke('workspaces:create', String(name)),
  renameWorkspace: (workspaceId, name) => ipcRenderer.invoke('workspaces:rename', String(workspaceId), String(name)),
  removeWorkspace: workspaceId => ipcRenderer.invoke('workspaces:remove', String(workspaceId)),
  openWorkspace: workspaceId => ipcRenderer.invoke('workspaces:open', String(workspaceId)),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
})
