import {describe,expect,it} from 'vitest'
import {resolveProjectDrop} from '../src/domain/projectPlacement'
import type {Project} from '../src/domain/project'

const project=(id:string,parentId:string|null):Project=>({schema:'bearai.todo/project@1',projectId:id,revision:1,name:id,parentId,order:0,archived:false,createdAt:'now',updatedAt:'now',relativePath:id,icon:'📁',description:'',sidebarColor:'#000',theme:'mist',collapsed:false})
const tree=[project('a',null),project('b',null),project('a1','a'),project('a2','a'),project('a11','a1'),project('b1','b')]

describe('project tree drop semantics',()=>{
  it('distinguishes sibling ordering from becoming a child',()=>{expect(resolveProjectDrop(tree,'a1','a2','before')).toMatchObject({allowed:true,operation:'reorder',parentId:'a'});expect(resolveProjectDrop(tree,'a1','b','inside')).toMatchObject({allowed:true,operation:'move',parentId:'b'})})
  it('rejects cross-parent before/after insertion',()=>{expect(resolveProjectDrop(tree,'a1','b1','after')).toMatchObject({allowed:false,reason:'只能在同一父项目内前后排序'})})
  it('rejects self, descendants and top-level reparenting',()=>{expect(resolveProjectDrop(tree,'a1','a1','inside').allowed).toBe(false);expect(resolveProjectDrop(tree,'a1','a11','inside').allowed).toBe(false);expect(resolveProjectDrop(tree,'a','b','inside')).toMatchObject({allowed:false,reason:'顶级项目只能在顶级项目之间排序'})})
  it('rejects an inside drop that would keep the same parent',()=>{expect(resolveProjectDrop(tree,'a1','a','inside')).toMatchObject({allowed:false,reason:'项目已经属于该父项目'})})
  it('rejects archived drop targets without changing placement semantics',()=>{const archived=tree.map(item=>item.projectId==='b'?{...item,archived:true}:item);expect(resolveProjectDrop(archived,'a1','b','inside')).toMatchObject({allowed:false,reason:'已归档项目不能拖拽'})})
})
