import {readFile,stat} from 'node:fs/promises'
import {isAbsolute,join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {TaskRepository} from '../src/infrastructure/taskRepository.js'
import {WorkspaceLockTimeoutError,withWorkspaceWriteLock} from '../src/infrastructure/workspaceWriteLock.js'
import type {EnsureTaskInstanceDto,Task} from '../src/domain/task.js'

const protocol='bearai.todo/automation@1',commands=['capabilities','find-instance','ensure-instance','void-expired'] as const
type Command=typeof commands[number]
type Request={version:1;command:Command;workspacePath:string;lockTimeoutMs?:number;instanceKey?:string;instance?:EnsureTaskInstanceDto;today?:string;reason?:string}
type Receipt={action:string;taskId:string|null;previousStatus:Task['status']|null;newStatus:Task['status']|null;instanceDate:string|null;instanceKey:string|null;revision:number|null;reason:string|null}

class InputError extends Error{}
function receipt(action:string,task:Task|null,previousStatus:Task['status']|null=null,reason:string|null=null):Receipt{return{action,taskId:task?.id??null,previousStatus,newStatus:task?.status??null,instanceDate:task?.validOn??null,instanceKey:task?.instanceKey??null,revision:task?.revision??null,reason}}
function requestOf(value:unknown):Request{if(!value||typeof value!=='object')throw new InputError('请求必须是 JSON 对象');const input=value as Partial<Request>;if(input.version!==1)throw new InputError('仅支持 version=1');if(!commands.includes(input.command as Command))throw new InputError('不支持的 command');if(typeof input.workspacePath!=='string'||!isAbsolute(input.workspacePath))throw new InputError('workspacePath 必须是显式绝对路径');if(input.lockTimeoutMs!==undefined&&(!Number.isInteger(input.lockTimeoutMs)||input.lockTimeoutMs!<100||input.lockTimeoutMs>120000))throw new InputError('lockTimeoutMs 必须是 100..120000 的整数');return input as Request}
async function validateWorkspace(path:string){const root=resolve(path);if(!(await stat(root).catch(()=>null))?.isDirectory())throw new InputError('workspacePath 不是现有目录');const config=JSON.parse(await readFile(join(root,'.bearai-workspace.json'),'utf8').catch(()=>{throw new InputError('目录不是熊智ToDo工作区')}));if(config.schema!=='bearai.todo/workspace@1')throw new InputError('工作区配置版本不受支持');return root}

export async function executeAutomation(value:unknown,hooks:{beforeVoid?:(task:Task)=>void|Promise<void>}={}){
  const input=requestOf(value),root=await validateWorkspace(input.workspacePath),repository=new TaskRepository(root,{lockTimeoutMs:input.lockTimeoutMs});
  if(input.command==='capabilities')return{ok:true,protocol,version:1,capabilities:{commands,taskSchema:['bearai.todo/task@1','bearai.todo/task@2'],workspaceLock:'bearai-write-lock@1',plainJson:true}};
  if(input.command==='find-instance'){if(typeof input.instanceKey!=='string'||!input.instanceKey.trim())throw new InputError('instanceKey 不能为空');const task=await repository.findInstance(input.instanceKey);return{ok:true,protocol,version:1,receipts:[receipt(task?'found':'not-found',task)]}}
  if(input.command==='ensure-instance'){if(!input.instance)throw new InputError('instance 不能为空');const existing=await repository.findInstance(input.instance.instanceKey),result=await repository.ensureInstance(input.instance),readback=await repository.get(result.task.id);return{ok:true,protocol,version:1,receipts:[receipt(result.created?'created':'existing',readback,existing?.status??null)]}}
  if(typeof input.today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.today))throw new InputError('today 必须是 YYYY-MM-DD');
  return withWorkspaceWriteLock(root,async()=>{const candidates=(await repository.list()).filter(task=>task.status==='active'&&task.rollover==='forbidden'&&Boolean(task.validOn)&&task.validOn!<input.today!),receipts:Receipt[]=[],errors:{taskId:string;code:string;message:string}[]=[];for(const task of candidates){try{await hooks.beforeVoid?.(task);const result=await repository.void(task.id,task.revision,input.reason??'超过有效日期自动作废'),readback=await repository.get(result.voided.id);receipts.push(receipt('voided',readback,'active',readback.voidReason??input.reason??null))}catch(error){errors.push({taskId:task.id,code:error instanceof Error?error.name:'ERROR',message:error instanceof Error?error.message:String(error)})}}return{ok:errors.length===0,protocol,version:1,partial:errors.length>0,receipts,errors}}, {timeoutMs:input.lockTimeoutMs});
}

async function main(){let command:string|null=null;try{const chunks:Buffer[]=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));command=(input as {command?:string})?.command??null;process.stdout.write(JSON.stringify(await executeAutomation(input))+'\n')}catch(error){const code=error instanceof InputError?'INVALID_INPUT':error instanceof WorkspaceLockTimeoutError?'LOCK_TIMEOUT':'AUTOMATION_ERROR',exitCode=code==='INVALID_INPUT'?2:code==='LOCK_TIMEOUT'?3:1;process.stdout.write(JSON.stringify({ok:false,protocol,version:1,command,error:{code,message:error instanceof Error?error.message:String(error),retryable:code==='LOCK_TIMEOUT'}})+'\n');process.exitCode=exitCode}}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)void main()
