import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { TaskRepository } from '../src/infrastructure/taskRepository.js'
import { ListRepository } from '../src/infrastructure/listRepository.js'
const dataRoot = process.env.BEARAI_TODO_DATA_DIR ?? join(app.getPath('userData'), 'data')
const repository = new TaskRepository(dataRoot)
const listRepository = new ListRepository(dataRoot)
function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 760, minHeight: 560, frame:false, titleBarStyle:'hidden', backgroundColor:'#f3f2f1', webPreferences:{ preload:join(app.getAppPath(),'electron','preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true } })
  if (process.argv.includes('--dev')) void win.loadURL('http://localhost:5173')
  else void win.loadFile(join(import.meta.dirname,'../../dist/index.html'))
  if (process.argv.includes('--smoke')) win.webContents.once('did-finish-load', async () => {
    try {
      const result=await win.webContents.executeJavaScript(`(async()=>{const api=window.bearTodo;if(!api)throw new Error('bridge missing');const health=await api.health();const group=await api.createGroup('冒烟分组');const task=await api.createTask('冒烟任务','inbox');const child=await api.createTask('冒烟子任务','inbox',task.id);const [groups,tasks]=await Promise.all([api.listGroups(),api.listTasks()]);return{health,groupPersisted:groups.some(x=>x.id===group.id),taskPersisted:tasks.some(x=>x.id===task.id),childPersisted:tasks.some(x=>x.id===child.id&&x.parentId===task.id)}})()`)
      await new Promise(resolve=>setTimeout(resolve,500))
      if(process.env.BEARAI_SMOKE_SCREENSHOT)await writeFile(process.env.BEARAI_SMOKE_SCREENSHOT,(await win.webContents.capturePage()).toPNG())
      console.log(`BEARAI_SMOKE ${JSON.stringify(result)}`)
      app.exit(result.groupPersisted&&result.taskPersisted&&result.childPersisted?0:1)
    } catch (error) { console.error('BEARAI_SMOKE_FAILED',error);app.exit(1) }
  })
}
app.whenReady().then(() => {
  ipcMain.handle('app:health', () => ({ ok:true, dataRoot }))
  ipcMain.handle('tasks:list', () => repository.list())
  ipcMain.handle('tasks:create', (_event, title:string, listId:string, parentId:string|null) => repository.create(title,listId,parentId))
  ipcMain.handle('tasks:save', (_event, task, expectedRevision:number) => repository.save(task, expectedRevision))
  ipcMain.handle('lists:list', () => listRepository.listAll())
  ipcMain.handle('lists:create', (_event, name:string, groupId:string|null) => listRepository.createList(name,groupId))
  ipcMain.handle('lists:save', (_event, list, expectedRevision:number) => listRepository.saveList(list,expectedRevision))
  ipcMain.handle('lists:archive', (_event, list) => listRepository.archiveList(list))
  ipcMain.handle('groups:list', () => listRepository.groupAll())
  ipcMain.handle('groups:create', (_event, name:string) => listRepository.createGroup(name))
  ipcMain.handle('groups:save', (_event, group, expectedRevision:number) => listRepository.saveGroup(group,expectedRevision))
  ipcMain.handle('groups:archive', (_event, group) => listRepository.archiveGroup(group))
  ipcMain.on('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on('window:toggle-maximize', event => { const win=BrowserWindow.fromWebContents(event.sender);if(win)win.isMaximized()?win.unmaximize():win.maximize() })
  ipcMain.on('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close())
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
