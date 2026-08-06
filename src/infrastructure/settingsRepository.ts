import { cp, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

export type GlobalTheme='mist'|'sage'|'ocean'|'rose'|'graphite'
export interface LocalSettings {schema:'bearai.todo/settings@1';workspacePath:string|null;theme:GlobalTheme;updatedAt:string}
async function atomicJson(path:string,value:unknown){await mkdir(dirname(path),{recursive:true});const temp=`${path}.${randomUUID()}.tmp`;const handle=await open(temp,'wx');try{await handle.writeFile(`${JSON.stringify(value,null,2)}\n`,'utf8');await handle.sync()}finally{await handle.close()}await rename(temp,path)}
export class SettingsRepository {
  constructor(private path:string){}
  async read():Promise<LocalSettings>{try{const value=JSON.parse(await readFile(this.path,'utf8'));return{...value,theme:['mist','sage','ocean','rose','graphite'].includes(value.theme)?value.theme:'mist'}}catch{return{schema:'bearai.todo/settings@1',workspacePath:null,theme:'mist',updatedAt:new Date().toISOString()}}}
  async save(value:LocalSettings){await atomicJson(this.path,value);return value}
  async setWorkspace(workspacePath:string){const current=await this.read();return this.save({...current,workspacePath:resolve(workspacePath),updatedAt:new Date().toISOString()})}
  async setTheme(theme:GlobalTheme){const current=await this.read();return this.save({...current,theme,updatedAt:new Date().toISOString()})}
}
async function evidence(root:string){let projects=0,tasks=0;async function walk(directory:string){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()){await walk(path);continue}if(entry.name==='.bearai-project.json')projects++;else if(entry.name.endsWith('.md'))tasks++}}await walk(root);return{projects,tasks}}
export async function migrateWorkspace(source:string,target:string){const from=resolve(source),to=resolve(target);if(from===to)return{...(await evidence(from)),source:from,target:to,sourceRemoved:false};if(to.startsWith(from+sep)||from.startsWith(to+sep))throw new Error('新旧工作目录不能互相嵌套');await mkdir(to,{recursive:true});if((await readdir(to)).length)throw new Error('新工作目录必须为空，避免覆盖已有文件');for(const entry of await readdir(from)){await cp(join(from,entry),join(to,entry),{recursive:true,errorOnExist:true,force:false})}const before=await evidence(from),after=await evidence(to);if(before.projects!==after.projects||before.tasks!==after.tasks)throw new Error('工作目录迁移校验失败');await stat(join(to,'.bearai-workspace.json'));await rm(from,{recursive:true,force:false});return{...after,source:from,target:to,sourceRemoved:true}}
