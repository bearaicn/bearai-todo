import { afterEach,describe,expect,it } from 'vitest'
import { mkdtemp,readFile,rm,stat } from 'node:fs/promises'
import { join } from 'node:path';import { tmpdir } from 'node:os'
import { ProjectRepository,WorkspaceRepository } from '../src/infrastructure/workspaceRepository'
const roots:string[]=[];async function setup(){const root=await mkdtemp(join(tmpdir(),'bear-workspace-'));roots.push(root);return{root,workspace:new WorkspaceRepository(root),projects:new ProjectRepository(root)}}
afterEach(async()=>Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true}))))
describe('workspace and project folders',()=>{
  it('creates root JSON and a default project folder',async()=>{const{root,workspace,projects}=await setup();const config=await workspace.initialize();const values=await projects.initialize();expect(config.schema).toBe('bearai.todo/workspace@1');expect(JSON.parse(await readFile(join(root,'.bearai-workspace.json'),'utf8')).workspaceId).toBe(config.workspaceId);expect(values.some(item=>item.name==='任务')).toBe(true)})
  it('rebuilds non-authoritative statistics in root configuration',async()=>{const{workspace}=await setup();await workspace.initialize();const updated=await workspace.updateStatistics(3,7);expect(updated.statistics).toMatchObject({activeTasks:3,completedTasks:7});expect(updated.statistics.rebuiltAt).toBeTruthy()})
  it('creates nested project folders with stable configuration',async()=>{const{root,projects}=await setup();await projects.initialize();const parent=await projects.create('工作',null),child=await projects.create('BearAI',parent.projectId);expect(child.parentId).toBe(parent.projectId);expect(JSON.parse(await readFile(join(root,'工作','BearAI','.bearai-project.json'),'utf8')).projectId).toBe(child.projectId)})
  it('renames and safely archives the whole project folder',async()=>{const{root,projects}=await setup();await projects.initialize();const project=await projects.create('旧项目',null);const renamed=await projects.rename(project.projectId,'新项目');expect(renamed.relativePath).toBe('新项目');const archived=await projects.archive(project.projectId);expect(archived.archived).toBe(true);expect((await stat(join(root,'.archive','projects',project.projectId))).isDirectory()).toBe(true);expect((await projects.list()).some(item=>item.projectId===project.projectId)).toBe(false)})
})
