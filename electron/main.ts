import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { TaskRepository } from '../src/infrastructure/taskRepository.js'
const dataRoot = process.env.BEARAI_TODO_DATA_DIR ?? join(app.getPath('userData'), 'data')
const repository = new TaskRepository(dataRoot)
function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 760, minHeight: 560, backgroundColor:'#f3f2f1', webPreferences:{ preload:join(import.meta.dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:true } })
  if (!app.isPackaged) void win.loadURL('http://localhost:5173'); else void win.loadFile(join(import.meta.dirname,'../../dist/index.html'))
}
app.whenReady().then(() => {
  ipcMain.handle('tasks:list', () => repository.list())
  ipcMain.handle('tasks:create', (_event, title:string) => repository.create(title))
  ipcMain.handle('tasks:save', (_event, task, expectedRevision:number) => repository.save(task, expectedRevision))
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
