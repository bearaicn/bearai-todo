import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { TaskRepository } from '../src/infrastructure/taskRepository.js'
import { ProjectRepository, WorkspaceRepository } from '../src/infrastructure/workspaceRepository.js'
const dataRoot = process.env.BEARAI_TODO_DATA_DIR ?? join(app.getPath('userData'), 'data')
const repository = new TaskRepository(dataRoot)
const projectRepository = new ProjectRepository(dataRoot)
const workspaceRepository = new WorkspaceRepository(dataRoot)
function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 760, minHeight: 560, frame:false, titleBarStyle:'hidden', backgroundColor:'#f3f2f1', webPreferences:{ preload:join(app.getAppPath(),'electron','preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true } })
  if (process.argv.includes('--dev')) void win.loadURL('http://localhost:5173')
  else void win.loadFile(join(import.meta.dirname,'../../dist/index.html'))
  if (process.argv.includes('--smoke')) win.webContents.once('did-finish-load', async () => {
    try {
      const result=await win.webContents.executeJavaScript(`(async()=>{const api=window.bearTodo;if(!api)throw new Error('bridge missing');const health=await api.health();const project=await api.createProject('冒烟项目',null);const childProject=await api.createProject('冒烟子项目',project.projectId);const task=await api.createTask('冒烟任务',project.projectId);const child=await api.createTask('冒烟子任务',project.projectId,task.id);const [projects,tasks]=await Promise.all([api.listProjects(),api.listTasks()]);return{health,projectPersisted:projects.some(x=>x.projectId===project.projectId),childProjectPersisted:projects.some(x=>x.projectId===childProject.projectId&&x.parentId===project.projectId),taskPersisted:tasks.some(x=>x.id===task.id&&x.projectId===project.projectId),childPersisted:tasks.some(x=>x.id===child.id&&x.parentId===task.id)}})()`)
      await new Promise(resolve=>setTimeout(resolve,500))
      await win.webContents.executeJavaScript(`document.querySelector('.list-row')?.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:250,clientY:300}))`)
      await new Promise(resolve=>setTimeout(resolve,200))
      if(process.env.BEARAI_SMOKE_SCREENSHOT)await writeFile(process.env.BEARAI_SMOKE_SCREENSHOT,(await win.webContents.capturePage()).toPNG())
      console.log(`BEARAI_SMOKE ${JSON.stringify(result)}`)
      app.exit(result.projectPersisted&&result.childProjectPersisted&&result.taskPersisted&&result.childPersisted?0:1)
    } catch (error) { console.error('BEARAI_SMOKE_FAILED',error);app.exit(1) }
  })
}
app.whenReady().then(() => {
  void workspaceRepository.initialize().then(()=>projectRepository.initialize())
  ipcMain.handle('app:health', () => ({ ok:true, dataRoot }))
  ipcMain.handle('tasks:list', async () => {const tasks=await repository.list();await workspaceRepository.updateStatistics(tasks.filter(task=>task.status==='active').length,tasks.filter(task=>task.status==='completed').length);return tasks})
  ipcMain.handle('tasks:create', (_event, title:string, projectId:string, parentId:string|null) => repository.create(title,projectId,parentId))
  ipcMain.handle('tasks:save', (_event, task, expectedRevision:number) => repository.save(task, expectedRevision))
  ipcMain.handle('projects:list', () => projectRepository.initialize())
  ipcMain.handle('projects:create', (_event,name:string,parentId:string|null) => projectRepository.create(name,parentId))
  ipcMain.handle('projects:rename', (_event,projectId:string,name:string) => projectRepository.rename(projectId,name))
  ipcMain.handle('projects:archive', (_event,projectId:string) => projectRepository.archive(projectId))
  ipcMain.on('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on('window:toggle-maximize', event => { const win=BrowserWindow.fromWebContents(event.sender);if(win)win.isMaximized()?win.unmaximize():win.maximize() })
  ipcMain.on('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close())
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
