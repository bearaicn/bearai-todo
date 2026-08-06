import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { TaskRepository } from '../src/infrastructure/taskRepository.js'
import { ProjectRepository, WorkspaceRepository } from '../src/infrastructure/workspaceRepository.js'
import { migrateWorkspace, SettingsRepository } from '../src/infrastructure/settingsRepository.js'
let dataRoot=''
let repository:TaskRepository,projectRepository:ProjectRepository,workspaceRepository:WorkspaceRepository,settingsRepository:SettingsRepository
function configureRepositories(root:string){dataRoot=root;repository=new TaskRepository(root);projectRepository=new ProjectRepository(root);workspaceRepository=new WorkspaceRepository(root)}
function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 760, minHeight: 560, frame:false, titleBarStyle:'hidden', backgroundColor:'#f3f2f1', webPreferences:{ preload:join(app.getAppPath(),'electron','preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true } })
  if (process.argv.includes('--dev')) void win.loadURL('http://localhost:5173')
  else void win.loadFile(join(import.meta.dirname,'../../dist/index.html'))
  if (process.argv.includes('--smoke')) win.webContents.once('did-finish-load', async () => {
    try {
      const result=await win.webContents.executeJavaScript(`(async()=>{const api=window.bearTodo;if(!api)throw new Error('bridge missing');const health=await api.health();const project=await api.createProject('冒烟项目',null);const childProject=await api.createProject('冒烟子项目',project.projectId);const task=await api.createTask('冒烟任务',project.projectId);const child=await api.createTask('冒烟子任务',project.projectId,task.id);const [projects,tasks]=await Promise.all([api.listProjects(),api.listTasks()]);return{health,projectPersisted:projects.some(x=>x.projectId===project.projectId),childProjectPersisted:projects.some(x=>x.projectId===childProject.projectId&&x.parentId===project.projectId),taskPersisted:tasks.some(x=>x.id===task.id&&x.projectId===project.projectId),childPersisted:tasks.some(x=>x.id===child.id&&x.parentId===task.id)}})()`)
      await new Promise(resolve=>setTimeout(resolve,500))
      if(process.env.BEARAI_SMOKE_INITIAL_SCREENSHOT)await writeFile(process.env.BEARAI_SMOKE_INITIAL_SCREENSHOT,(await win.webContents.capturePage()).toPNG())
      const layoutResult=await win.webContents.executeJavaScript(`(()=>{const shell=document.querySelector('.shell').getBoundingClientRect(),nav=document.querySelector('.nav').getBoundingClientRect(),list=document.querySelector('.list').getBoundingClientRect();return{viewport:{width:innerWidth,height:innerHeight},shell:{width:shell.width,height:shell.height},nav:{top:nav.top,bottom:nav.bottom,height:nav.height},list:{left:list.left,right:list.right,width:list.width},bodyScroll:{width:document.body.scrollWidth,height:document.body.scrollHeight}}})()`)
      Object.assign(result,{layoutResult,detailInitiallyHidden:await win.webContents.executeJavaScript(`!document.querySelector('.detail')`)})
      if(process.env.BEARAI_SMOKE_DETAIL_SCREENSHOT){await win.webContents.executeJavaScript(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),input=document.querySelector('.add input'),setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'界面布局检查任务');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter'}));await wait(300)})()`);await writeFile(process.env.BEARAI_SMOKE_DETAIL_SCREENSHOT,(await win.webContents.capturePage()).toPNG())}
      const uiResult=await win.webContents.executeJavaScript(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),setInput=(input,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};let row=document.querySelector('.list-row');row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:250,clientY:300}));await wait(100);[...document.querySelectorAll('.context-menu button')].find(x=>x.textContent.includes('新增子项目')).click();await wait(100);let input=document.querySelector('.modal>input');const subprojectDialogVisible=!!input;setInput(input,'界面子项目');document.querySelector('.modal').requestSubmit();await wait(300);const subprojectCreated=[...document.querySelectorAll('.list-main b')].some(x=>x.textContent==='界面子项目');row=document.querySelector('.list-row');row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:250,clientY:300}));await wait(100);[...document.querySelectorAll('.context-menu button')].find(x=>x.textContent.includes('属性')).click();await wait(150);const propertiesVisible=!!document.querySelector('.properties-modal');document.querySelector('.modal-backdrop').dispatchEvent(new MouseEvent('click',{bubbles:true}));await wait(100);document.querySelector('.account-block').click();await wait(100);const accountMenuVisible=!!document.querySelector('.account-menu');[...document.querySelectorAll('.account-menu button')].find(x=>x.textContent.includes('设置')).click();await wait(200);return{subprojectDialogVisible,subprojectCreated,propertiesVisible,accountMenuVisible,settingsVisible:!!document.querySelector('.settings-modal'),workspacePath:document.querySelector('.path-box')?.textContent}})()`)
      Object.assign(result,uiResult)
      if(process.env.BEARAI_SMOKE_SCREENSHOT)await writeFile(process.env.BEARAI_SMOKE_SCREENSHOT,(await win.webContents.capturePage()).toPNG())
      console.log(`BEARAI_SMOKE ${JSON.stringify(result)}`)
      const layoutPass=result.layoutResult.nav.height>700&&result.layoutResult.nav.bottom<=result.layoutResult.viewport.height&&result.layoutResult.list.width>900&&result.layoutResult.bodyScroll.height===result.layoutResult.viewport.height
      app.exit(result.projectPersisted&&result.childProjectPersisted&&result.taskPersisted&&result.childPersisted&&result.subprojectDialogVisible&&result.subprojectCreated&&result.propertiesVisible&&result.accountMenuVisible&&result.settingsVisible&&result.detailInitiallyHidden&&layoutPass?0:1)
    } catch (error) { console.error('BEARAI_SMOKE_FAILED',error);app.exit(1) }
  })
}
app.whenReady().then(async () => {
  settingsRepository=new SettingsRepository(join(app.getPath('userData'),'settings.json'))
  const settings=await settingsRepository.read()
  configureRepositories(process.env.BEARAI_TODO_DATA_DIR??settings.workspacePath??join(app.getPath('userData'),'data'))
  await workspaceRepository.initialize();await projectRepository.initialize()
  ipcMain.handle('app:health', () => ({ ok:true, dataRoot }))
  ipcMain.handle('tasks:list', async () => {const tasks=await repository.list();await workspaceRepository.updateStatistics(tasks.filter(task=>task.status==='active').length,tasks.filter(task=>task.status==='completed').length);return tasks})
  ipcMain.handle('tasks:create', (_event, title:string, projectId:string, parentId:string|null) => repository.create(title,projectId,parentId))
  ipcMain.handle('tasks:save', (_event, task, expectedRevision:number) => repository.save(task, expectedRevision))
  ipcMain.handle('projects:list', () => projectRepository.initialize())
  ipcMain.handle('projects:create', (_event,name:string,parentId:string|null) => projectRepository.create(name,parentId))
  ipcMain.handle('projects:rename', (_event,projectId:string,name:string) => projectRepository.rename(projectId,name))
  ipcMain.handle('projects:update', (_event,projectId:string,patch) => projectRepository.update(projectId,patch))
  ipcMain.handle('projects:move', (_event,projectId:string,parentId:string|null) => projectRepository.move(projectId,parentId))
  ipcMain.handle('projects:archive', (_event,projectId:string) => projectRepository.archive(projectId))
  ipcMain.handle('settings:get', async () => ({...(await settingsRepository.read()),workspacePath:dataRoot}))
  ipcMain.handle('settings:set-theme', (_event,theme) => settingsRepository.setTheme(theme))
  ipcMain.handle('settings:change-workspace', async event => {const owner=BrowserWindow.fromWebContents(event.sender),options={title:'选择新的熊智ToDo工作目录',properties:['openDirectory','createDirectory'] as ('openDirectory'|'createDirectory')[],buttonLabel:'选择并迁移'};const result=owner?await dialog.showOpenDialog(owner,options):await dialog.showOpenDialog(options);if(result.canceled||!result.filePaths[0])return{canceled:true};const migration=await migrateWorkspace(dataRoot,result.filePaths[0]);await settingsRepository.setWorkspace(result.filePaths[0]);configureRepositories(result.filePaths[0]);await workspaceRepository.initialize();await projectRepository.initialize();return{canceled:false,migration,workspacePath:dataRoot}})
  ipcMain.on('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on('window:toggle-maximize', event => { const win=BrowserWindow.fromWebContents(event.sender);if(win)win.isMaximized()?win.unmaximize():win.maximize() })
  ipcMain.on('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close())
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
