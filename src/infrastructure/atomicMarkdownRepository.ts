import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RevisionConflictError } from '../domain/task.js'

export class AtomicMarkdownRepository<T extends {id:string;revision:number;updatedAt:string}> {
  constructor(private root:string,private folder:string,private parse:(value:string)=>T,private serialize:(value:T)=>string){}
  private path(id:string){if(!/^[a-zA-Z0-9-]+$/.test(id))throw new Error('非法文档 ID');return join(this.root,this.folder,`${id}.md`)}
  async get(id:string){return this.parse(await readFile(this.path(id),'utf8'))}
  async list(){const directory=join(this.root,this.folder);await mkdir(directory,{recursive:true});const names=(await readdir(directory)).filter(name=>name.endsWith('.md'));return Promise.all(names.map(name=>readFile(join(directory,name),'utf8').then(this.parse)))}
  async insert(value:T){await this.write(this.path(value.id),this.serialize(value));return value}
  async save(value:T,expectedRevision:number){const current=await this.get(value.id);if(current.revision!==expectedRevision)throw new RevisionConflictError(expectedRevision,current.revision);const next={...value,revision:current.revision+1,updatedAt:new Date().toISOString()} as T;await this.write(this.path(value.id),this.serialize(next));return next}
  private async write(path:string,content:string){await mkdir(dirname(path),{recursive:true});const temp=`${path}.${randomUUID()}.tmp`;const handle=await open(temp,'wx');try{await handle.writeFile(content,'utf8');await handle.sync()}finally{await handle.close()}try{await rename(temp,path)}catch(error){await unlink(temp).catch(()=>undefined);throw error}}
}

