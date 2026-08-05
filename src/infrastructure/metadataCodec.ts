import matter from 'gray-matter'
import type { ListGroup, TodoList } from '../domain/list.js'

const listKeys = new Set(['schema','id','revision','name','groupId','order','archived','createdAt','updatedAt'])
const groupKeys = new Set(['schema','id','revision','name','order','collapsed','archived','createdAt','updatedAt'])

function splitExtra(data: Record<string, unknown>, keys: Set<string>) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !keys.has(key)))
}
export function parseList(source:string):TodoList {
  const { data }=matter(source); if(data.schema!=='bearai.todo/list@1')throw new Error('不支持的列表格式')
  return {...data,groupId:data.groupId??null,order:data.order??0,archived:data.archived??false,extra:splitExtra(data,listKeys)} as TodoList
}
export function serializeList(list:TodoList){const{extra,...data}=list;return matter.stringify('',{...extra,...data})}
export function parseGroup(source:string):ListGroup {
  const { data }=matter(source);if(data.schema!=='bearai.todo/group@1')throw new Error('不支持的列表组格式')
  return {...data,order:data.order??0,collapsed:data.collapsed??false,archived:data.archived??false,extra:splitExtra(data,groupKeys)} as ListGroup
}
export function serializeGroup(group:ListGroup){const{extra,...data}=group;return matter.stringify('',{...extra,...data})}

