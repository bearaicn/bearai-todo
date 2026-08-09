import {mkdtemp,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {ProjectRepository} from '../dist-cli/src/infrastructure/workspaceRepository.js'
import {TaskRepository} from '../dist-cli/src/infrastructure/taskRepository.js'

function cli(input){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['dist-cli/cli/taskAutomation.js'],{cwd:new URL('..',import.meta.url),stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];child.stdout.on('data',chunk=>stdout.push(String(chunk)));child.stderr.on('data',chunk=>stderr.push(String(chunk)));child.on('error',reject);child.on('close',code=>resolve({code,stdout:stdout.join('').trim(),stderr:stderr.join('')}));child.stdin.end(JSON.stringify(input))})}
const root=await mkdtemp(join(tmpdir(),'bear-cli-e2e-'))
try{
  const project=(await new ProjectRepository(root).initialize())[0],instance={title:'真实E2E实例',projectId:project.projectId,instanceKey:'qa:2026-08-08',validOn:'2026-08-08',rollover:'forbidden'},base={version:1,workspacePath:root}
  const results={capabilities:await cli({...base,command:'capabilities'}),created:await cli({...base,command:'ensure-instance',instance}),retried:await cli({...base,command:'ensure-instance',instance}),found:await cli({...base,command:'find-instance',instanceKey:instance.instanceKey}),voided:await cli({...base,command:'void-expired',today:'2026-08-09',reason:'E2E跨日作废'})},tasks=await new TaskRepository(root).list(),residue=(await readdir(root)).filter(name=>name==='.bearai-write.lock'||name.endsWith('.tmp'))
  process.stdout.write(JSON.stringify({workspace:root,results,readback:{count:tasks.length,task:tasks[0],residue}},null,2)+'\n')
  if(Object.values(results).some(result=>result.code!==0||result.stderr)||tasks.length!==1||tasks[0].status!=='voided'||residue.length)process.exitCode=1
}finally{await rm(root,{recursive:true,force:true})}
