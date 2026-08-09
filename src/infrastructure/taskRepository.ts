import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  RevisionConflictError,
  type Task,
  type EnsureTaskInstanceDto,
  type TaskPlacementDto,
} from "../domain/task.js";
import { parseTask, serializeTask } from "./taskCodec.js";
import { nextRecurringTask } from "../domain/taskRecurrence.js";
import { ProjectRepository } from "./workspaceRepository.js";
import { withWorkspaceWriteLock } from "./workspaceWriteLock.js";

function safeFileTitle(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 80) || "任务"
  );
}
export class TaskRepository {
  private projects: ProjectRepository;
  private instanceQueue:Promise<void>=Promise.resolve();
  constructor(private readonly root: string,private readonly hooks:{beforeAtomicRename?:(target:string,temp:string)=>void|Promise<void>;lockTimeoutMs?:number;lockStaleMs?:number}={}) {
    this.projects = new ProjectRepository(root);
  }
  private withWrite<T>(work:()=>Promise<T>){return withWorkspaceWriteLock(this.root,work,{timeoutMs:this.hooks.lockTimeoutMs,staleMs:this.hooks.lockStaleMs})}
  async get(id: string) {
    const found = (await this.files()).find((item) => item.task.id === id);
    if (!found) throw new Error("任务不存在");
    return found.task;
  }
  async list() {
    return (await this.files())
      .map((item) => item.task)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async create(
    title: string,
    projectId?: string,
    parentId: string | null = null,
  ) {
    return this.withWrite(()=>this.createUnlocked(title,projectId,parentId));
  }
  private async createUnlocked(title:string,projectId?:string,parentId:string|null=null) {
    const projects = await this.projects.initialize();
    const project =
      projects.find((item) => item.projectId === projectId) ??
      projects.find(
        (item) => item.name === "默认项目" && item.parentId === null,
      ) ??
      projects[0];
    if (!project) throw new Error("没有可用项目");
    const current = await this.list(),
      now = new Date().toISOString(),
      id = randomUUID();
    if (parentId) {
      const parent = current.find((item) => item.id === parentId);
      if (!parent || parent.projectId !== project.projectId)
        throw new Error("父任务不在当前项目");
    }
    const task: Task = {
      schema: "bearai.todo/task@2",
      id,
      revision: 1,
      title: title.trim(),
      projectId: project.projectId,
      parentId,
      order: current.filter(
        (item) =>
          item.projectId === project.projectId &&
          (item.parentId ?? null) === parentId,
      ).length,
      status: "active",
      favorite: false,
      kind: "simple",
      tags: [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
      note: "",
      extra: {},
    };
    if (!task.title) throw new Error("任务标题不能为空");
    const path = join(
      this.root,
      project.relativePath,
      `${safeFileTitle(task.title)}--${id.slice(0, 8)}.md`,
    );
    await this.atomicWrite(path, serializeTask(task));
    return task;
  }
  async save(task: Task, expectedRevision: number) {
    return this.withWrite(()=>this.saveUnlocked(task,expectedRevision));
  }
  private async saveUnlocked(task:Task,expectedRevision:number) {
    const found = (await this.files()).find((item) => item.task.id === task.id);
    if (!found) throw new Error("任务不存在");
    if (found.task.revision !== expectedRevision)
      throw new RevisionConflictError(expectedRevision, found.task.revision);
    const next = {
      ...task,
      schema: "bearai.todo/task@2" as const,
      favorite: task.favorite ?? task.important ?? false,
      revision: found.task.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.atomicWrite(found.path, serializeTask(next));
    return next;
  }
  async complete(id: string, expectedRevision: number) {
    return this.withWrite(()=>this.completeUnlocked(id,expectedRevision));
  }
  private async completeUnlocked(id:string,expectedRevision:number) {
    const files = await this.files(), found = files.find((item) => item.task.id === id);
    if (!found) throw new Error("任务不存在");
    if (found.task.revision !== expectedRevision)
      throw new RevisionConflictError(expectedRevision, found.task.revision);
    if (found.task.status === "completed") return { completed: found.task, next: null };
    if (found.task.status === "voided") throw new Error("已作废任务不能完成，请先重新启用");
    const completedAt = new Date().toISOString();
    if (!found.task.repeat) {
      const completed = await this.save({ ...found.task, status: "completed", completedAt }, expectedRevision);
      return { completed, next: null };
    }
    const {next,path:nextPath,created}=await this.ensureNextOccurrence(found.task,files,new Date(completedAt));
    try {
      const completed = await this.save({ ...found.task, status: "completed", completedAt }, expectedRevision);
      return { completed, next };
    } catch (reason) {
      if(created)await rm(nextPath!, { force: true });
      throw reason;
    }
  }
  async void(id:string,expectedRevision:number,reason='用户作废'){
    return this.withWrite(()=>this.voidUnlocked(id,expectedRevision,reason));
  }
  private async voidUnlocked(id:string,expectedRevision:number,reason:string){
    const files=await this.files(),found=files.find(item=>item.task.id===id);
    if(!found)throw new Error('任务不存在');
    if(found.task.revision!==expectedRevision)throw new RevisionConflictError(expectedRevision,found.task.revision);
    if(found.task.status==='voided')return{voided:found.task,next:found.task.recurrenceSourceId?null:files.find(item=>item.task.recurrenceSourceId===id)?.task??null};
    if(found.task.status==='completed')throw new Error('已完成任务不能直接作废，请先恢复任务');
    const voidedAt=new Date().toISOString(),history=[...(found.task.statusHistory??[]),{status:'voided' as const,at:voidedAt,reason}];
    const occurrence=found.task.repeat?await this.ensureNextOccurrence(found.task,files,new Date(voidedAt)):null,next=occurrence?.next??null,nextPath=occurrence?.path??null;
    try{return{voided:await this.save({...found.task,status:'voided',voidedAt,voidReason:reason,statusHistory:history},expectedRevision),next}}
    catch(error){if(occurrence?.created&&nextPath)await rm(nextPath,{force:true});throw error}
  }
  async restoreVoided(id:string,expectedRevision:number){
    return this.withWrite(()=>this.restoreVoidedUnlocked(id,expectedRevision));
  }
  private async restoreVoidedUnlocked(id:string,expectedRevision:number){
    const task=await this.get(id);if(task.revision!==expectedRevision)throw new RevisionConflictError(expectedRevision,task.revision);if(task.status!=='voided')throw new Error('任务不是作废状态');
    const at=new Date().toISOString();return this.save({...task,status:'active',voidedAt:null,statusHistory:[...(task.statusHistory??[]),{status:'active',at,reason:'从作废状态恢复'}]},expectedRevision);
  }
  async findInstance(instanceKey:string){return (await this.list()).find(task=>task.instanceKey===instanceKey)??null}
  ensureInstance(dto:EnsureTaskInstanceDto){
    const run=()=>this.withWrite(async()=>{if(!dto.instanceKey.trim())throw new Error('实例键不能为空');if(!/^\d{4}-\d{2}-\d{2}$/.test(dto.validOn))throw new Error('validOn 必须是 YYYY-MM-DD');const existing=await this.findInstance(dto.instanceKey);if(existing)return{task:existing,created:false};const title=dto.title.trim();if(!title)throw new Error('任务标题不能为空');const projects=await this.projects.initialize(),project=projects.find(item=>item.projectId===dto.projectId);if(!project||project.archived)throw new Error('实例所属项目不可用');const current=await this.list(),parentId=dto.parentId??null;if(parentId){const parent=current.find(item=>item.id===parentId);if(!parent||parent.projectId!==project.projectId)throw new Error('父任务不在当前项目')}const now=new Date().toISOString(),id=randomUUID(),task:Task={schema:'bearai.todo/task@2',id,revision:1,title,projectId:project.projectId,parentId,order:current.filter(item=>item.projectId===project.projectId&&(item.parentId??null)===parentId).length,status:'active',favorite:false,kind:'simple',due:dto.due??dto.validOn,repeat:dto.repeat??null,tags:dto.tags??[],attachments:[],createdAt:now,updatedAt:now,note:dto.note??'',extra:{},instanceKey:dto.instanceKey,validOn:dto.validOn,rollover:dto.rollover,statusHistory:[]},path=join(this.root,project.relativePath,`${safeFileTitle(task.title)}--${id.slice(0,8)}.md`);await this.atomicWrite(path,serializeTask(task));return{task,created:true}});
    const result=this.instanceQueue.then(run,run);this.instanceQueue=result.then(()=>undefined,()=>undefined);return result;
  }
  async voidExpired(today:string,reason='超过有效日期自动作废'){
    return this.withWrite(()=>this.voidExpiredUnlocked(today,reason));
  }
  private async voidExpiredUnlocked(today:string,reason:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new Error('today 必须是 YYYY-MM-DD');const results:Task[]=[];
    for(const task of (await this.list()).filter(item=>item.status==='active'&&item.rollover==='forbidden'&&Boolean(item.validOn)&&item.validOn!<today)){const result=await this.void(task.id,task.revision,reason);results.push(result.voided)}return results;
  }
  private async ensureNextOccurrence(task:Task,files:{path:string;task:Task}[],now:Date){
    if(!task.repeat)throw new Error('任务没有重复规则');const candidate=nextRecurringTask(task,randomUUID(),now),existing=files.find(item=>item.task.recurrenceSourceId===task.id||(candidate.instanceKey&&item.task.instanceKey===candidate.instanceKey));if(existing)return{next:existing.task,path:existing.path,created:false};const project=(await this.projects.list()).find(item=>item.projectId===task.projectId);if(!project)throw new Error('任务所属项目不存在');candidate.order=files.filter(item=>item.task.projectId===candidate.projectId&&(item.task.parentId??null)===(candidate.parentId??null)).length;const path=join(this.root,project.relativePath,`${safeFileTitle(candidate.title)}--${candidate.id.slice(0,8)}.md`);await this.atomicWrite(path,serializeTask(candidate));return{next:candidate,path,created:true};
  }
  async place(dto: TaskPlacementDto) {
    return this.withWrite(()=>this.placeUnlocked(dto));
  }
  private async placeUnlocked(dto:TaskPlacementDto) {
    const files = await this.files(),
      found = files.find((item) => item.task.id === dto.taskId);
    if (!found) throw new Error("任务不存在");
    if (found.task.projectId !== dto.sourceProjectId)
      throw new Error("任务来源项目已变化");
    if (found.task.revision !== dto.expectedRevision)
      throw new RevisionConflictError(
        dto.expectedRevision,
        found.task.revision,
      );
    const targetProject = (await this.projects.list()).find(
      (item) => item.projectId === dto.targetProjectId,
    );
    if (!targetProject || targetProject.archived)
      throw new Error("目标项目不可用");
    const descendants = new Set<string>(),
      visit = (id: string) => {
        for (const item of files.filter(
          (value) => value.task.parentId === id,
        )) {
          descendants.add(item.task.id);
          visit(item.task.id);
        }
      };
    visit(found.task.id);
    if (dto.targetParentId === found.task.id)
      throw new Error("任务不能成为自己的子任务");
    if (dto.targetParentId && descendants.has(dto.targetParentId))
      throw new Error("任务不能移动到自己的后代");
    const targetParent = dto.targetParentId
      ? files.find((item) => item.task.id === dto.targetParentId)?.task
      : null;
    if (
      dto.targetParentId &&
      (!targetParent || targetParent.projectId !== dto.targetProjectId)
    )
      throw new Error("目标父任务不在目标项目");
    const movingIds = new Set([found.task.id, ...descendants]),
      siblings = files
        .map((item) => item.task)
        .filter(
          (task) =>
            task.projectId === dto.targetProjectId &&
            (task.parentId ?? null) === dto.targetParentId &&
            !movingIds.has(task.id),
        )
        .sort(
          (a, b) =>
            (a.order ?? Number.MAX_SAFE_INTEGER) -
              (b.order ?? Number.MAX_SAFE_INTEGER) ||
            a.createdAt.localeCompare(b.createdAt),
        );
    let index = dto.beforeId
      ? siblings.findIndex((item) => item.id === dto.beforeId)
      : dto.afterId
        ? siblings.findIndex((item) => item.id === dto.afterId) + 1
        : siblings.length;
    if (index < 0) throw new Error("排序目标不在目标层级");
    siblings.splice(index, 0, found.task);
    const now = new Date().toISOString(),
      updates = new Map<string, Task>();
    siblings.forEach((task, order) =>
      updates.set(task.id, {
        ...task,
        parentId:
          task.id === found.task.id ? dto.targetParentId : task.parentId,
        projectId: dto.targetProjectId,
        order,
        revision: task.revision + 1,
        updatedAt: now,
      }),
    );
    if (dto.targetProjectId !== dto.sourceProjectId) {
      for (const id of descendants) {
        const task = files.find((item) => item.task.id === id)!.task;
        updates.set(id, {
          ...task,
          projectId: dto.targetProjectId,
          revision: task.revision + 1,
          updatedAt: now,
        });
      }
    } else if (!updates.has(found.task.id)) {
      updates.set(found.task.id, {
        ...found.task,
        parentId: dto.targetParentId,
        projectId: dto.targetProjectId,
        revision: found.task.revision + 1,
        updatedAt: now,
      });
    }
    if (dto.targetProjectId === dto.sourceProjectId) {
      const backups = new Map<string, string>();
      try {
        for (const [id, task] of updates) {
          const item = files.find((value) => value.task.id === id)!;
          backups.set(item.path, await readFile(item.path, "utf8"));
          await this.atomicWrite(item.path, serializeTask(task));
        }
      } catch (error) {
        for (const [path, content] of backups)
          await this.atomicWrite(path, content).catch(() => undefined);
        throw error;
      }
    } else {
      await this.moveTaskFiles(
        files.filter((item) => movingIds.has(item.task.id)),
        updates,
        targetProject.relativePath,
      );
    }
    return this.get(found.task.id);
  }
  private async moveTaskFiles(
    items: { path: string; task: Task }[],
    updates: Map<string, Task>,
    targetRelativePath: string,
  ) {
    const transaction = join(this.root, ".move-tx", randomUUID()),
      staged: {
        source: string;
        backup: string;
        stage: string;
        target: string;
      }[] = [];
    await mkdir(transaction, { recursive: true });
    try {
      for (const item of items) {
        const task = updates.get(item.task.id)!,
          stage = join(transaction, basename(item.path)),
          target = join(this.root, targetRelativePath, basename(item.path)),
          backup = `${item.path}.${randomUUID()}.movebak`;
        try {
          await stat(target);
          throw new Error(`目标任务文件已存在：${basename(target)}`);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.startsWith("目标任务文件已存在")
          )
            throw error;
        }
        await this.atomicWrite(stage, serializeTask(task));
        staged.push({ source: item.path, backup, stage, target });
      }
      for (const item of staged) await rename(item.source, item.backup);
      try {
        for (const item of staged) {
          await mkdir(dirname(item.target), { recursive: true });
          await rename(item.stage, item.target);
        }
      } catch (error) {
        for (const item of staged) {
          await rename(item.target, item.stage).catch(() => undefined);
          await rename(item.backup, item.source).catch(() => undefined);
        }
        throw error;
      }
      for (const item of staged) await unlink(item.backup);
    } finally {
      await rm(transaction, { recursive: true, force: true });
    }
  }
  private async files() {
    const result: { path: string; task: Task }[] = [];
    await this.walk(this.root, result, null);
    return result;
  }
  private async walk(
    directory: string,
    result: { path: string; task: Task }[],
    inheritedProjectId: string | null,
  ) {
    await mkdir(directory, { recursive: true });
    let projectId = inheritedProjectId;
    try {
      projectId =
        JSON.parse(
          await readFile(join(directory, ".bearai-project.json"), "utf8"),
        ).projectId ?? projectId;
    } catch {}
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.walk(path, result, projectId);
        continue;
      }
      if (extname(entry.name).toLocaleLowerCase() !== ".md") continue;
      try {
        const task = parseTask(await readFile(path, "utf8"));
        result.push({
          path,
          task: { ...task, projectId: projectId ?? task.projectId },
        });
      } catch {}
    }
  }
  private async atomicWrite(path: string, content: string) {
    if (!resolve(path).startsWith(resolve(this.root) + sep))
      throw new Error("任务路径越界");
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temp, "wx");
      try {await handle.writeFile(content, "utf8");await handle.sync()} finally {await handle.close()}
      await this.hooks.beforeAtomicRename?.(path,temp);
      await rename(temp, path);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
  }
}
