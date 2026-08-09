import type {Project} from './project.js'

export type ProjectDropMode='before'|'inside'|'after'
export type ProjectDropDecision={allowed:true;operation:'reorder'|'move';parentId:string|null;beforeId?:string;afterId?:string}|{allowed:false;reason:string}

export function resolveProjectDrop(projects:Project[],sourceId:string,targetId:string,mode:ProjectDropMode):ProjectDropDecision{
  const source=projects.find(item=>item.projectId===sourceId),target=projects.find(item=>item.projectId===targetId)
  if(!source||!target)return{allowed:false,reason:'项目已被外部修改，请重新加载'}
  if(source.archived||target.archived)return{allowed:false,reason:'已归档项目不能拖拽'}
  if(source.projectId===target.projectId)return{allowed:false,reason:'项目不能拖到自身'}
  if(mode!=='inside'){
    if(source.parentId!==target.parentId)return{allowed:false,reason:'只能在同一父项目内前后排序'}
    return{allowed:true,operation:'reorder',parentId:source.parentId,...(mode==='before'?{beforeId:target.projectId}:{afterId:target.projectId})}
  }
  if(source.parentId===null)return{allowed:false,reason:'顶级项目只能在顶级项目之间排序'}
  if(source.parentId===target.projectId)return{allowed:false,reason:'项目已经属于该父项目'}
  const descendants=new Set<string>(),visit=(id:string)=>projects.filter(item=>item.parentId===id).forEach(item=>{descendants.add(item.projectId);visit(item.projectId)})
  visit(source.projectId)
  if(descendants.has(target.projectId))return{allowed:false,reason:'项目不能移动到自己的后代'}
  return{allowed:true,operation:'move',parentId:target.projectId}
}
