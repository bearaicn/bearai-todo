import {AsyncLocalStorage} from 'node:async_hooks'
import {open,readFile,stat,unlink} from 'node:fs/promises'
import {isAbsolute,join,resolve} from 'node:path'
import {randomUUID} from 'node:crypto'

type LockRecord={token:string;pid:number;createdAt:string}
const context=new AsyncLocalStorage<Set<string>>()
const queues=new Map<string,Promise<void>>()
export class WorkspaceLockTimeoutError extends Error{constructor(public readonly workspacePath:string,public readonly timeoutMs:number){super(`工作区写锁等待超时（${timeoutMs}ms）：${workspacePath}`)}}
function alive(pid:number){try{process.kill(pid,0);return true}catch{return false}}
async function stale(path:string,staleMs:number){try{const record=JSON.parse(await readFile(path,'utf8')) as LockRecord,age=Date.now()-new Date(record.createdAt).getTime();if(Number.isInteger(record.pid)&&record.pid>0&&record.token&&Number.isFinite(age))return !alive(record.pid);return Number.isFinite(age)&&age>staleMs}catch{try{return Date.now()-(await stat(path)).mtimeMs>staleMs}catch{return false}}}
async function acquire(root:string,timeoutMs:number,staleMs:number){const path=join(root,'.bearai-write.lock'),token=randomUUID(),started=Date.now();for(;;){try{const handle=await open(path,'wx');try{await handle.writeFile(JSON.stringify({token,pid:process.pid,createdAt:new Date().toISOString()} satisfies LockRecord),'utf8');await handle.sync()}finally{await handle.close()}return{path,token}}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(await stale(path,staleMs)){await unlink(path).catch(()=>undefined);continue}if(Date.now()-started>=timeoutMs)throw new WorkspaceLockTimeoutError(root,timeoutMs);await new Promise(resolve=>setTimeout(resolve,50))}}}
async function release(path:string,token:string){try{const record=JSON.parse(await readFile(path,'utf8')) as LockRecord;if(record.token===token)await unlink(path)}catch{}}
export async function withWorkspaceWriteLock<T>(workspacePath:string,work:()=>Promise<T>,options:{timeoutMs?:number;staleMs?:number}={}):Promise<T>{
  if(!isAbsolute(workspacePath))throw new Error('工作区路径必须是绝对路径');const root=resolve(workspacePath),held=context.getStore();if(held?.has(root))return work();
  const previous=queues.get(root)??Promise.resolve();let done!:()=>void;const turn=new Promise<void>(resolve=>{done=resolve}),queued=previous.then(()=>turn);queues.set(root,queued);await previous;
  try{const lock=await acquire(root,options.timeoutMs??10_000,options.staleMs??30*60_000),next=new Set(held??[]);next.add(root);try{return await context.run(next,work)}finally{await release(lock.path,lock.token)}}finally{done();if(queues.get(root)===queued)queues.delete(root)}
}
