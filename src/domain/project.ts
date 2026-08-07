export interface WorkspaceConfig {
  schema:'bearai.todo/workspace@1';workspaceId:string;revision:number;name:string
  createdAt:string;updatedAt:string;statistics:{activeTasks:number;completedTasks:number;rebuiltAt:string|null}
}
export type ProjectTheme='mist'|'sage'|'ocean'|'rose'|'graphite'|'forest'|'coast'|'custom'
export interface ProjectViewSettings {sortMode:'manual'|'title'|'updated';theme:ProjectTheme;rememberTaskExpansion:boolean;defaultTaskExpandDepth:number;showSubprojects:boolean;expandedTaskIds:string[];expandMode?:'collapsed'|'expanded'|'remember';expandDepth?:number}
export interface Project {
  schema:'bearai.todo/project@1';projectId:string;revision:number;name:string
  parentId:string|null;order:number;archived:boolean;createdAt:string;updatedAt:string
  relativePath:string;icon:string;description:string;sidebarColor:string;theme:ProjectTheme;collapsed:boolean;viewSettings?:Partial<ProjectViewSettings>;settingsMode?:'inherit'|'own'
}
