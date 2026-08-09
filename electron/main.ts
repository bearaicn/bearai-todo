import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  Notification,
  nativeImage,
  protocol,
  shell,
} from "electron";
import { pathToFileURL } from "node:url";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { TaskAttachment } from "../src/domain/task.js";
import { TaskRepository } from "../src/infrastructure/taskRepository.js";
import {
  ProjectRepository,
  WorkspaceRepository,
} from "../src/infrastructure/workspaceRepository.js";
import {
  migrateWorkspace,
  SettingsRepository,
} from "../src/infrastructure/settingsRepository.js";
import { WorkspaceRegistryRepository } from "../src/infrastructure/workspaceRegistryRepository.js";
if (
  process.argv.includes("--smoke") ||
  process.argv.includes("--smoke-readback")
) {
  app.disableHardwareAcceleration();
  const isolated =
    process.env.BEARAI_SMOKE_USER_DATA ??
    join(tmpdir(), `bearai-todo-smoke-${process.pid}`);
  app.setPath("userData", isolated);
  app.setPath("cache", join(isolated, "cache"));
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "bearai-asset",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: "bearai-theme",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let dataRoot = "";
let repository: TaskRepository,
  projectRepository: ProjectRepository,
  workspaceRepository: WorkspaceRepository,
  settingsRepository: SettingsRepository,
  workspaceRegistryRepository: WorkspaceRegistryRepository;
const reminderTimers = new Map<string, ReturnType<typeof setTimeout>>();
function configureRepositories(root: string) {
  dataRoot = resolve(root);
  repository = new TaskRepository(dataRoot);
  projectRepository = new ProjectRepository(dataRoot);
  workspaceRepository = new WorkspaceRepository(dataRoot);
  settingsRepository = new SettingsRepository(join(dataRoot,".bearai-settings.json"));
}
function clearReminderTimers() {
  for (const timer of reminderTimers.values()) clearTimeout(timer);
  reminderTimers.clear();
}
async function initializeActiveWorkspace(root: string) {
  configureRepositories(root);
  await workspaceRepository.initialize();
  await projectRepository.initialize();
  clearReminderTimers();
  for (const task of await repository.list()) scheduleReminder(task);
}
const mimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};
function attachmentPath(value: string) {
  const root = resolve(dataRoot, ".attachments"),
    target = resolve(dataRoot, value);
  if (target !== root && !target.startsWith(root + "\\"))
    throw new Error("附件路径越界");
  return target;
}
function scheduleReminder(task: {
  id: string;
  title: string;
  reminder?: string | null;
  status: string;
}) {
  const previous = reminderTimers.get(task.id);
  if (previous) clearTimeout(previous);
  reminderTimers.delete(task.id);
  if (!task.reminder || task.status !== "active") return;
  const delay = new Date(task.reminder).getTime() - Date.now();
  if (delay <= 0 || delay > 2_147_000_000) return;
  reminderTimers.set(
    task.id,
    setTimeout(() => {
      if (Notification.isSupported())
        new Notification({ title: "熊智ToDo 提醒", body: task.title }).show();
      reminderTimers.delete(task.id);
    }, delay),
  );
}
function createWindow() {
  const smokeRendererMessages: string[] = [];
  const win = new BrowserWindow({
    width: Number(process.env.BEARAI_SMOKE_WIDTH) || 1280,
    height: Number(process.env.BEARAI_SMOKE_HEIGHT) || 800,
    minWidth: 760,
    minHeight: 560,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#f3f2f1",
    icon: join(app.getAppPath(), "build", "icon.png"),
    webPreferences: {
      preload: join(app.getAppPath(), "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.argv.includes("--smoke"))
    win.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) smokeRendererMessages.push(message);
    });
  if (process.argv.includes("--dev")) void win.loadURL("http://localhost:5173");
  else void win.loadFile(join(import.meta.dirname, "../../dist/index.html"));
  if (process.argv.includes("--smoke-readback"))
    win.webContents.once("did-finish-load", async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const readback = await win.webContents.executeJavaScript(
          `(async()=>{const health=await window.bearTodo.health(),tasks=await window.bearTodo.listTasks(),task=tasks.find(x=>x.title==='连续输入最终值'),inline=task?.attachments.filter(x=>x.role==='inline')??[],title=[...document.querySelectorAll('.cards strong')].find(x=>x.textContent==='连续输入最终值');title?.closest('article')?.click();await new Promise(resolve=>setTimeout(resolve,900));return{health,titles:tasks.map(x=>x.title),taskFound:!!task,note:task?.note,inlineCount:inline.length,paths:inline.map(x=>x.relativePath),files:await Promise.all(inline.map(async x=>(await window.bearTodo.previewAttachment(x)).supported)),uiImageCount:document.querySelectorAll('.ProseMirror img').length}})()`,
        );
        console.log(`BEARAI_READBACK ${JSON.stringify(readback)}`);
        app.exit(
          readback.taskFound &&
            readback.inlineCount >= 2 &&
            readback.files.every(Boolean) &&
            readback.uiImageCount >= 2
            ? 0
            : 1,
        );
      } catch (error) {
        console.error("BEARAI_READBACK_FAILED", error);
        app.exit(1);
      }
    });
  if (process.argv.includes("--smoke"))
    win.webContents.once("did-finish-load", async () => {
      try {
        const result = await win.webContents.executeJavaScript(
          `(async()=>{const api=window.bearTodo;if(!api)throw new Error('bridge missing');const health=await api.health();const project=await api.createProject('冒烟项目',null);const childProject=await api.createProject('冒烟子项目',project.projectId);const task=await api.createTask('冒烟任务',project.projectId);const child=await api.createTask('冒烟子任务',project.projectId,task.id);const [projects,tasks]=await Promise.all([api.listProjects(),api.listTasks()]);return{health,projectPersisted:projects.some(x=>x.projectId===project.projectId),childProjectPersisted:projects.some(x=>x.projectId===childProject.projectId&&x.parentId===project.projectId),taskPersisted:tasks.some(x=>x.id===task.id&&x.projectId===project.projectId),childPersisted:tasks.some(x=>x.id===child.id&&x.parentId===task.id)}})()`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        const workspaceQaResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),initial=await window.bearTodo.listWorkspaces(),first=initial.activeWorkspaceId,second=initial.workspaces.find(x=>x.workspaceId!==first);document.querySelector('.workspace-block')?.click();await wait(80);const menuVisible=!!document.querySelector('.workspace-menu'),labels=[...document.querySelectorAll('.workspace-menu button')].map(x=>x.textContent.trim()),secondButton=[...document.querySelectorAll('.workspace-menu button')].find(x=>x.textContent.includes(second?.name));secondButton?.click();await wait(500);const switched=(await window.bearTodo.listWorkspaces()).activeWorkspaceId===second?.workspaceId,isolatedProjects=(await window.bearTodo.listProjects()).some(x=>x.name==='第二工作区项目'),activeLabel=document.querySelector('.workspace-block span')?.textContent;document.querySelector('.workspace-block')?.click();await wait(60);[...document.querySelectorAll('.workspace-menu button')].find(x=>x.textContent.includes(initial.workspaces.find(w=>w.workspaceId===first)?.name))?.click();await wait(500);const restored=(await window.bearTodo.listWorkspaces()).activeWorkspaceId===first,originalProjects=(await window.bearTodo.listProjects()).some(x=>x.name==='拖拽目标项目');await window.bearTodo.createProject('刷新按钮外部项目',null);const absentBeforeRefresh=![...document.querySelectorAll('.list-row b')].some(x=>x.textContent==='刷新按钮外部项目'),refreshButton=document.querySelector('.workspace-refresh');refreshButton?.click();await wait(650);const appearedAfterRefresh=[...document.querySelectorAll('.list-row b')].some(x=>x.textContent==='刷新按钮外部项目');return{registered:initial.workspaces.length===2,menuVisible,labels,switched,isolatedProjects,activeLabel,restored,originalProjects,refreshButtonFound:!!refreshButton,refreshTitle:refreshButton?.getAttribute('title'),absentBeforeRefresh,appearedAfterRefresh}})()`,
        );
        Object.assign(result, { workspaceQaResult });
        const projectTreeCountResult = await win.webContents.executeJavaScript(
          `(()=>{const rows=[...document.querySelectorAll('.list-row')],read=name=>{const row=rows.find(item=>item.querySelector('b')?.textContent===name);return row?.querySelector('.project-counts')?.textContent?.trim()};return{parent:read('计数父项目'),child:read('计数子项目')}})()`,
        );
        const recurrenceResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),row=[...document.querySelectorAll('.cards article')].find(item=>item.querySelector('strong')?.textContent==='每日重复冒烟任务');row?.querySelector('.circle')?.click();await wait(900);const occurrences=(await window.bearTodo.listTasks()).filter(item=>item.title==='每日重复冒烟任务').sort((a,b)=>a.createdAt.localeCompare(b.createdAt));return{clicked:!!row,count:occurrences.length,oldStatus:occurrences[0]?.status,newStatus:occurrences[1]?.status,oldId:occurrences[0]?.id,newId:occurrences[1]?.id,oldDue:occurrences[0]?.due,newDue:occurrences[1]?.due}})()`,
        );
        Object.assign(result, { projectTreeCountResult, recurrenceResult });
        if (process.env.BEARAI_SMOKE_WORKSPACES_SCREENSHOT) {
          await win.webContents.executeJavaScript(
            `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));document.querySelector('.workspace-block')?.click();await wait(80);[...document.querySelectorAll('.workspace-menu button')].find(x=>x.textContent.includes('管理工作区'))?.click();await wait(180)})()`,
          );
          await writeFile(
            process.env.BEARAI_SMOKE_WORKSPACES_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
          await win.webContents.executeJavaScript(
            `document.querySelector('.workspace-manager>header>button')?.click()`,
          );
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
        const completedSectionResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),defaultRow=[...document.querySelectorAll('.list-row')].find(row=>row.querySelector('b')?.textContent==='默认项目');defaultRow?.querySelector('.list-main')?.click();await wait(180);const toggle=document.querySelector('.completed-toggle'),collapsed=toggle?.getAttribute('aria-expanded')==='false',label=toggle?.textContent.replace(/\\s+/g,' ').trim();toggle?.click();await wait(100);const shown=[...document.querySelectorAll('.completed-task strong')].map(x=>x.textContent),restoreRow=document.querySelector('.completed-task'),restoreTitle=restoreRow?.querySelector('strong')?.textContent;restoreRow?.querySelector('.circle.done')?.click();await wait(750);const persisted=(await window.bearTodo.listTasks()).find(x=>x.title===restoreTitle)?.status,remaining=document.querySelectorAll('.completed-task').length;return{collapsed,label,shown,persisted,remaining,expanded:toggle?.getAttribute('aria-expanded')==='true'}})()`,
        );
        Object.assign(result, { completedSectionResult });
        if (process.env.BEARAI_SMOKE_COMPLETED_SCREENSHOT)
          await writeFile(
            process.env.BEARAI_SMOKE_COMPLETED_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
        const completedChildGroupResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),parent=[...document.querySelectorAll('.cards article')].find(row=>row.querySelector('strong')?.textContent==='子任务分组父任务');parent?.querySelector('.task-expand')?.click();await wait(120);const group=document.querySelector('.child-completed-section'),collapsed=group?.querySelector('.completed-toggle')?.getAttribute('aria-expanded')==='false',label=group?.querySelector('.completed-toggle')?.textContent.replace(/\\s+/g,' ').trim();group?.querySelector('.completed-toggle')?.click();await wait(80);const child=group?.querySelector('.completed-task'),childTitle=child?.querySelector('strong')?.textContent;child?.querySelector('.circle.done')?.click();await wait(750);const persisted=(await window.bearTodo.listTasks()).find(x=>x.title===childTitle)?.status,remaining=document.querySelectorAll('.child-completed-section .completed-task').length,activeChild=[...document.querySelectorAll('.cards article strong')].some(x=>x.textContent===childTitle&&!x.classList.contains('strike'));return{collapsed,label,childTitle,persisted,remaining,activeChild}})()`,
        );
        Object.assign(result, { completedChildGroupResult });
        const voidedUiResult=await win.webContents.executeJavaScript(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),projects=await window.bearTodo.listProjects(),project=projects.find(x=>x.name==='默认项目'),created=await window.bearTodo.createTask('作废界面冒烟任务',project.projectId);document.querySelector('.workspace-refresh')?.click();await wait(500);const row=[...document.querySelectorAll('.cards article')].find(x=>x.querySelector('strong')?.textContent==='作废界面冒烟任务');row?.click();await wait(80);const oldPrompt=window.prompt;window.prompt=()=> '仅当天有效';document.querySelector('.void-task-button')?.click();await wait(650);window.prompt=oldPrompt;const persisted=(await window.bearTodo.listTasks()).find(x=>x.id===created.id),group=document.querySelector('.voided-section:not(.child-completed-section)'),collapsed=group?.querySelector('.voided-toggle')?.getAttribute('aria-expanded')==='false',completedLabel=document.querySelector('.completed-section:not(.voided-section) .completed-toggle')?.textContent.replace(/\s+/g,'').trim();group?.querySelector('.voided-toggle')?.click();await wait(80);const voidedRow=[...group.querySelectorAll('.voided-task')].find(x=>x.querySelector('strong')?.textContent==='作废界面冒烟任务');voidedRow?.querySelector('.circle.voided')?.click();await wait(650);const restored=(await window.bearTodo.listTasks()).find(x=>x.id===created.id);return{buttonFound:!!document.querySelector('.void-task-button')||!!voidedRow,persistedStatus:persisted?.status,reason:persisted?.voidReason,collapsed,completedLabel,restoredStatus:restored?.status,history:restored?.statusHistory?.map(x=>x.status)}})()`);
        Object.assign(result,{voidedUiResult});
        if (process.env.BEARAI_SMOKE_COMPLETED_CHILD_SCREENSHOT)
          await writeFile(
            process.env.BEARAI_SMOKE_COMPLETED_CHILD_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
        const dragQaResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),drag=async(source,target,clientY)=>{const dataTransfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,clientY}));await wait(30);const classes=target.className,allowed=/project-drop-(before|inside|after)|drop-(before|after|child)/.test(classes),forbidden=target.classList.contains('drop-forbidden');target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,clientY}));source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));await wait(450);return{allowed,forbidden,classes}};let projectRows=[...document.querySelectorAll('.list-row')],defaultRow=projectRows.find(row=>row.querySelector('b')?.textContent==='默认项目'),targetRow=projectRows.find(row=>row.querySelector('b')?.textContent==='拖拽目标项目'),projectIndicator=await drag(targetRow,defaultRow,defaultRow.getBoundingClientRect().top+4);projectRows=[...document.querySelectorAll('.list-row')];const crossSource=projectRows.find(row=>row.querySelector('b')?.textContent==='跨父子项目'),crossTarget=projectRows.find(row=>row.querySelector('b')?.textContent==='跨父目标项目'),crossMoveIndicator=await drag(crossSource,crossTarget,crossTarget.getBoundingClientRect().top+crossTarget.getBoundingClientRect().height/2);projectRows=[...document.querySelectorAll('.list-row')];const movedSource=projectRows.find(row=>row.querySelector('b')?.textContent==='跨父子项目'),grandchild=projectRows.find(row=>row.querySelector('b')?.textContent==='跨父孙项目'),cycleIndicator=await drag(movedSource,grandchild,grandchild.getBoundingClientRect().top+grandchild.getBoundingClientRect().height/2),selfIndicator=await drag(movedSource,movedSource,movedSource.getBoundingClientRect().top+movedSource.getBoundingClientRect().height/2);defaultRow=[...document.querySelectorAll('.list-row')].find(row=>row.querySelector('b')?.textContent==='默认项目');defaultRow.querySelector('.list-main').click();await wait(180);const taskRows=[...document.querySelectorAll('.cards article')],firstRow=taskRows.find(row=>row.querySelector('strong')?.textContent==='拖拽任务一'),secondRow=taskRows.find(row=>row.querySelector('strong')?.textContent==='拖拽任务二'),taskIndicator=await drag(secondRow,firstRow,firstRow.getBoundingClientRect().top+firstRow.getBoundingClientRect().height/2),projects=await window.bearTodo.listProjects(),tasks=await window.bearTodo.listTasks(),first=tasks.find(x=>x.title==='拖拽任务一'),second=tasks.find(x=>x.title==='拖拽任务二'),movedProject=projects.find(x=>x.name==='跨父子项目'),targetProject=projects.find(x=>x.name==='跨父目标项目'),subtreeTasks=tasks.filter(x=>x.title==='跨父任务'||x.title==='跨父孙任务');return{projectIndicator,taskIndicator,crossMoveIndicator,cycleIndicator,selfIndicator,projectOrder:projects.filter(x=>x.parentId===null).sort((a,b)=>a.order-b.order).map(x=>x.name),crossParentPersisted:movedProject?.parentId===targetProject?.projectId,subtreeTasksPreserved:subtreeTasks.length===2,taskNested:second?.parentId===first?.id,dropIndicatorsCleared:!document.querySelector('.project-drop-before,.project-drop-inside,.project-drop-after,.drop-before,.drop-after,.drop-child,.drop-forbidden')}})()`,
        );
        Object.assign(result, { dragQaResult });
        const archiveDialogResult=await win.webContents.executeJavaScript(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),row=()=>[...document.querySelectorAll('.list-row')].find(item=>item.querySelector('b')?.textContent==='归档弹窗项目'),open=async()=>{const target=row();target?.querySelector('.list-main')?.focus();target?.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:240,clientY:320}));await wait(60);[...document.querySelectorAll('.context-menu button')].find(x=>x.textContent.includes('归档'))?.click();await wait(80);return document.querySelector('.confirm-dialog')};let dialog=await open(),message=dialog?.querySelector('p')?.textContent,warning=message?.includes('1 个未完成任务'),initialFocus=document.activeElement?.textContent?.trim()==='取消';document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(80);const escClosed=!document.querySelector('.confirm-dialog'),focusRestored=document.activeElement===row()?.querySelector('.list-main');dialog=await open();dialog?.querySelector('.confirm-close')?.click();await wait(80);const closeClosed=!document.querySelector('.confirm-dialog');dialog=await open();dialog?.parentElement?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await wait(80);const backdropClosed=!document.querySelector('.confirm-dialog');dialog=await open();dialog?.querySelector('.primary')?.click();await wait(500);const confirmed=!(await window.bearTodo.listProjects()).some(x=>x.name==='归档弹窗项目');return{warning,initialFocus,escClosed,focusRestored,closeClosed,backdropClosed,confirmed}})()`);
        Object.assign(result,{archiveDialogResult});
        const taskProjectMoveQaResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),drag=async()=>{const source=[...document.querySelectorAll('.cards article')].find(row=>row.querySelector('strong')?.textContent==='拖拽任务一'),target=[...document.querySelectorAll('.list-row')].find(row=>row.querySelector('b')?.textContent==='拖拽目标项目'),dataTransfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}));source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));await wait(100)};await drag();const confirmationVisible=[...document.querySelectorAll('.modal h2')].some(x=>x.textContent.includes('确认移动任务'));[...document.querySelectorAll('.modal-actions button')].find(x=>x.textContent==='取消')?.click();await wait(100);const canceled=(await window.bearTodo.listTasks()).find(x=>x.title==='拖拽任务一')?.projectId===(await window.bearTodo.listProjects()).find(x=>x.name==='默认项目')?.projectId;await drag();[...document.querySelectorAll('.modal-actions button')].find(x=>x.textContent.includes('确认移动'))?.click();await wait(500);const projects=await window.bearTodo.listProjects(),tasks=await window.bearTodo.listTasks(),targetId=projects.find(x=>x.name==='拖拽目标项目')?.projectId,moved=tasks.filter(x=>x.title==='拖拽任务一'||x.title==='拖拽任务二').every(x=>x.projectId===targetId);return{confirmationVisible,canceled,moved}})()`,
        );
        Object.assign(result, { taskProjectMoveQaResult });
        const attachmentPreviewResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),plain=(await window.bearTodo.listTasks()).find(x=>x.title==='PNG附件冒烟任务')?.attachments[0];let directError='';try{await window.bearTodo.previewAttachment(plain)}catch(error){directError=String(error)}const title=[...document.querySelectorAll('.cards strong')].find(x=>x.textContent==='PNG附件冒烟任务');title?.closest('article')?.click();await wait(150);document.querySelector('.attachment-row')?.click();await wait(200);const errorText=document.querySelector('.error')?.textContent??'',opened=!!document.querySelector('.attachment-preview img'),cloneError=errorText.includes('could not be cloned');document.querySelector('.attachment-preview header button')?.click();document.querySelector('.detail-close')?.click();await wait(100);return{opened,cloneError,errorText,directError,closed:!document.querySelector('.attachment-preview')}})()`,
        );
        Object.assign(result, { attachmentPreviewResult });
        const autosaveResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),task=(await window.bearTodo.listTasks()).find(x=>x.title==='PNG附件冒烟任务'),title=[...document.querySelectorAll('.cards strong')].find(x=>x.textContent==='PNG附件冒烟任务');title?.closest('article')?.click();await wait(80);const input=document.querySelector('.task-title input'),setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const value of ['连续输入一','连续输入二','连续输入最终值']){setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}document.querySelector('.detail-close')?.click();await wait(800);const persisted=(await window.bearTodo.listTasks()).find(x=>x.id===task.id)?.title;return{persisted,passed:persisted==='连续输入最终值'}})()`,
        );
        Object.assign(result, { autosaveResult });
        if (process.env.BEARAI_SMOKE_INITIAL_SCREENSHOT)
          await writeFile(
            process.env.BEARAI_SMOKE_INITIAL_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
        const layoutResult = await win.webContents.executeJavaScript(
          `(()=>{const shell=document.querySelector('.shell').getBoundingClientRect(),nav=document.querySelector('.nav').getBoundingClientRect(),list=document.querySelector('.list').getBoundingClientRect();return{viewport:{width:innerWidth,height:innerHeight},shell:{width:shell.width,height:shell.height},nav:{top:nav.top,bottom:nav.bottom,height:nav.height},list:{left:list.left,right:list.right,width:list.width},bodyScroll:{width:document.body.scrollWidth,height:document.body.scrollHeight}}})()`,
        );
        Object.assign(result, {
          layoutResult,
          detailInitiallyHidden: await win.webContents.executeJavaScript(
            `!document.querySelector('.detail')`,
          ),
        });
        const detailControlsResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),title=[...document.querySelectorAll('.cards strong')].find(x=>x.textContent==='连续输入最终值');title?.closest('article')?.click();await wait(120);[...document.querySelectorAll('.task-kind button')].find(x=>x.textContent.includes('高级任务'))?.click();await wait(500);const detail=document.querySelector('.detail.advanced'),toolbar=[...document.querySelectorAll('.rich-toolbar button')].map(x=>x.getAttribute('aria-label')),ratio=detail?.getBoundingClientRect().width/innerWidth,triggers=[...document.querySelectorAll('.schedule-trigger')],reminder=triggers.find(x=>x.textContent.includes('提醒我')),due=triggers.find(x=>x.textContent.includes('截止时间'));reminder?.click();await wait(100);const quickChoices=[...document.querySelectorAll('.schedule-quick-menu button')].map(x=>x.textContent.trim());document.querySelector('.schedule-quick-menu button')?.click();await wait(750);reminder?.click();await wait(80);[...document.querySelectorAll('.schedule-quick-menu button')].find(x=>x.textContent.includes('选择日期和时间'))?.click();await wait(180);const reminderPickerOpened=!!document.querySelector('.date-picker-open-marker');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(100);due?.click();await wait(80);[...document.querySelectorAll('.schedule-quick-menu button')].find(x=>x.textContent.includes('选择日期'))?.click();await wait(180);const duePickerOpened=!!document.querySelector('.date-picker-open-marker');const task=(await window.bearTodo.listTasks()).find(x=>x.title==='连续输入最终值');return{toolbar,ratio,quickChoices,datePickerOpened:reminderPickerOpened&&duePickerOpened,reminderPickerOpened,duePickerOpened,reminderPersisted:!!task?.reminder}})()`,
        );
        Object.assign(result, { detailControlsResult });
        const editorWait = (milliseconds: number) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds));
        const editorSelectAll = async () => {
          await win.webContents.executeJavaScript(
            `document.querySelector('.ProseMirror')?.focus()`,
          );
          win.webContents.sendInputEvent({
            type: 'keyDown',
            keyCode: 'A',
            modifiers: ['control'],
          });
          win.webContents.sendInputEvent({
            type: 'keyUp',
            keyCode: 'A',
            modifiers: ['control'],
          });
          await editorWait(80);
        };
        const editorSelectLine = async () => {
          await win.webContents.executeJavaScript(
            `document.querySelector('.ProseMirror')?.focus()`,
          );
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Home' });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home' });
          win.webContents.sendInputEvent({
            type: 'keyDown',
            keyCode: 'End',
            modifiers: ['shift'],
          });
          win.webContents.sendInputEvent({
            type: 'keyUp',
            keyCode: 'End',
            modifiers: ['shift'],
          });
          await editorWait(240);
        };
        const editorSetText = async (value: string) => {
          await editorSelectAll();
          win.webContents.insertText(value);
          await editorWait(120);
        };
        const editorPress = async (label: string) => {
          const rect = await win.webContents.executeJavaScript(
            `(()=>{const button=[...document.querySelectorAll('.rich-toolbar button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(label)});if(!button)return null;const rect=button.getBoundingClientRect();return{x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}})()`,
          );
          if (!rect) return false;
          win.webContents.sendInputEvent({
            type: 'mouseDown',
            x: rect.x,
            y: rect.y,
            button: 'left',
            clickCount: 1,
          });
          win.webContents.sendInputEvent({
            type: 'mouseUp',
            x: rect.x,
            y: rect.y,
            button: 'left',
            clickCount: 1,
          });
          await editorWait(120);
          return true;
        };
        const editorHtml = () =>
          win.webContents.executeJavaScript(
            `document.querySelector('.ProseMirror')?.innerHTML??''`,
          );
        const editorToolbarResult: Record<string, unknown> = await win.webContents.executeJavaScript(
          `(()=>{const editor=document.querySelector('.ProseMirror');return{editorFound:!!editor,toolbar:[...document.querySelectorAll('.rich-toolbar button')].map(x=>({label:x.getAttribute('aria-label'),disabled:x.disabled})),floatingButtons:[...document.querySelectorAll('[data-milkdown-root] button,.milkdown button')].filter(x=>!x.closest('.rich-toolbar')&&x.offsetParent).map(x=>x.getAttribute('aria-label')||x.textContent.trim()).filter(Boolean)}})()`,
        );
        await editorSetText('浮动工具栏验证');
        const selectionPoints = await win.webContents.executeJavaScript(
          `(()=>{const text=document.querySelector('.ProseMirror p')?.firstChild;if(!text)return null;const start=document.createRange(),end=document.createRange();start.setStart(text,0);start.setEnd(text,1);end.setStart(text,text.textContent.length-1);end.setEnd(text,text.textContent.length);const a=start.getBoundingClientRect(),b=end.getBoundingClientRect();return{start:{x:Math.round(a.left+1),y:Math.round(a.top+a.height/2)},end:{x:Math.round(b.right-1),y:Math.round(b.top+b.height/2)}}})()`,
        );
        if (selectionPoints) {
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            ...selectionPoints.start,
          });
          win.webContents.sendInputEvent({
            type: 'mouseDown',
            ...selectionPoints.start,
            button: 'left',
            clickCount: 1,
          });
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            ...selectionPoints.end,
          });
          win.webContents.sendInputEvent({
            type: 'mouseUp',
            ...selectionPoints.end,
            button: 'left',
            clickCount: 1,
          });
          await editorWait(240);
        }
        await editorSelectLine();
        editorToolbarResult.floatingButtons =
          await win.webContents.executeJavaScript(
            `[...document.querySelectorAll('.milkdown-toolbar [data-toolbar-item]')].filter(x=>x.offsetParent).map(x=>x.getAttribute('data-toolbar-item'))`,
          );
        const floatingBoldRect = await win.webContents.executeJavaScript(
          `(()=>{const button=document.querySelector('.milkdown-toolbar [data-toolbar-item="bold"]');if(!button||!button.offsetParent)return null;const rect=button.getBoundingClientRect();return{x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}})()`,
        );
        if (floatingBoldRect) {
          for (let index = 0; index < 2; index++) {
            win.webContents.sendInputEvent({
              type: 'mouseDown',
              ...floatingBoldRect,
              button: 'left',
              clickCount: 1,
            });
            win.webContents.sendInputEvent({
              type: 'mouseUp',
              ...floatingBoldRect,
              button: 'left',
              clickCount: 1,
            });
            await editorWait(140);
            editorToolbarResult[
              index === 0 ? 'floatingBoldApplied' : 'floatingBoldRemoved'
            ] =
              index === 0
                ? (await editorHtml()).includes('<strong>')
                : !(await editorHtml()).includes('<strong>');
          }
        }
        const floatingCases = [
          { key: 'italic', tag: '<em>', result: 'FloatingItalic' },
          { key: 'strikethrough', tag: '<del>', result: 'FloatingStrike' },
          { key: 'code', tag: '<code>', result: 'FloatingCode' },
        ];
        for (const item of floatingCases) {
          await editorSetText(`浮动${item.key}验证`);
          await editorSelectLine();
          const rect = await win.webContents.executeJavaScript(
            `(()=>{const button=document.querySelector('.milkdown-toolbar [data-toolbar-item=${JSON.stringify(item.key)}]');if(!button||!button.offsetParent)return null;const rect=button.getBoundingClientRect();return{x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}})()`,
          );
          if (!rect) continue;
          for (let index = 0; index < 2; index++) {
            win.webContents.sendInputEvent({
              type: 'mouseDown',
              ...rect,
              button: 'left',
              clickCount: 1,
            });
            win.webContents.sendInputEvent({
              type: 'mouseUp',
              ...rect,
              button: 'left',
              clickCount: 1,
            });
            await editorWait(160);
            const hasTag = (await editorHtml()).includes(item.tag);
            editorToolbarResult[
              `${item.result}${index === 0 ? 'Applied' : 'Removed'}`
            ] = index === 0 ? hasTag : !hasTag;
          }
        }
        await editorSetText('格式测试');
        await editorSelectAll();
        await editorPress('粗体');
        editorToolbarResult.boldApplied = (await editorHtml()).includes('<strong>');
        await editorSelectAll();
        await editorPress('粗体');
        editorToolbarResult.boldRemoved = !(await editorHtml()).includes('<strong>');
        await editorSelectAll();
        await editorPress('斜体');
        editorToolbarResult.italicApplied = (await editorHtml()).includes('<em>');
        await editorSelectAll();
        await editorPress('删除线');
        editorToolbarResult.strikeApplied = /<(del|s)>/.test(await editorHtml());
        await editorSetText('标题测试');
        await editorPress('标题（二级）');
        editorToolbarResult.headingApplied = (await editorHtml()).includes('<h2');
        await editorPress('标题（二级）');
        editorToolbarResult.headingRemoved = !(await editorHtml()).includes('<h2');
        await editorSetText('无序项');
        await editorPress('无序列表');
        editorToolbarResult.bulletApplied = (await editorHtml()).includes('<ul');
        await editorPress('无序列表');
        editorToolbarResult.bulletRemoved = !(await editorHtml()).includes('<ul');
        await editorSetText('有序项');
        await editorPress('有序列表');
        editorToolbarResult.orderedApplied = (await editorHtml()).includes('<ol');
        await editorSetText('引用内容');
        await editorPress('引用');
        editorToolbarResult.quoteApplied = (await editorHtml()).includes('<blockquote');
        await editorSetText('行内代码');
        await editorSelectAll();
        await editorPress('行内代码');
        editorToolbarResult.inlineCodeApplied = (await editorHtml()).includes('<code');
        await editorSetText('代码块');
        await editorPress('代码块');
        editorToolbarResult.codeBlockHtml = await editorHtml();
        editorToolbarResult.codeBlockApplied = String(
          editorToolbarResult.codeBlockHtml,
        ).includes('milkdown-code-block');
        await editorPress('代码块');
        editorToolbarResult.codeBlockRemoved = !(await editorHtml()).includes(
          'milkdown-code-block',
        );
        await editorSetText('撤销基础');
        await editorSelectAll();
        win.webContents.insertText('撤销后内容');
        await editorWait(120);
        await editorPress('撤销');
        editorToolbarResult.undoApplied = !(await editorHtml()).includes('撤销后内容');
        await editorPress('重做');
        editorToolbarResult.redoApplied = (await editorHtml()).includes('撤销后内容');
        await win.webContents.executeJavaScript(
          `(()=>{const editor=document.querySelector('.ProseMirror');editor.focus();document.execCommand('selectAll');document.execCommand('insertHTML',false,'<p>跨段第一</p><p>跨段第二</p>')})()`,
        );
        await editorWait(120);
        await editorSelectAll();
        await editorPress('粗体');
        editorToolbarResult.crossParagraphBold =
          (await win.webContents.executeJavaScript(
            `document.querySelectorAll('.ProseMirror strong').length`,
          )) >= 2;
        await editorSetText('浮动链接验证');
        await editorSelectLine();
        const linkRect=await win.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.milkdown-toolbar [data-toolbar-item="link"]');if(!button||!button.offsetParent)return null;const rect=button.getBoundingClientRect();return{x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}})()`);
        if(linkRect){win.webContents.sendInputEvent({type:'mouseDown',...linkRect,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...linkRect,button:'left',clickCount:1});await editorWait(180);editorToolbarResult.FloatingLinkEditorOpened=await win.webContents.executeJavaScript(`!!document.querySelector('.link-edit input')`);await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.link-edit input');if(!input)return;input.value='https://example.com/editor-link';input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:input.value}))})()`);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await editorWait(220);editorToolbarResult.FloatingLinkApplied=(await editorHtml()).includes('href="https://example.com/editor-link"');await editorSelectLine();const editRect=await win.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.milkdown-toolbar [data-toolbar-item="link"]');if(!button||!button.offsetParent)return null;const rect=button.getBoundingClientRect();return{x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}})()`);if(editRect){win.webContents.sendInputEvent({type:'mouseDown',...editRect,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...editRect,button:'left',clickCount:1});await editorWait(160);win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await editorWait(120);editorToolbarResult.FloatingLinkRemoved=!(await editorHtml()).includes('href="https://example.com/editor-link"')}}
        const pasteClipboard = async () => {
          await editorSetText('待替换');
          await editorSelectAll();
          win.webContents.sendInputEvent({type:'keyDown',keyCode:'V',modifiers:['control']});
          win.webContents.sendInputEvent({type:'keyUp',keyCode:'V',modifiers:['control']});
          await editorWait(700);
        };
        clipboard.writeText('系统剪贴板纯文本');
        await pasteClipboard();
        editorToolbarResult.clipboardText=(await editorHtml()).includes('系统剪贴板纯文本');
        clipboard.write({text:'网页粗体与链接',html:'<p><strong>网页粗体</strong>与<a href="https://example.com/path">链接</a></p>'});
        await pasteClipboard();
        const clipboardHtml=await editorHtml();
        editorToolbarResult.clipboardHtml=clipboardHtml.includes('<strong>网页粗体</strong>')&&clipboardHtml.includes('href="https://example.com/path"');
        const qaPng=await readFile(join(app.getAppPath(),'build','icon.png'));
        clipboard.writeImage(nativeImage.createFromBuffer(qaPng));
        editorToolbarResult.clipboardImageReady=!clipboard.readImage().isEmpty();
        await pasteClipboard();
        await editorWait(900);
        editorToolbarResult.clipboardImage=await win.webContents.executeJavaScript(`!!document.querySelector('.ProseMirror img[src^="bearai-asset://attachment/"]')`);
        editorToolbarResult.uploadButtonVisible=await win.webContents.executeJavaScript(`!![...document.querySelectorAll('.rich-toolbar button')].find(x=>x.getAttribute('aria-label')==='插入图片'&&!x.disabled&&x.offsetParent)`);
        if(editorToolbarResult.uploadButtonVisible)editorToolbarResult.uploadTriggered=await win.webContents.executeJavaScript(`(async()=>{const input=document.querySelector('.editor-image-input'),bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/XPbWHwAAAABJRU5ErkJggg=='),x=>x.charCodeAt(0)),file=new File([bytes],'visible-upload.png',{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(file);Object.defineProperty(input,'files',{configurable:true,value:transfer.files});input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,1400));return!!document.querySelector('.ProseMirror img[alt="visible-upload.png"]')})()`);
        await editorWait(900);
        Object.assign(editorToolbarResult,await win.webContents.executeJavaScript(`(async()=>{const task=(await window.bearTodo.listTasks()).find(x=>x.title==='连续输入最终值'),inline=task?.attachments.filter(x=>x.role==='inline')??[];return{persistedNote:task?.note,inlineAttachmentCount:inline.length,inlinePaths:inline.map(x=>x.relativePath),inlineFiles:await Promise.all(inline.map(async x=>(await window.bearTodo.previewAttachment(x)).supported))}})()`));
        Object.assign(result, { editorToolbarResult });
        result.headerLayoutAdvanced=await win.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.list'),header=document.querySelector('.list-header'),heading=document.querySelector('.heading-block'),actions=document.querySelector('.header-actions'),title=document.querySelector('.heading-block h1,.breadcrumbs'),more=document.querySelector('.more');return{listWidth:list.getBoundingClientRect().width,twoRows:actions.getBoundingClientRect().top>=heading.getBoundingClientRect().bottom-1,titleWidth:title.getBoundingClientRect().width,titleHeight:title.getBoundingClientRect().height,titleOverflow:title.scrollWidth>title.clientWidth,moreVisible:more&&more.getBoundingClientRect().width>=40,headerOverflow:header.scrollWidth>header.clientWidth,bodyOverflow:document.body.scrollWidth>document.body.clientWidth}})()`);
        if (process.env.BEARAI_SMOKE_DETAIL_CONTROLS_SCREENSHOT)
          await writeFile(
            process.env.BEARAI_SMOKE_DETAIL_CONTROLS_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
        await win.webContents.executeJavaScript(
          `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('.detail-close')?.click()`,
        );
        await new Promise((resolve) => setTimeout(resolve, 120));
        result.headerLayoutNoDetail=await win.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.list'),header=document.querySelector('.list-header'),heading=document.querySelector('.heading-block'),actions=document.querySelector('.header-actions'),title=document.querySelector('.heading-block h1,.breadcrumbs'),more=document.querySelector('.more');return{listWidth:list.getBoundingClientRect().width,twoRows:actions.getBoundingClientRect().top>=heading.getBoundingClientRect().bottom-1,titleWidth:title.getBoundingClientRect().width,titleHeight:title.getBoundingClientRect().height,titleOverflow:title.scrollWidth>title.clientWidth,moreVisible:more&&more.getBoundingClientRect().width>=40,headerOverflow:header.scrollWidth>header.clientWidth,bodyOverflow:document.body.scrollWidth>document.body.clientWidth}})()`);
        const newProjectDialogResult=await win.webContents.executeJavaScript(`(async()=>{const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),button=document.querySelector('.new-row button'),source=document.querySelector('.new-row input');button.click();await wait();let input=document.querySelector('.modal input[aria-label="名称"]'),focused=document.activeElement===input;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'自动聚焦项目');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();const escClosed=!document.querySelector('.modal input[aria-label="名称"]'),focusRestored=document.activeElement===button;button.click();await wait();input=document.querySelector('.modal input[aria-label="名称"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'自动聚焦项目');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await new Promise(resolve=>setTimeout(resolve,350));return{focused,escClosed,focusRestored,enterCreated:[...document.querySelectorAll('.list-main b')].some(x=>x.textContent==='自动聚焦项目')}})()`);
        Object.assign(result,{newProjectDialogResult});
        if (process.env.BEARAI_SMOKE_DETAIL_SCREENSHOT) {
          await win.webContents.executeJavaScript(
            `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),input=document.querySelector('.add input'),setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'界面布局检查任务');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter'}));await wait(300);[...document.querySelectorAll('.task-kind button')].find(x=>x.textContent.includes('高级任务'))?.click();await wait(450)})()`,
          );
          await writeFile(
            process.env.BEARAI_SMOKE_DETAIL_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
        }
        const uiResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),setInput=(input,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};let row=document.querySelector('.list-row');row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:250,clientY:300}));await wait(100);[...document.querySelectorAll('.context-menu button')].find(x=>x.textContent.includes('新增子项目')).click();await wait(100);let input=document.querySelector('.modal>input');const subprojectDialogVisible=!!input;setInput(input,'界面子项目');document.querySelector('.modal').requestSubmit();await wait(300);const subprojectCreated=[...document.querySelectorAll('.list-main b')].some(x=>x.textContent==='界面子项目');row=document.querySelector('.list-row');row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:250,clientY:300}));await wait(100);[...document.querySelectorAll('.context-menu button')].find(x=>x.textContent.includes('属性')).click();await wait(150);const propertiesVisible=!!document.querySelector('.properties-modal');document.querySelector('.modal-backdrop').dispatchEvent(new MouseEvent('click',{bubbles:true}));await wait(100);document.querySelector('.account-block').click();await wait(100);const accountMenuVisible=!!document.querySelector('.account-menu');[...document.querySelectorAll('.account-menu button')].find(x=>x.textContent.includes('设置')).click();await wait(200);return{subprojectDialogVisible,subprojectCreated,propertiesVisible,accountMenuVisible,settingsVisible:!!document.querySelector('.settings-modal'),workspacePath:document.querySelector('.path-box')?.textContent}})()`,
        );
        Object.assign(result, uiResult);
        Object.assign(result, {
          archiveUiVisible: await win.webContents.executeJavaScript(
            `[...document.querySelectorAll('.settings-layout nav button')].some(button=>button.textContent.includes('归档'))`,
          ),
        });
        const customThemeUiResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),setValue=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};[...document.querySelectorAll('.settings-layout nav button')].find(x=>x.textContent.trim()==='外观')?.click();await wait(80);[...document.querySelectorAll('.custom-theme-manager button')].find(x=>x.textContent.includes('新增主题'))?.click();await wait(100);const form=document.querySelector('.custom-theme-composer'),input=form?.querySelector('input[aria-label="新主题名称"]'),composerVisible=!!form,nameInputVisible=!!input;if(input){setValue(input,'冒烟自定义主题');form.requestSubmit();await wait(120)}const card=[...document.querySelectorAll('.custom-theme-card')].find(x=>x.querySelector('input[aria-label="主题名称"]')?.value==='冒烟自定义主题'),colors=card?[...card.querySelectorAll('input[type=color]')]:[];if(colors[0])setValue(colors[0],'#112233');if(colors[1])setValue(colors[1],'#334455');await wait(80);const cloneErrorBeforeSave=document.querySelector('.error')?.textContent.includes('could not be cloned')??false;[...card.querySelectorAll('.custom-theme-actions button')].find(x=>x.textContent.trim()==='保存')?.click();await wait(280);const saved=(await window.bearTodo.getSettings()).customThemes.find(theme=>theme.name==='冒烟自定义主题'),savedColors=saved?.tokens.scene==='#112233'&&saved?.tokens.sceneLayer==='#334455';[...card.querySelectorAll('.custom-theme-actions button')].find(x=>x.textContent.includes('保存并应用'))?.click();await wait(250);const applied=(await window.bearTodo.getSettings()).theme===saved?.id,colorsRetained=(await window.bearTodo.getSettings()).customThemes.find(theme=>theme.id===saved?.id)?.tokens.scene==='#112233';[...card.querySelectorAll('.custom-theme-actions button')].find(x=>x.textContent.includes('复制为新主题'))?.click();await wait(120);const copyVisible=[...document.querySelectorAll('.custom-theme-card input[aria-label="主题名称"]')].some(x=>x.value.includes('副本'));[...document.querySelectorAll('.theme-options button')].find(x=>x.textContent.trim()==='海岸')?.click();await wait(220);const globalCoast=(await window.bearTodo.getSettings()).theme==='coast';return{composerVisible,nameInputVisible,persisted:!!saved,savedColors,applied,colorsRetained,copyVisible,cloneErrorBeforeSave,globalCoast}})()`,
        );
        Object.assign(result, { customThemeUiResult });
        if (process.env.BEARAI_SMOKE_SETTINGS_SCREENSHOT)
          await writeFile(
            process.env.BEARAI_SMOKE_SETTINGS_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
        const interactionMetrics = await win.webContents.executeJavaScript(
          `(()=>{const toggle=document.querySelector('.tree-toggle:not(.hidden)'),smart=document.querySelector('.smart-row'),account=document.querySelector('.account-block');return{treeToggle:toggle?{width:toggle.getBoundingClientRect().width,height:toggle.getBoundingClientRect().height,cursor:getComputedStyle(toggle).cursor}:null,smartCursor:getComputedStyle(smart).cursor,accountCursor:getComputedStyle(account).cursor}})()`,
        );
        Object.assign(result, { interactionMetrics });
        const projectHeaderResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));document.querySelector('.modal-actions button')?.click();[...document.querySelectorAll('.list-main')].find(x=>x.textContent.includes('界面子项目'))?.click();await wait(100);document.querySelector('.more')?.click();await wait(100);const themeButton=document.querySelector('.theme-swatches button[aria-label="林间"]');themeButton?.click();await wait(350);return{breadcrumbDepth:document.querySelectorAll('.breadcrumbs button').length,counts:document.querySelector('.status-stats')?.textContent,themeButtonFound:!!themeButton,shellClass:document.querySelector('.shell')?.className,projectThemeApplied:document.querySelector('.shell')?.classList.contains('theme-forest')}})()`,
        );
        Object.assign(result, { projectHeaderResult });
        const expansionMenuResult = await win.webContents.executeJavaScript(
          `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),defaultRow=[...document.querySelectorAll('.list-row')].find(row=>row.querySelector('b')?.textContent==='默认项目'),main=defaultRow?.querySelector('.list-main');main?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait(80);const inlineInput=defaultRow?.querySelector('.project-inline-input'),renameDragDisabled=defaultRow?.getAttribute('draggable')==='false'&&inlineInput?.getAttribute('draggable')==='false';inlineInput?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));main?.click();await wait(120);document.querySelector('.more')?.click();await wait(80);document.querySelector('.theme-swatches button[aria-label="林间"]')?.click();await wait(220);document.querySelector('.more')?.click();await wait(100);const menu=document.querySelector('.project-menu'),labels=menu?[...menu.querySelectorAll('.menu-label')].map(x=>x.textContent.trim()):[],buttonElements=menu?[...menu.querySelectorAll('button')]:[],buttons=buttonElements.map(x=>x.textContent.trim()),choices=menu?[...menu.querySelectorAll('.task-expansion-choice')]:[],checkedChoices=choices.filter(x=>x.getAttribute('aria-checked')==='true').map(x=>x.textContent.trim()),trigger=menu?.querySelector('.depth-picker-trigger');trigger?.click();await wait(80);const options=[...document.querySelectorAll('.depth-picker-menu [role=option]')].map(x=>x.textContent.trim()),manual=buttonElements.find(x=>x.textContent.includes('手动排序')),depth=buttonElements.find(x=>x.textContent.includes('默认展开到')),rect=trigger?.getBoundingClientRect(),triggerText=trigger?.textContent.trim(),selectFont=trigger?getComputedStyle(trigger).fontSize:null,manualFont=manual?getComputedStyle(manual).fontSize:null,depthFont=depth?getComputedStyle(depth).fontSize:null,resetButton=buttonElements.find(x=>x.textContent.includes('重设为全局默认'));resetButton?.click();await wait(300);const resetToGlobal=!!resetButton&&document.querySelector('.shell')?.classList.contains('theme-coast');return{menuFound:!!menu,labels,buttons,options,first:options[0],triggerText,triggerWidth:rect?.width,hasRemember:buttons.includes('记住上次展开情况'),hasProjectExpansion:labels.includes('项目展开'),choiceCount:choices.length,checkedChoices,renameDragDisabled,manualFont,depthFont,selectFont,resetToGlobal}})()`,
        );
        Object.assign(result, { expansionMenuResult });
        if (process.env.BEARAI_SMOKE_MENU_SCREENSHOT) {
          await win.webContents.executeJavaScript(
            `(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));document.querySelector('.more')?.click();await wait(100);const trigger=document.querySelector('.depth-picker-trigger');if(trigger?.getAttribute('aria-expanded')!=='true')trigger?.click();await wait(100)})()`,
          );
          let screenshot = (await win.webContents.capturePage()).toPNG();
          if (!screenshot.length) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            screenshot = (await win.webContents.capturePage()).toPNG();
          }
          await writeFile(process.env.BEARAI_SMOKE_MENU_SCREENSHOT, screenshot);
        }
        if (process.env.BEARAI_SMOKE_SCREENSHOT)
          await writeFile(
            process.env.BEARAI_SMOKE_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
        if (process.env.BEARAI_SMOKE_PROJECT_SCREENSHOT) {
          await win.webContents.executeJavaScript(
            `document.querySelector('.modal-actions button')?.click();[...document.querySelectorAll('.list-main')].at(-1)?.click()`,
          );
          await new Promise((resolve) => setTimeout(resolve, 250));
          await writeFile(
            process.env.BEARAI_SMOKE_PROJECT_SCREENSHOT,
            (await win.webContents.capturePage()).toPNG(),
          );
        }
        Object.assign(result, { smokeRendererMessages });
        console.log(`BEARAI_SMOKE ${JSON.stringify(result)}`);
        const layoutPass =
          result.layoutResult.nav.height > 700 &&
          result.layoutResult.nav.bottom <=
            result.layoutResult.viewport.height &&
          result.layoutResult.list.width > 900 &&
          result.layoutResult.bodyScroll.height ===
            result.layoutResult.viewport.height;
        const interactionPass =
          result.interactionMetrics.treeToggle?.width >= 32 &&
          result.interactionMetrics.treeToggle?.height >= 32 &&
          result.interactionMetrics.treeToggle?.cursor === "pointer" &&
          result.interactionMetrics.smartCursor === "pointer" &&
          result.interactionMetrics.accountCursor === "pointer";
        const projectHeaderPass =
          result.projectHeaderResult.breadcrumbDepth >= 2 &&
          result.projectHeaderResult.counts?.includes("未完成") &&
          result.projectHeaderResult.counts?.includes("已完成") &&
          result.projectHeaderResult.counts?.includes("全部") &&
          result.projectHeaderResult.projectThemeApplied;
        const expansionPass =
          result.expansionMenuResult.menuFound &&
          result.expansionMenuResult.first === "第一层" &&
          result.expansionMenuResult.options.join("|") ===
            "第一层|第二层|第三层|第四层|第五层|全部" &&
          result.expansionMenuResult.buttons.includes("默认不展开") &&
          result.expansionMenuResult.buttons.includes("默认展开到") &&
          result.expansionMenuResult.triggerText === "全部" &&
          result.expansionMenuResult.triggerWidth >= 110 &&
          result.expansionMenuResult.hasRemember &&
          result.expansionMenuResult.hasProjectExpansion &&
          result.expansionMenuResult.choiceCount === 3 &&
          result.expansionMenuResult.checkedChoices.length === 1 &&
          result.expansionMenuResult.renameDragDisabled &&
          result.expansionMenuResult.resetToGlobal &&
          result.expansionMenuResult.manualFont ===
            result.expansionMenuResult.depthFont &&
          result.expansionMenuResult.manualFont ===
            result.expansionMenuResult.selectFont;
        const detailControlsPass =
          result.detailControlsResult.ratio > 0.49 &&
          result.detailControlsResult.ratio < 0.51 &&
          result.detailControlsResult.toolbar.includes("粗体") &&
          result.detailControlsResult.toolbar.includes("撤销") &&
          result.detailControlsResult.quickChoices.includes("选择日期和时间") &&
          result.detailControlsResult.datePickerOpened &&
          result.detailControlsResult.reminderPersisted;
        const projectDragPass=result.dragQaResult.projectIndicator.allowed&&result.dragQaResult.crossMoveIndicator.allowed&&result.dragQaResult.crossParentPersisted&&result.dragQaResult.subtreeTasksPreserved&&result.dragQaResult.cycleIndicator.forbidden&&result.dragQaResult.selfIndicator.forbidden;
        const archiveDialogPass=result.archiveDialogResult.warning&&result.archiveDialogResult.initialFocus&&result.archiveDialogResult.escClosed&&result.archiveDialogResult.focusRestored&&result.archiveDialogResult.closeClosed&&result.archiveDialogResult.backdropClosed&&result.archiveDialogResult.confirmed;
        const editorToolbarPass=result.editorToolbarResult.editorFound&&result.editorToolbarResult.toolbar.length===12&&result.editorToolbarResult.toolbar.every((item:{disabled:boolean})=>!item.disabled)&&result.editorToolbarResult.boldApplied&&result.editorToolbarResult.boldRemoved&&result.editorToolbarResult.italicApplied&&result.editorToolbarResult.strikeApplied&&result.editorToolbarResult.headingApplied&&result.editorToolbarResult.headingRemoved&&result.editorToolbarResult.bulletApplied&&result.editorToolbarResult.bulletRemoved&&result.editorToolbarResult.orderedApplied&&result.editorToolbarResult.quoteApplied&&result.editorToolbarResult.inlineCodeApplied&&result.editorToolbarResult.codeBlockApplied&&result.editorToolbarResult.codeBlockRemoved&&result.editorToolbarResult.undoApplied&&result.editorToolbarResult.redoApplied&&result.editorToolbarResult.crossParagraphBold&&result.editorToolbarResult.floatingButtons.join(',')==='bold,italic,strikethrough,code,link'&&result.editorToolbarResult.floatingBoldApplied&&result.editorToolbarResult.floatingBoldRemoved&&result.editorToolbarResult.FloatingItalicApplied&&result.editorToolbarResult.FloatingItalicRemoved&&result.editorToolbarResult.FloatingStrikeApplied&&result.editorToolbarResult.FloatingStrikeRemoved&&result.editorToolbarResult.FloatingCodeApplied&&result.editorToolbarResult.FloatingCodeRemoved&&result.editorToolbarResult.FloatingLinkEditorOpened&&result.editorToolbarResult.FloatingLinkApplied&&result.editorToolbarResult.FloatingLinkRemoved&&result.editorToolbarResult.clipboardText&&result.editorToolbarResult.clipboardHtml&&result.editorToolbarResult.clipboardImage&&result.editorToolbarResult.uploadButtonVisible&&result.editorToolbarResult.uploadTriggered&&result.editorToolbarResult.inlineAttachmentCount>=2&&result.editorToolbarResult.inlineFiles.every(Boolean);
        const headerLayoutPass=[result.headerLayoutAdvanced,result.headerLayoutNoDetail].every((layout:{listWidth:number;twoRows:boolean;titleHeight:number;moreVisible:boolean;headerOverflow:boolean;bodyOverflow:boolean})=>(layout.listWidth>900||layout.twoRows)&&layout.titleHeight<80&&layout.moreVisible&&!layout.headerOverflow&&!layout.bodyOverflow);
        const newProjectDialogPass=result.newProjectDialogResult.focused&&result.newProjectDialogResult.escClosed&&result.newProjectDialogResult.focusRestored&&result.newProjectDialogResult.enterCreated;
        const workspacePass =
          result.workspaceQaResult.registered &&
          result.workspaceQaResult.menuVisible &&
          result.workspaceQaResult.labels.includes("管理工作区…") &&
          result.workspaceQaResult.switched &&
          result.workspaceQaResult.isolatedProjects &&
          result.workspaceQaResult.activeLabel === "第二工作区" &&
          result.workspaceQaResult.restored &&
          result.workspaceQaResult.originalProjects &&
          result.workspaceQaResult.refreshButtonFound &&
          result.workspaceQaResult.refreshTitle === "重新加载项目及任务文件" &&
          result.workspaceQaResult.absentBeforeRefresh &&
          result.workspaceQaResult.appearedAfterRefresh;
        const completedSectionPass =
          result.completedSectionResult.collapsed &&
          result.completedSectionResult.label?.includes("已完成") &&
          result.completedSectionResult.label?.includes("2") &&
          result.completedSectionResult.shown.length === 2 &&
          result.completedSectionResult.persisted === "active" &&
          result.completedSectionResult.remaining === 1 &&
          result.completedSectionResult.expanded;
        const completedChildGroupPass =
          result.completedChildGroupResult.collapsed &&
          result.completedChildGroupResult.label?.includes("已完成") &&
          result.completedChildGroupResult.label?.includes("2") &&
          result.completedChildGroupResult.childTitle?.startsWith("已完成分组子任务") &&
          result.completedChildGroupResult.persisted === "active" &&
          result.completedChildGroupResult.remaining === 1 &&
          result.completedChildGroupResult.activeChild;
        const voidedUiPass=result.voidedUiResult.buttonFound&&result.voidedUiResult.persistedStatus==='voided'&&result.voidedUiResult.reason==='仅当天有效'&&result.voidedUiResult.collapsed&&result.voidedUiResult.restoredStatus==='active'&&result.voidedUiResult.history?.join('|')==='voided|active';
        app.exit(
          result.projectPersisted &&
            result.childProjectPersisted &&
            result.taskPersisted &&
            result.childPersisted &&
            result.dragQaResult.taskNested &&
            result.dragQaResult.dropIndicatorsCleared &&
            projectDragPass &&
            archiveDialogPass &&
            editorToolbarPass &&
            headerLayoutPass &&
            newProjectDialogPass &&
            result.taskProjectMoveQaResult.confirmationVisible &&
            result.taskProjectMoveQaResult.canceled &&
            result.taskProjectMoveQaResult.moved &&
            result.attachmentPreviewResult.opened &&
            !result.attachmentPreviewResult.cloneError &&
            result.attachmentPreviewResult.closed &&
            result.autosaveResult.passed &&
            result.subprojectDialogVisible &&
            result.subprojectCreated &&
            result.propertiesVisible &&
            result.accountMenuVisible &&
            result.settingsVisible &&
            result.archiveUiVisible &&
            result.customThemeUiResult.composerVisible &&
            result.customThemeUiResult.nameInputVisible &&
            result.customThemeUiResult.persisted &&
            result.customThemeUiResult.savedColors &&
            result.customThemeUiResult.applied &&
            result.customThemeUiResult.colorsRetained &&
            result.customThemeUiResult.copyVisible &&
            result.customThemeUiResult.globalCoast &&
            !result.customThemeUiResult.cloneErrorBeforeSave &&
            result.detailInitiallyHidden &&
            result.projectTreeCountResult.parent === "3" &&
            result.projectTreeCountResult.child === "3" &&
            result.recurrenceResult.clicked &&
            result.recurrenceResult.count === 2 &&
            result.recurrenceResult.oldStatus === "completed" &&
            result.recurrenceResult.newStatus === "active" &&
            result.recurrenceResult.oldId !== result.recurrenceResult.newId &&
            result.recurrenceResult.oldDue !== result.recurrenceResult.newDue &&
            workspacePass &&
            completedSectionPass &&
            completedChildGroupPass &&
            voidedUiPass &&
            layoutPass &&
            interactionPass &&
            projectHeaderPass &&
            expansionPass &&
            detailControlsPass
            ? 0
            : 1,
        );
      } catch (error) {
        console.error("BEARAI_SMOKE_FAILED", error);
        app.exit(1);
      }
    });
}
app.whenReady().then(async () => {
  const legacySettingsRepository = new SettingsRepository(
      join(app.getPath("userData"), "settings.json"),
    ),
    legacySettings = await legacySettingsRepository.read(),
    initialPath =
      process.env.BEARAI_TODO_DATA_DIR ??
      (process.argv.includes("--smoke")
        ? join(app.getPath("userData"), "workspace")
        : (legacySettings.workspacePath ?? join(app.getPath("userData"), "data")));
  workspaceRegistryRepository = new WorkspaceRegistryRepository(
    join(app.getPath("userData"), "workspaces.json"),
  );
  let registry = await workspaceRegistryRepository.ensure(initialPath),
    active = registry.workspaces.find(
      (item) => item.workspaceId === registry.activeWorkspaceId,
    ) ?? registry.workspaces[0];
  await initializeActiveWorkspace(active.path);
  try {
    await stat(join(dataRoot, ".bearai-settings.json"));
  } catch {
    const { currentUser: _currentUser, ...workspaceSettings } = legacySettings;
    await settingsRepository.save({ ...workspaceSettings, workspacePath: null });
    if (legacySettings.currentUser)
      registry = await workspaceRegistryRepository.setUser(
        legacySettings.currentUser,
      );
  }
  protocol.handle("bearai-asset", async (request) => {
    const id = new URL(request.url).pathname.replace(/^\//, "");
    const attachment = (await repository.list())
      .flatMap((task) => task.attachments)
      .find((item) => item.id === id);
    if (!attachment) return new Response("Not found", { status: 404 });
    return net.fetch(
      pathToFileURL(attachmentPath(attachment.relativePath)).toString(),
    );
  });
  protocol.handle("bearai-theme", async (request) => {
    const root = resolve(dataRoot, ".theme-assets"),
      name = basename(new URL(request.url).pathname),
      target = resolve(root, name);
    if (!target.startsWith(root + "\\"))
      return new Response("Forbidden", { status: 403 });
    try {
      await stat(target);
      return net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  ipcMain.handle("app:health", () => ({ ok: true, dataRoot }));
  ipcMain.handle("tasks:list", async () => {
    const tasks = await repository.list();
    await workspaceRepository.updateStatistics(
      tasks.filter((task) => task.status === "active").length,
      tasks.filter((task) => task.status === "completed").length,
    );
    return tasks;
  });
  ipcMain.handle(
    "tasks:create",
    (_event, title: string, projectId: string, parentId: string | null) =>
      repository.create(title, projectId, parentId),
  );
  ipcMain.handle(
    "tasks:save",
    async (_event, task, expectedRevision: number) => {
      const saved = await repository.save(task, expectedRevision);
      scheduleReminder(saved);
      return saved;
    },
  );
  ipcMain.handle("tasks:complete", async (_event, taskId: string, expectedRevision: number) => {
    const result = await repository.complete(taskId, expectedRevision);
    scheduleReminder(result.completed);
    if (result.next) scheduleReminder(result.next);
    return result;
  });
  ipcMain.handle("tasks:void",async(_event,taskId:string,expectedRevision:number,reason?:string)=>{const result=await repository.void(taskId,expectedRevision,reason);scheduleReminder(result.voided);if(result.next)scheduleReminder(result.next);return result});
  ipcMain.handle("tasks:restore-voided",async(_event,taskId:string,expectedRevision:number)=>{const task=await repository.restoreVoided(taskId,expectedRevision);scheduleReminder(task);return task});
  ipcMain.handle("tasks:instances:find",(_event,instanceKey:string)=>repository.findInstance(instanceKey));
  ipcMain.handle("tasks:instances:ensure",async(_event,request)=>{const result=await repository.ensureInstance(request);scheduleReminder(result.task);return result});
  ipcMain.handle("tasks:instances:void-expired",async(_event,today:string,reason?:string)=>{const tasks=await repository.voidExpired(today,reason);tasks.forEach(scheduleReminder);return tasks});
  ipcMain.handle("tasks:place", async (_event, placement) => {
    const saved = await repository.place(placement);
    scheduleReminder(saved);
    return saved;
  });
  ipcMain.handle("attachments:add", async (event, taskId: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender),
      result = owner
        ? await dialog.showOpenDialog(owner, {
            title: "添加附件",
            properties: ["openFile", "multiSelections"],
          })
        : await dialog.showOpenDialog({
            title: "添加附件",
            properties: ["openFile", "multiSelections"],
          });
    if (result.canceled) return [];
    const folder = join(dataRoot, ".attachments", taskId);
    await mkdir(folder, { recursive: true });
    return Promise.all(
      result.filePaths.map(async (source) => {
        const id = randomUUID(),
          name = basename(source),
          target = join(folder, `${id.slice(0, 8)}--${name}`);
        await copyFile(source, target);
        const info = await stat(target);
        return {
          id,
          name,
          relativePath: relative(dataRoot, target).replace(/\\/g, "/"),
          mime:
            mimeTypes[extname(name).toLowerCase()] ??
            "application/octet-stream",
          size: info.size,
          createdAt: new Date().toISOString(),
        } satisfies TaskAttachment;
      }),
    );
  });
  ipcMain.handle(
    "attachments:import-image",
    async (
      _event,
      taskId: string,
      name: string,
      mime: string,
      bytes: ArrayBuffer,
    ) => {
      if (!mime.startsWith("image/")) throw new Error("编辑器只接受图片");
      if (bytes.byteLength > 25 * 1024 * 1024)
        throw new Error("图片超过 25 MB");
      const id = randomUUID(),
        folder = join(dataRoot, ".attachments", taskId),
        safe = basename(name).replace(/[<>:"/\\|?*]/g, "_"),
        target = join(folder, `${id.slice(0, 8)}--${safe}`);
      await mkdir(folder, { recursive: true });
      await writeFile(target, Buffer.from(bytes));
      return {
        id,
        name: safe,
        relativePath: relative(dataRoot, target).replace(/\\/g, "/"),
        mime,
        size: bytes.byteLength,
        createdAt: new Date().toISOString(),
      } satisfies TaskAttachment;
    },
  );
  ipcMain.handle("clipboard:read-image", () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    return {
      name: `clipboard-${Date.now()}.png`,
      mime: "image/png",
      bytes: Array.from(image.toPNG()),
    };
  });
  ipcMain.handle(
    "attachments:remove",
    async (_event, attachment: TaskAttachment) => {
      await rm(attachmentPath(attachment.relativePath), { force: true });
      return true;
    },
  );
  ipcMain.handle(
    "attachments:preview",
    async (_event, attachment: TaskAttachment) => {
      const path = attachmentPath(attachment.relativePath),
        buffer = await readFile(path);
      if (buffer.length > 25 * 1024 * 1024)
        return { supported: false, reason: "文件超过 25 MB，不支持内置预览" };
      const previewable =
        /^(image|audio|video)\//.test(attachment.mime) ||
        attachment.mime === "application/pdf" ||
        /^(text\/|application\/json)/.test(attachment.mime);
      if (!previewable)
        return {
          supported: false,
          reason: `暂不支持 ${attachment.mime} 格式的内置预览`,
        };
      return {
        supported: true,
        mime: attachment.mime,
        dataUrl: `data:${attachment.mime};base64,${buffer.toString("base64")}`,
        text: /^(text\/|application\/json)/.test(attachment.mime)
          ? buffer.toString("utf8")
          : undefined,
      };
    },
  );
  ipcMain.handle(
    "attachments:download",
    async (event, attachment: TaskAttachment) => {
      const owner = BrowserWindow.fromWebContents(event.sender),
        result = owner
          ? await dialog.showSaveDialog(owner, {
              title: "保存附件",
              defaultPath: attachment.name,
            })
          : await dialog.showSaveDialog({
              title: "保存附件",
              defaultPath: attachment.name,
            });
      if (result.canceled || !result.filePath) return false;
      await copyFile(attachmentPath(attachment.relativePath), result.filePath);
      return true;
    },
  );
  ipcMain.handle("projects:list", () => projectRepository.initialize());
  ipcMain.handle("projects:list-archived", async () =>
    Promise.all(
      (await projectRepository.listArchived()).map(async (project) => {
        const tasks = await new TaskRepository(
          join(dataRoot, project.relativePath),
        ).list();
        return {
          project,
          active: tasks.filter((task) => task.status === "active").length,
          completed: tasks.filter((task) => task.status === "completed").length,
          total: tasks.length,
          tasks,
        };
      }),
    ),
  );
  ipcMain.handle(
    "projects:create",
    (_event, name: string, parentId: string | null) =>
      projectRepository.create(name, parentId),
  );
  ipcMain.handle("projects:rename", (_event, projectId: string, name: string) =>
    projectRepository.rename(projectId, name),
  );
  ipcMain.handle("projects:update", (_event, projectId: string, patch) =>
    projectRepository.update(projectId, patch),
  );
  ipcMain.handle("projects:open-folder", async (_event, projectId: string) => {
    const project = await projectRepository.get(projectId);
    return shell.openPath(resolve(dataRoot, project.relativePath));
  });
  ipcMain.handle(
    "projects:move",
    (_event, projectId: string, parentId: string | null) =>
      projectRepository.move(projectId, parentId),
  );
  ipcMain.handle("projects:reorder", (_event, placement) =>
    projectRepository.reorder(placement),
  );
  ipcMain.handle("projects:move-checked", (_event, placement) =>
    projectRepository.moveChecked(placement),
  );
  ipcMain.handle("projects:archive", (_event, projectId: string,expectedRevision?:number) =>
    projectRepository.archive(projectId,expectedRevision),
  );
  ipcMain.handle("settings:get", async () => {
    const registry = await workspaceRegistryRepository.read();
    return {
      ...(await settingsRepository.read()),
      workspacePath: dataRoot,
      currentUser: registry.user,
    };
  });
  ipcMain.handle("settings:set-theme", async (_event, theme) => ({
    ...(await settingsRepository.setTheme(theme)),
    workspacePath: dataRoot,
  }));
  ipcMain.handle("settings:set-preferences", async (_event, patch) => {
    const { currentUser, ...workspacePatch } = patch;
    if (currentUser) await workspaceRegistryRepository.setUser(currentUser);
    const saved = await settingsRepository.setPreferences(workspacePatch);
    return {
      ...saved,
      workspacePath: dataRoot,
      currentUser: (await workspaceRegistryRepository.read()).user,
    };
  });
  ipcMain.handle(
    "settings:choose-theme-background",
    async (event, themeId: string) => {
      if (!/^theme-[a-zA-Z0-9-]+$/.test(themeId))
        throw new Error("主题 ID 无效");
      const owner = BrowserWindow.fromWebContents(event.sender),
        options = {
          title: "选择自定义主题背景",
          properties: ["openFile"] as "openFile"[],
          filters: [
            { name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
          ],
        };
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return null;
      const source = result.filePaths[0],
        extension = extname(source).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension))
        throw new Error("仅支持 PNG、JPEG、WebP 或 GIF 背景");
      const folder = join(dataRoot, ".theme-assets"),
        name = `${themeId}-${randomUUID()}${extension}`;
      await mkdir(folder, { recursive: true });
      await copyFile(source, join(folder, name));
      return `bearai-theme://asset/${name}`;
    },
  );
  ipcMain.handle("settings:change-workspace", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender),
      options = {
        title: "选择新的熊智ToDo工作目录",
        properties: ["openDirectory", "createDirectory"] as (
          "openDirectory" | "createDirectory"
        )[],
        buttonLabel: "选择并迁移",
      };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const migration = await migrateWorkspace(dataRoot, result.filePaths[0]);
    const registry = await workspaceRegistryRepository.read();
    if (!registry.activeWorkspaceId) throw new Error("当前工作区未注册");
    await workspaceRegistryRepository.updatePath(
      registry.activeWorkspaceId,
      result.filePaths[0],
    );
    await initializeActiveWorkspace(result.filePaths[0]);
    return { canceled: false, migration, workspacePath: dataRoot };
  });
  ipcMain.handle("workspaces:list", () => workspaceRegistryRepository.read());
  ipcMain.handle("workspaces:switch", async (_event, workspaceId: string) => {
    const registry = await workspaceRegistryRepository.activate(workspaceId),
      target = registry.workspaces.find(
        (item) => item.workspaceId === workspaceId,
      );
    if (!target) throw new Error("工作区未注册");
    await initializeActiveWorkspace(target.path);
    return registry;
  });
  ipcMain.handle("workspaces:add", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender),
      options = {
        title: "添加熊智ToDo工作区",
        properties: ["openDirectory"] as "openDirectory"[],
        buttonLabel: "添加工作区",
      },
      result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const configPath = join(result.filePaths[0], ".bearai-workspace.json");
    try {
      await stat(configPath);
    } catch {
      throw new Error("所选目录不是熊智ToDo工作区；请使用“新建工作区”创建");
    }
    const registry = await workspaceRegistryRepository.add(
      result.filePaths[0],
      true,
    );
    await initializeActiveWorkspace(result.filePaths[0]);
    return { canceled: false, registry };
  });
  ipcMain.handle("workspaces:create", async (event, name: string) => {
    const normalized = String(name).trim();
    if (!normalized) throw new Error("工作区名称不能为空");
    const owner = BrowserWindow.fromWebContents(event.sender),
      options = {
        title: "选择新工作区目录",
        properties: ["openDirectory", "createDirectory"] as (
          | "openDirectory"
          | "createDirectory"
        )[],
        buttonLabel: "在此创建",
      },
      result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const root = resolve(result.filePaths[0]);
    if ((await readFile(join(root, ".bearai-workspace.json"), "utf8").catch(() => null)))
      throw new Error("所选目录已经是工作区，请使用“添加现有工作区”");
    const workspace = await new WorkspaceRepository(root).initialize();
    await new WorkspaceRepository(root).save({
      ...workspace,
      name: normalized,
      revision: workspace.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    const registry = await workspaceRegistryRepository.add(root, true);
    await initializeActiveWorkspace(root);
    return { canceled: false, registry };
  });
  ipcMain.handle(
    "workspaces:rename",
    (_event, workspaceId: string, name: string) =>
      workspaceRegistryRepository.rename(workspaceId, name),
  );
  ipcMain.handle("workspaces:remove", async (_event, workspaceId: string) => {
    const registry = await workspaceRegistryRepository.remove(workspaceId),
      target = registry.workspaces.find(
        (item) => item.workspaceId === registry.activeWorkspaceId,
      );
    if (!target) throw new Error("没有可切换的工作区");
    if (resolve(target.path) !== dataRoot)
      await initializeActiveWorkspace(target.path);
    return registry;
  });
  ipcMain.handle("workspaces:open", async (_event, workspaceId: string) => {
    const registry = await workspaceRegistryRepository.read(),
      target = registry.workspaces.find((item) => item.workspaceId === workspaceId);
    if (!target) throw new Error("工作区未注册");
    return shell.openPath(target.path);
  });
  ipcMain.on("window:minimize", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize(),
  );
  ipcMain.on("window:toggle-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on("window:close", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.close(),
  );
  if (process.argv.includes("--smoke")) {
    const projects = await projectRepository.list(),
      defaultProject = projects.find((project) => project.name === "默认项目")!,
      existingTitles = new Set(
        (await repository.list()).map((task) => task.title),
      );
    if (!projects.some((project) => project.name === "拖拽目标项目"))
      await projectRepository.create("拖拽目标项目", null);
    let dragParentA=(await projectRepository.list()).find(project=>project.name==='跨父源项目');
    if(!dragParentA)dragParentA=await projectRepository.create('跨父源项目',null);
    let dragParentB=(await projectRepository.list()).find(project=>project.name==='跨父目标项目');
    if(!dragParentB)dragParentB=await projectRepository.create('跨父目标项目',null);
    let dragChild=(await projectRepository.list()).find(project=>project.name==='跨父子项目');
    if(!dragChild)dragChild=await projectRepository.create('跨父子项目',dragParentA.projectId);
    let dragGrandchild=(await projectRepository.list()).find(project=>project.name==='跨父孙项目');
    if(!dragGrandchild)dragGrandchild=await projectRepository.create('跨父孙项目',dragChild.projectId);
    let archiveQaProject=(await projectRepository.list()).find(project=>project.name==='归档弹窗项目');
    if(!archiveQaProject)archiveQaProject=await projectRepository.create('归档弹窗项目',null);
    let countParent = projects.find(project => project.name === "计数父项目");
    if (!countParent) countParent = await projectRepository.create("计数父项目", null);
    let countChild = (await projectRepository.list()).find(project => project.name === "计数子项目");
    if (!countChild) countChild = await projectRepository.create("计数子项目", countParent.projectId);
    let recurrenceProject = (await projectRepository.list()).find(project => project.name === "重复验收项目");
    if (!recurrenceProject) recurrenceProject = await projectRepository.create("重复验收项目", null);
    for (const title of ["子项目计数任务一", "子项目计数任务二", "子项目计数任务三"])
      if (!existingTitles.has(title)) await repository.create(title, countChild.projectId);
    if (!existingTitles.has("拖拽任务一"))
      await repository.create("拖拽任务一", defaultProject.projectId);
    if (!existingTitles.has("拖拽任务二"))
      await repository.create("拖拽任务二", defaultProject.projectId);
    if(!existingTitles.has('跨父任务'))await repository.create('跨父任务',dragChild.projectId)
    if(!existingTitles.has('跨父孙任务'))await repository.create('跨父孙任务',dragGrandchild.projectId)
    if(!existingTitles.has('归档警告任务'))await repository.create('归档警告任务',archiveQaProject.projectId)
    for (const title of ["已完成冒烟任务一", "已完成冒烟任务二"])
      if (!existingTitles.has(title)) {
        const completed = await repository.create(title, defaultProject.projectId);
        await repository.save(
          { ...completed, status: "completed" },
          completed.revision,
        );
      }
    if (!existingTitles.has("子任务分组父任务")) {
      const parent = await repository.create(
        "子任务分组父任务",
        defaultProject.projectId,
      );
      for (const title of ["已完成分组子任务一", "已完成分组子任务二"]) {
        const child = await repository.create(
          title,
          defaultProject.projectId,
          parent.id,
        );
        await repository.save({ ...child, status: "completed" }, child.revision);
      }
    }
    if (!existingTitles.has("每日重复冒烟任务")) {
      const recurring = await repository.create("每日重复冒烟任务", recurrenceProject.projectId);
      const today = new Date(), due = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
      await repository.save({ ...recurring, due, repeat: { frequency: "daily", interval: 1 } }, recurring.revision);
    }
    const task = await repository.create("PNG附件冒烟任务");
    const id = randomUUID(),
      folder = join(dataRoot, ".attachments", task.id),
      name = "preview.png",
      target = join(folder, `${id.slice(0, 8)}--${name}`),
      png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
    await mkdir(folder, { recursive: true });
    await writeFile(target, png);
    await repository.save(
      {
        ...task,
        due: new Date().toISOString().slice(0, 10),
        attachments: [
          {
            id,
            name,
            relativePath: relative(dataRoot, target).replace(/\\/g, "/"),
            mime: "image/png",
            size: png.length,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      task.revision,
    );
    const secondaryRoot = join(app.getPath("userData"), "workspace-secondary"),
      secondaryWorkspaceRepository = new WorkspaceRepository(secondaryRoot),
      secondaryWorkspace = await secondaryWorkspaceRepository.initialize();
    await secondaryWorkspaceRepository.save({
      ...secondaryWorkspace,
      name: "第二工作区",
      revision: secondaryWorkspace.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    const secondaryProjects = new ProjectRepository(secondaryRoot);
    await secondaryProjects.initialize();
    if (!(await secondaryProjects.list()).some((item) => item.name === "第二工作区项目"))
      await secondaryProjects.create("第二工作区项目", null);
    await workspaceRegistryRepository.add(secondaryRoot, false);
  }
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
