import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { TaskRepository } from '../src/infrastructure/taskRepository.js'
import { ListRepository } from '../src/infrastructure/listRepository.js'
const dataRoot = process.env.BEARAI_TODO_DATA_DIR ?? join(app.getPath('userData'), 'data')
const repository = new TaskRepository(dataRoot)
const listRepository = new ListRepository(dataRoot)
function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 760, minHeight: 560, backgroundColor:'#f3f2f1', webPreferences:{ preload:join(import.meta.dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:true } })
  if (!app.isPackaged) void win.loadURL('http://localhost:5173'); else void win.loadFile(join(import.meta.dirname,'../../dist/index.html'))
}
app.whenReady().then(() => {
  ipcMain.handle('tasks:list', () => repository.list())
  ipcMain.handle('tasks:create', (_event, title:string, listId:string) => repository.create(title,listId))
  ipcMain.handle('tasks:save', (_event, task, expectedRevision:number) => repository.save(task, expectedRevision))
  ipcMain.handle('lists:list', () => listRepository.listAll())
  ipcMain.handle('lists:create', (_event, name:string, groupId:string|null) => listRepository.createList(name,groupId))
  ipcMain.handle('lists:save', (_event, list, expectedRevision:number) => listRepository.saveList(list,expectedRevision))
  ipcMain.handle('lists:archive', (_event, list) => listRepository.archiveList(list))
  ipcMain.handle('groups:list', () => listRepository.groupAll())
  ipcMain.handle('groups:create', (_event, name:string) => listRepository.createGroup(name))
  ipcMain.handle('groups:save', (_event, group, expectedRevision:number) => listRepository.saveGroup(group,expectedRevision))
  ipcMain.handle('groups:archive', (_event, group) => listRepository.archiveGroup(group))
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
