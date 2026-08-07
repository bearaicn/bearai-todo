import {describe,expect,it} from 'vitest'
import {clampTaskExpandDepth,initialExpandedTaskIds,updateExpansionSettings} from '../src/domain/taskExpansion'
const base={rememberTaskExpansion:false,defaultTaskExpandDepth:1,showSubprojects:false,expandedTaskIds:['parent-a']}
describe('task and project expansion settings',()=>{
  it.each([[0,0],[1,1],[2,2],[3,3],[-1,0],['bad',0],[99,4]])('clamps depth %s to %s', (value,expected)=>expect(clampTaskExpandDepth(value,4)).toBe(expected))
  it('restores valid remembered nodes and falls back when missing or stale',()=>{expect(initialExpandedTaskIds({remember:true,savedIds:['parent-a'],validParentIds:['parent-a'],defaultIdsByDepth:[]})).toEqual(['parent-a']);expect(initialExpandedTaskIds({remember:true,savedIds:['removed'],validParentIds:['parent-a'],defaultIdsByDepth:['parent-a']})).toEqual(['parent-a']);expect(initialExpandedTaskIds({remember:false,savedIds:['parent-a'],validParentIds:['parent-a'],defaultIdsByDepth:[]})).toEqual([])})
  it('keeps project directory visibility independent in both directions',()=>{const projectChanged=updateExpansionSettings(base,{showSubprojects:true});expect(projectChanged).toMatchObject({showSubprojects:true,rememberTaskExpansion:false,defaultTaskExpandDepth:1,expandedTaskIds:['parent-a']});const taskChanged=updateExpansionSettings(base,{rememberTaskExpansion:true,defaultTaskExpandDepth:3});expect(taskChanged).toMatchObject({showSubprojects:false,rememberTaskExpansion:true,defaultTaskExpandDepth:3})})
})
