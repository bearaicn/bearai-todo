import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RevisionConflictError, type Task } from '../domain/task.js'
import { parseTask, serializeTask } from './taskCodec.js'
import { ProjectRepository } from './workspaceRepository.js'

function safeFileTitle(value:string){return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/[. ]+$/g,'').slice(0,80)||'任务'}
export class TaskRepository {
  private projects:ProjectRepository
  constructor(private readonly root:string){this.projects=new ProjectRepository(root)}
  async get(id:string){const found=(await this.files()).find(item=>item.task.id===id);if(!found)throw new Error('任务不存在');return found.task}
  async list(){return (await this.files()).map(item=>item.task).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
  async create(title:string,projectId?:string,parentId:string|null=null){const projects=await this.projects.initialize();const project=projects.find(item=>item.projectId===projectId)??projects.find(item=>item.name==='默认项目'&&item.parentId===null)??projects[0];if(!project)throw new Error('没有可用项目');const now=new Date().toISOString(),id=randomUUID();const task:Task={schema:'bearai.todo/task@2',id,revision:1,title:title.trim(),projectId:project.projectId,parentId,status:'active',favorite:false,kind:'simple',tags:[],attachments:[],createdAt:now,updatedAt:now,note:'',extra:{}};if(!task.title)throw new Error('任务标题不能为空');const path=join(this.root,project.relativePath,`${safeFileTitle(task.title)}--${id.slice(0,8)}.md`);await this.atomicWrite(path,serializeTask(task));return task}
  async save(task:Task,expectedRevision:number){const found=(await this.files()).find(item=>item.task.id===task.id);if(!found)throw new Error('任务不存在');if(found.task.revision!==expectedRevision)throw new RevisionConflictError(expectedRevision,found.task.revision);const next={...task,schema:'bearai.todo/task@2' as const,favorite:task.favorite??task.important??false,revision:found.task.revision+1,updatedAt:new Date().toISOString()};await this.atomicWrite(found.path,serializeTask(next));return next}
  private async files(){const result:{path:string;task:Task}[]=[];await this.walk(this.root,result,null);return result}
  private async walk(directory:string,result:{path:string;task:Task}[],inheritedProjectId:string|null){await mkdir(directory,{recursive:true});let projectId=inheritedProjectId;try{projectId=JSON.parse(await readFile(join(directory,'.bearai-project.json'),'utf8')).projectId??projectId}catch{}for(const entry of await readdir(directory,{withFileTypes:true})){if(entry.name.startsWith('.'))continue;const path=join(directory,entry.name);if(entry.isDirectory()){await this.walk(path,result,projectId);continue}if(extname(entry.name).toLocaleLowerCase()!=='.md')continue;try{const task=parseTask(await readFile(path,'utf8'));result.push({path,task:{...task,projectId:projectId??task.projectId}})}catch{}}}
  private async atomicWrite(path:string,content:string){if(!resolve(path).startsWith(resolve(this.root)+sep))throw new Error('任务路径越界');await mkdir(dirname(path),{recursive:true});const temp=`${path}.${randomUUID()}.tmp`;const handle=await open(temp,'wx');try{await handle.writeFile(content,'utf8');await handle.sync()}finally{await handle.close()}try{await rename(temp,path)}catch(error){await unlink(temp).catch(()=>undefined);throw error}}
}
