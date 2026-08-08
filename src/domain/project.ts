export interface WorkspaceConfig {
  schema:'bearai.todo/workspace@1';workspaceId:string;revision:number;name:string
  createdAt:string;updatedAt:string;statistics:{activeTasks:number;completedTasks:number;rebuiltAt:string|null}
}
export type ProjectTheme=string
export type TaskExpansionDepth=1|2|3|4|5|'all'
export interface ProjectGitBinding {remoteUrl:string;branch:string;provider:'github'|'gitee'|'gitlab'|'other'}
export interface ProjectViewSettings {sortMode:'manual'|'title'|'updated';theme:ProjectTheme;defaultTaskExpansion:{mode:'collapsed'|'depth';depth:TaskExpansionDepth};rememberTaskExpansion:boolean;showSubprojects:boolean;expandedTaskIds:string[];expandMode?:'collapsed'|'expanded'|'remember';rememberDefaultDepth?:number;defaultTaskExpandDepth?:number;expandDepth?:number}
export function withoutLegacyExpansionSettings<T extends Partial<ProjectViewSettings>>(settings:T):Omit<T,'expandMode'|'rememberDefaultDepth'|'defaultTaskExpandDepth'|'expandDepth'>{
  const {expandMode:_expandMode,rememberDefaultDepth:_rememberDefaultDepth,defaultTaskExpandDepth:_defaultTaskExpandDepth,expandDepth:_expandDepth,...current}=settings
  return current
}
export interface Project {
  schema:'bearai.todo/project@1';projectId:string;revision:number;name:string
  parentId:string|null;order:number;archived:boolean;createdAt:string;updatedAt:string
  relativePath:string;icon:string;description:string;sidebarColor:string;theme:ProjectTheme;collapsed:boolean;viewSettings?:Partial<ProjectViewSettings>;settingsMode?:'inherit'|'own';git?:ProjectGitBinding|null
}
