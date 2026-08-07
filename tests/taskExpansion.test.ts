import {describe,expect,it} from 'vitest'
import {initialExpandedTaskIds,normalizeTaskExpansionDepth,taskExpansionDepthOptions,updateExpansionSettings} from '../src/domain/taskExpansion'
import type {ProjectViewSettings} from '../src/domain/project'
const base:ProjectViewSettings={sortMode:'manual',theme:'mist',defaultTaskExpansion:{mode:'collapsed',depth:2},rememberTaskExpansion:false,showSubprojects:false,expandedTaskIds:['parent-a']}
describe('independent task defaults, memory and project expansion',()=>{
  it('has exactly the six fixed Chinese depth options',()=>expect(taskExpansionDepthOptions).toEqual([[1,'第一层'],[2,'第二层'],[3,'第三层'],[4,'第四层'],[5,'第五层'],['all','全部']]))
  it.each([[1,1],[2,2],[3,3],[4,4],[5,5],[0,1],[99,5],['bad',1],['all','all']])('normalizes %s to %s',(value,expected)=>expect(normalizeTaskExpansionDepth(value)).toBe(expected))
  it('uses valid history only when memory is enabled',()=>{expect(initialExpandedTaskIds({remember:true,savedIds:['parent-a'],validParentIds:['parent-a'],defaultIds:[]})).toEqual(['parent-a']);expect(initialExpandedTaskIds({remember:true,savedIds:['removed'],validParentIds:['parent-a'],defaultIds:['parent-a']})).toEqual(['parent-a']);expect(initialExpandedTaskIds({remember:false,savedIds:['parent-a'],validParentIds:['parent-a'],defaultIds:[]})).toEqual([])})
  it.each([
    ['collapsed',false,[],[]],['collapsed',true,['parent-a'],['parent-a']],
    ['depth',false,['parent-a'],['parent-a']],['depth',true,['parent-a'],['parent-a']],
  ])('supports %s with remember=%s independently',(_mode,remember,saved,expected)=>expect(initialExpandedTaskIds({remember,savedIds:saved,validParentIds:['parent-a'],defaultIds:_mode==='depth'?['parent-a']:[]})).toEqual(expected))
  it('keeps all three dimensions independent in both directions',()=>{expect(updateExpansionSettings(base,{showSubprojects:true})).toMatchObject({showSubprojects:true,rememberTaskExpansion:false,defaultTaskExpansion:{mode:'collapsed',depth:2}});expect(updateExpansionSettings(base,{rememberTaskExpansion:true})).toMatchObject({showSubprojects:false,rememberTaskExpansion:true,defaultTaskExpansion:{mode:'collapsed',depth:2}});expect(updateExpansionSettings(base,{defaultTaskExpansion:{mode:'depth',depth:5}})).toMatchObject({showSubprojects:false,rememberTaskExpansion:false,defaultTaskExpansion:{mode:'depth',depth:5}})})
})
