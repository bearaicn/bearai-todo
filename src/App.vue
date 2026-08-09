<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { Task, TaskAttachment, TaskKind, UserIdentity } from "./domain/task";
import type {
  Project,
  ProjectTheme,
  ProjectViewSettings,
} from "./domain/project";
import { withoutLegacyExpansionSettings } from "./domain/project";
import { activeProjectTreeTaskCount, childTasks, completedProjectTasks as queryCompletedProjectTasks, voidedProjectTasks as queryVoidedProjectTasks, dueState, partitionChildTasks, queryTasks } from "./domain/taskQueries";
import { nextRepeatDue } from "./domain/taskRecurrence";
import { builtInThemes, resolveThemeId, themeTokens, type CustomTheme } from "./domain/theme";
import type { WorkspaceRegistry } from "./infrastructure/workspaceRegistryRepository";
import AppIcon from "./components/AppIcon.vue";
import MarkdownEditor from "./components/MarkdownEditor.vue";
import ConfirmDialog from './components/ConfirmDialog.vue'
import {resolveProjectDrop,type ProjectDropMode} from './domain/projectPlacement'
import SchedulePicker from "./components/SchedulePicker.vue";
import "./task-detail.css";

type Dialog = {
  kind: "rootProject" | "subproject" | "renameProject" | "renameChild";
  project?: Project;
  task?: Task;
  value: string;
  title: string;
};
const tasks = ref<Task[]>([]),
  projects = ref<Project[]>([]),
  selected = ref<Task>();
const saveState = ref<"saved" | "dirty" | "saving" | "failed">("saved"),
  saveTimer = ref<ReturnType<typeof setTimeout>>(),
  saveChain = ref(Promise.resolve()),
  saveFailure = ref("");
const view = ref("today"),
  draft = ref(""),
  newProjectName = ref(""),
  childDraft = ref(""),
  search = ref(""),
  error = ref("");
const contextMenu = ref<{ project: Project; x: number; y: number } | null>(
    null,
  ),
  headerMenu = ref(false),
  accountMenu = ref(false),
  workspaceMenu = ref(false);
const inputDialog = ref<Dialog | null>(null),
  inputDialogNameInput = ref<HTMLInputElement>(),
  inputDialogTrigger = ref<HTMLElement>(),
  propertiesProject = ref<Project | null>(null),
  moveProject = ref<Project | null>(null);
type UiSettings = {
  workspacePath: string | null;
  theme: ProjectTheme;
  sidebarWidth: number;
  customTheme: {
    accent: string;
    scene: string;
    backgroundImage: string | null;
  };
  customThemes: CustomTheme[];
  todayWindowDays: number;
  projectDefaults: ProjectViewSettings;
  currentUser?: UserIdentity;
};
const settingsOpen = ref(false),
  settings = ref<UiSettings | null>(null),
  migrating = ref(false);
const workspaceRegistry = ref<WorkspaceRegistry | null>(null),
  workspaceManagerOpen = ref(false),
  workspaceName = ref("新工作区"),
  workspaceBusy = ref(false),
  workspaceRefreshing = ref(false);
const activeWorkspace = computed(() =>
  workspaceRegistry.value?.workspaces.find(
    (item) => item.workspaceId === workspaceRegistry.value?.activeWorkspaceId,
  ),
);
const globalThemeName = computed(() => {
  const id = settings.value?.theme;
  return (
    themes.find((item) => item.id === id)?.name ??
    customThemeDrafts.value.find((item) => item.id === id)?.name ??
    "自定义主题"
  );
});
const customThemeComposerOpen = ref(false),
  newCustomThemeName = ref(""),
  customThemeDrafts = ref<CustomTheme[]>([]),
  customThemeNotice = ref(""),
  depthMenuOpen = ref(false);
const transientSettingsPreview = ref<string | null>(null);
const settingsSection = ref<"general" | "appearance" | "projects" | "archive">(
    "general",
  ),
  archived = ref<
    Awaited<ReturnType<NonNullable<Window["bearTodo"]>["listArchivedProjects"]>>
  >([]),
  listSearch = ref(""),
  blankMenu = ref<{ x: number; y: number } | null>(null);
const attachmentPreview = ref<{
  attachment: TaskAttachment;
  supported: boolean;
  reason?: string;
  mime?: string;
  dataUrl?: string;
  text?: string;
} | null>(null);
const conflict = ref<{ local: Task; disk: Task } | null>(null);
const expandedTasks = ref(new Set<string>()),
  completedSectionExpanded = ref(false),
  expandedCompletedChildGroups = ref(new Set<string>()),
  voidedSectionExpanded = ref(false),
  expandedVoidedChildGroups = ref(new Set<string>()),
  editingProjectId = ref<string>(),
  editingProjectName = ref(""),
  sortMode = ref<"manual" | "title" | "updated">("manual");
const draggedProjectId=ref<string|null>(null),projectDrop=ref<{projectId:string;mode:ProjectDropMode;allowed:boolean;reason?:string}|null>(null),draggedTaskId=ref<string|null>(null),taskDrop=ref<{taskId:string;mode:'before'|'child'|'after'}|null>(null);
const moveTarget=ref<Project|null>(null),pendingTaskMove=ref<{task:Task;target:Project}|null>(null);
const archiveConfirm=ref<{project:Project;ids:Set<string>;active:number;message:string}|null>(null)
const smart = [
  { id: "today", icon: "sun", name: "今日待办" },
  { id: "favorites", icon: "star", name: "收藏" },
  { id: "planned", icon: "calendar", name: "计划内" },
  { id: "completed", icon: "check-circle", name: "已完成" },
];
const themes: {
  id: ProjectTheme;
  name: string;
  color: string;
  image?: boolean;
}[] = [
  { id: "mist", name: "晨雾", color: "#8da9a1" },
  { id: "sage", name: "青苔", color: "#4fa879" },
  { id: "ocean", name: "海湾", color: "#5b86c5" },
  { id: "rose", name: "晚樱", color: "#ca7185" },
  { id: "graphite", name: "墨石", color: "#667078" },
  { id: "forest", name: "林间", color: "#315b45", image: true },
  { id: "coast", name: "海岸", color: "#397a91", image: true },
];
const currentProject = computed(() =>
  projects.value.find((item) => item.projectId === view.value),
);
const descendantIds = computed(() => {
  const ids = new Set<string>();
  if (!currentProject.value) return ids;
  const visit = (id: string) =>
    projects.value
      .filter((item) => item.parentId === id)
      .forEach((item) => {
        ids.add(item.projectId);
        visit(item.projectId);
      });
  visit(currentProject.value.projectId);
  return ids;
});
const effectiveView = computed<ProjectViewSettings>(() => {
  const fallback = settings.value?.projectDefaults ?? {
    sortMode: "manual",
    theme: settings.value?.theme ?? "mist",
    defaultTaskExpansion: { mode: "collapsed" as const, depth: "all" as const },
    rememberTaskExpansion: false,
    showSubprojects: false,
    expandedTaskIds: [],
  };
  const chain = [...breadcrumbs.value].reverse();
  const owner = chain.find((item) => item.settingsMode === "own");
  const legacy = owner?.viewSettings;
  return {
    ...fallback,
    theme: settings.value?.theme ?? fallback.theme,
    ...withoutLegacyExpansionSettings(legacy ?? {}),
    defaultTaskExpansion: legacy?.defaultTaskExpansion ?? { mode: legacy?.expandMode === "expanded" ? "depth" : fallback.defaultTaskExpansion.mode, depth: legacy?.expandMode === "expanded" ? "all" : fallback.defaultTaskExpansion.depth },
    rememberTaskExpansion: legacy?.rememberTaskExpansion ?? (legacy?.expandMode === "remember"),
    ...(!owner &&
    currentProject.value?.settingsMode === undefined &&
    currentProject.value?.theme
      ? { theme: currentProject.value.theme }
      : {}),
  };
});
const breadcrumbs = computed(() => {
  const result: Project[] = [];
  let item = currentProject.value;
  while (item) {
    result.unshift(item);
    item = item.parentId
      ? projects.value.find((project) => project.projectId === item?.parentId)
      : undefined;
  }
  return result;
});
function taskCounts(projectId: string) {
  return activeProjectTreeTaskCount(tasks.value, projects.value, projectId);
}
const statusStats = computed(() => {
  const current = currentProject.value,
    scope = new Set(current ? [current.projectId, ...descendantIds.value] : []);
  const make = (status: "active" | "completed" | "all") => {
    const matches = (task: Task) => status === "all" || task.status === status,
      direct = tasks.value.filter(
        (task) =>
          (!current || task.projectId === current.projectId) && matches(task),
      ),
      all = tasks.value.filter(
        (task) => (!current || scope.has(task.projectId)) && matches(task),
      );
    return {
      top: direct.filter((task) => !task.parentId).length,
      direct: direct.length,
      scope: all.length,
    };
  };
  return [
    { id: "active", name: "未完成", ...make("active") },
    { id: "completed", name: "已完成", ...make("completed") },
    { id: "all", name: "全部", ...make("all") },
  ];
});
const projectRows = computed(() => {
  const result: { project: Project; depth: number; hasChildren: boolean }[] =
    [];
  const visit = (parentId: string | null, depth: number) =>
    projects.value
      .filter((item) => item.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .forEach((project) => {
        const hasChildren = projects.value.some(
          (item) => item.parentId === project.projectId,
        );
        result.push({ project, depth, hasChildren });
        if (!project.collapsed) visit(project.projectId, depth + 1);
      });
  visit(null, 0);
  return result;
});
const viewName = computed(
  () =>
    smart.find((item) => item.id === view.value)?.name ??
    currentProject.value?.name ??
    "今日待办",
);
const shown = computed(() => {
  let result = queryTasks(tasks.value, view.value,{todayWindowDays:settings.value?.todayWindowDays??3});
  const term = (listSearch.value || search.value).trim().toLocaleLowerCase();
  if (term)
    result = result.filter((task) =>
      [
        task.title,
        task.note,
        ...task.tags,
        ...childTasks(tasks.value, task.id).map((child) => child.title),
      ].some((value) => value.toLocaleLowerCase().includes(term)),
    );
  const mode = currentProject.value
    ? effectiveView.value.sortMode
    : sortMode.value;
  if (mode === "title")
    result = [...result].sort((a, b) => a.title.localeCompare(b.title));
  if (mode === "updated")
    result = [...result].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (mode === "manual" && currentProject.value)
    result = [...result].sort((a,b)=>(a.order??Number.MAX_SAFE_INTEGER)-(b.order??Number.MAX_SAFE_INTEGER)||a.createdAt.localeCompare(b.createdAt));
  return result;
});
const visibleTaskRows = computed(() => {
  type Row =
    | { kind: "task"; task: Task; depth: number; hasChildren: boolean }
    | { kind: "completed-group"; parentId: string; depth: number; tasks: Task[] }
    | { kind: "voided-group"; parentId: string; depth: number; tasks: Task[] };
  const rows: Row[] = [];
  const visit = (task: Task, depth: number) => {
    const children = childTasks(tasks.value, task.id),
      { active: activeChildren, completed: completedChildren, voided: voidedChildren } = partitionChildTasks(tasks.value, task.id);
    rows.push({ kind: "task", task, depth, hasChildren: children.length > 0 });
    if (expandedTasks.value.has(task.id)) {
      activeChildren.forEach((child) => visit(child, depth + 1));
      if (completedChildren.length)
        rows.push({
          kind: "completed-group",
          parentId: task.id,
          depth: depth + 1,
          tasks: completedChildren,
        });
      if (voidedChildren.length) rows.push({kind:"voided-group",parentId:task.id,depth:depth+1,tasks:voidedChildren});
    }
  };
  shown.value.forEach((task) => visit(task, 0));
  return rows;
});
const completedProjectTasks = computed(() => {
  if (!currentProject.value || view.value === "completed") return [];
  return queryCompletedProjectTasks(
    tasks.value,
    currentProject.value.projectId,
    listSearch.value || search.value,
  );
});
const voidedProjectTasks = computed(() => {
  if (!currentProject.value) return [];
  return queryVoidedProjectTasks(tasks.value,currentProject.value.projectId,listSearch.value || search.value);
});
const children = computed(() =>
  selected.value ? childTasks(tasks.value, selected.value.id) : [],
);
const renderedThemeId=computed(()=>resolveThemeId(settingsOpen.value,transientSettingsPreview.value,currentProject.value?effectiveView.value.theme:null,settings.value?.theme??'mist'))
const themeClass = computed(() => Object.hasOwn(builtInThemes,renderedThemeId.value)?`theme-${renderedThemeId.value}`:'theme-custom');
const shellStyle = computed(() => {
  const availableThemes=settingsOpen.value?customThemeDrafts.value:(settings.value?.customThemes??[]),tokens=themeTokens(renderedThemeId.value,availableThemes),custom=availableThemes.find(item=>item.id===renderedThemeId.value),image=custom?.backgroundImage;
  return {
    "--sidebar-width": `${settings.value?.sidebarWidth ?? 262}px`,
    "--accent":tokens.accent,"--accent-soft":tokens.hover,"--accent-alt":tokens.accentAlt,"--scene":tokens.scene,"--scene-layer":tokens.sceneLayer,"--panel":tokens.panel,"--card":tokens.card,"--text":tokens.text,"--muted":tokens.muted,"--border":tokens.border,"--danger":tokens.danger,"--shadow-color":tokens.shadow,
    "--custom-image": image ? `url("${image}")` : "none",
  };
});
function bridge() {
  if (!window.bearTodo) throw new Error("本地存储服务未连接，请重新启动应用");
  return window.bearTodo;
}
function closeMenus() {
  contextMenu.value = null;
  blankMenu.value = null;
  headerMenu.value = false;
  accountMenu.value = false;
  workspaceMenu.value = false;
}
async function load():Promise<boolean> {
  try {
    const api = bridge();
    await api.health();
    [tasks.value, projects.value, settings.value, workspaceRegistry.value] = await Promise.all([
      api.listTasks(),
      api.listProjects(),
      api.getSettings(),
      api.listWorkspaces(),
    ]);
    if (settings.value && !settings.value.currentUser) settings.value.currentUser={id:'local-self',name:'本地用户',email:''};
    error.value = "";
    return true;
  } catch (reason) {
    error.value = message(reason);
    return false;
  }
}
async function refreshWorkspace() {
  if (workspaceRefreshing.value || workspaceBusy.value) return;
  workspaceRefreshing.value = true;
  const selectedId = selected.value?.id;
  try {
    await flushSave(selected.value);
    const loaded = await load();
    if (!loaded) return;
    selected.value = selectedId
      ? tasks.value.find((item) => item.id === selectedId)
      : undefined;
    if (
      typeof view.value === "string" &&
      !["today", "important", "planned", "all", "completed"].includes(view.value) &&
      !projects.value.some((item) => item.projectId === view.value)
    ) view.value = "today";
  } catch (reason) {
    error.value = message(reason);
  } finally {
    workspaceRefreshing.value = false;
  }
}
async function switchWorkspace(workspaceId: string) {
  if (workspaceId === workspaceRegistry.value?.activeWorkspaceId) {
    workspaceMenu.value = false;
    return;
  }
  workspaceBusy.value = true;
  try {
    await flushSave(selected.value);
    workspaceRegistry.value = await bridge().switchWorkspace(workspaceId);
    selected.value = undefined;
    view.value = "today";
    search.value = "";
    listSearch.value = "";
    await load();
    workspaceMenu.value = false;
  } catch (reason) {
    error.value = message(reason);
  } finally {
    workspaceBusy.value = false;
  }
}
async function createWorkspace() {
  if (!workspaceName.value.trim()) return;
  workspaceBusy.value = true;
  try {
    await flushSave(selected.value);
    const result = await bridge().createWorkspace(workspaceName.value);
    if (!result.canceled) {
      workspaceName.value = "新工作区";
      selected.value = undefined;
      view.value = "today";
      await load();
    }
  } catch (reason) { error.value = message(reason); }
  finally { workspaceBusy.value = false; }
}
async function addWorkspace() {
  workspaceBusy.value = true;
  try {
    await flushSave(selected.value);
    const result = await bridge().addWorkspace();
    if (!result.canceled) { selected.value = undefined; view.value = "today"; await load(); }
  } catch (reason) { error.value = message(reason); }
  finally { workspaceBusy.value = false; }
}
async function renameWorkspace(workspaceId: string, currentName: string) {
  const name = window.prompt("工作区名称", currentName)?.trim();
  if (!name || name === currentName) return;
  try { workspaceRegistry.value = await bridge().renameWorkspace(workspaceId, name); }
  catch (reason) { error.value = message(reason); }
}
async function removeWorkspace(workspaceId: string, name: string) {
  if (!window.confirm(`从软件中移除工作区“${name}”？\n\n只移除注册记录，不会删除工作区目录和其中的数据。`)) return;
  try {
    await flushSave(selected.value);
    workspaceRegistry.value = await bridge().removeWorkspace(workspaceId);
    selected.value = undefined;
    view.value = "today";
    await load();
  } catch (reason) { error.value = message(reason); }
}
function defaultProject() {
  return (
    projects.value.find(
      (item) => item.name === "默认项目" && item.parentId === null,
    ) ?? projects.value[0]
  );
}
async function add() {
  const title = draft.value.trim(),
    project = currentProject.value ?? defaultProject();
  if (!title || !project) return;
  try {
    const task = await bridge().createTask(title, project.projectId);
    tasks.value.unshift(task);
    draft.value = "";
    selected.value = task;
  } catch (reason) {
    error.value = message(reason);
  }
}
async function save(task: Task, patch: Partial<Task>) {
  queueSave(task, patch);
  await flushSave(task);
}
function queueSave(task: Task, patch: Partial<Task> = {}) {
  Object.assign(task, patch);
  saveState.value = "dirty";
  if (saveTimer.value) clearTimeout(saveTimer.value);
  saveTimer.value = setTimeout(() => void flushSave(task), 550);
}
async function flushSave(task = selected.value) {
  if (!task || saveState.value === "saved") return;
  if (saveTimer.value) clearTimeout(saveTimer.value);
  saveTimer.value = undefined;
  saveState.value = "saving";
  saveChain.value = saveChain.value.then(async () => {
    const snapshot = JSON.parse(JSON.stringify(task)) as Task;
    try {
      const saved = await bridge().saveTask(snapshot, snapshot.revision);
      if (task.id === saved.id) {
        const newerDraft = JSON.stringify(task) !== JSON.stringify(snapshot);
        const preserved = JSON.parse(JSON.stringify(task)) as Task;
        Object.assign(task, saved);
        if (newerDraft) {
          Object.assign(task, preserved, {
            revision: saved.revision,
            updatedAt: saved.updatedAt,
          });
          saveState.value = "dirty";
          queueSave(task);
        } else saveState.value = "saved";
      }
      saveFailure.value = "";
      error.value = "";
    } catch (reason) {
      saveState.value = "failed";
      saveFailure.value = message(reason);
      error.value = `保存失败：${saveFailure.value}。本地草稿已保留，请重试或重新打开磁盘版本。`;
      if (saveFailure.value.includes("外部修改")) {
        const disk = (await bridge().listTasks()).find((item) => item.id === task.id);
        if (disk) conflict.value = { local: JSON.parse(JSON.stringify(task)), disk };
      }
    }
  });
  await saveChain.value;
}
function resolveConflict(choice: "local" | "disk") {
  const value = conflict.value;
  if (!value) return;
  const target = tasks.value.find((item) => item.id === value.local.id);
  if (!target) return;
  if (choice === "disk") { Object.assign(target, value.disk); saveState.value = "saved"; }
  else { Object.assign(target, value.local, { revision: value.disk.revision, updatedAt: value.disk.updatedAt }); queueSave(target); void flushSave(target); }
  conflict.value = null;
}
async function selectTask(task?: Task) {
  if (selected.value && selected.value.id !== task?.id)
    await flushSave(selected.value);
  selected.value = task;
  saveState.value = "saved";
}
function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
}
async function saveDate(field: "due" | "reminder", value: string | null) {
  if (selected.value)
    await save(selected.value, {
      [field]: value,
    });
}
function dueInfo(task:Task){if(!task.due)return null;const state=dueState(task.due,settings.value?.todayWindowDays??3),labels={outside:'窗口外',upcoming:`${settings.value?.todayWindowDays??3}天内`,today:'今天截止',overdue:'已超时'};return{state,label:labels[state],text:/^\d{4}-\d{2}-\d{2}$/.test(task.due)?task.due:new Date(task.due).toLocaleString('zh-CN')}}
async function setKind(kind: TaskKind) {
  if (selected.value) {
    queueSave(selected.value, { kind });
    await flushSave(selected.value);
  }
}
async function addAttachments() {
  const task = selected.value;
  if (!task) return;
  try {
    const added = await bridge().addAttachments(task.id);
    if (added.length)
      await save(task, { attachments: [...task.attachments, ...added] });
  } catch (reason) {
    error.value = message(reason);
  }
}
async function removeAttachment(attachment: TaskAttachment) {
  const task = selected.value;
  if (!task || !window.confirm(`移除附件“${attachment.name}”？`)) return;
  try {
    await bridge().removeAttachment(JSON.parse(JSON.stringify(attachment)));
    await save(task, {
      attachments: task.attachments.filter((item) => item.id !== attachment.id),
    });
  } catch (reason) {
    error.value = message(reason);
  }
}
async function previewAttachment(attachment: TaskAttachment) {
  try {
    attachmentPreview.value = {
      attachment,
      ...(await bridge().previewAttachment(JSON.parse(JSON.stringify(attachment)))),
    };
  } catch (reason) {
    error.value = message(reason);
  }
}
async function downloadAttachment(attachment:TaskAttachment){try{await bridge().downloadAttachment(JSON.parse(JSON.stringify(attachment)))}catch(reason){error.value=message(reason)}}
function insertMarkdown(prefix: string, suffix = "") {
  const area = document.querySelector<HTMLTextAreaElement>(".markdown-source"),
    task = selected.value;
  if (!area || !task) return;
  const start = area.selectionStart,
    end = area.selectionEnd,
    current = task.note,
    chosen = current.slice(start, end) || "文本";
  task.note =
    current.slice(0, start) + prefix + chosen + suffix + current.slice(end);
  requestAnimationFrame(() => {
    area.focus();
    area.setSelectionRange(
      start + prefix.length,
      start + prefix.length + chosen.length,
    );
  });
}
function markdownPreview(source: string) {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/\n/g, "<br>");
}
function editorMarkdown(task:Task){return task.attachments.reduce((text,item)=>text.replaceAll(item.relativePath,`bearai-asset://attachment/${item.id}`),task.note)}
function persistedMarkdown(task:Task,markdown:string){return task.attachments.reduce((text,item)=>text.replaceAll(`bearai-asset://attachment/${item.id}`,item.relativePath),markdown)}
async function uploadEditorImage(file:File){const task=selected.value;if(!task)throw new Error('没有选中的任务');const attachment={...(await bridge().importEditorImage(task.id,file.name,file.type,await file.arrayBuffer())),role:'inline' as const};task.attachments=[...task.attachments,attachment];queueSave(task,{attachments:task.attachments});await flushSave(task);if(saveState.value==='failed')throw new Error(saveFailure.value);return `bearai-asset://attachment/${attachment.id}`}
async function readClipboardEditorImage(){const value=await bridge().readClipboardImage();return value?new File([new Uint8Array(value.bytes)],value.name,{type:value.mime}):null}
function editorChanged(markdown:string){const task=selected.value;if(task)queueSave(task,{note:persistedMarkdown(task,markdown)})}
async function toggleDone(task: Task) {
  if(task.status==='voided'){await restoreVoided(task);return}
  if (task.status === "completed") {
    await save(task, { status: "active", completedAt: null });
    return;
  }
  try {
    if (selected.value) await flushSave(selected.value);
    const result = await bridge().completeTask(task.id, task.revision);
    Object.assign(task, result.completed);
    if (result.next) tasks.value.unshift(result.next);
    saveState.value = "saved";
  } catch (reason) {
    error.value = message(reason);
  }
}
async function voidTask(task:Task){
  const reason=window.prompt('作废原因（将保留在任务历史中）','不再执行')?.trim();if(reason===undefined)return;
  try{await flushSave(selected.value);const result=await bridge().voidTask(task.id,task.revision,reason||'用户作废');Object.assign(task,result.voided);if(result.next&&!tasks.value.some(item=>item.id===result.next!.id))tasks.value.unshift(result.next);saveState.value='saved'}catch(reason){error.value=message(reason)}
}
async function restoreVoided(task:Task){try{const restored=await bridge().restoreVoidedTask(task.id,task.revision);Object.assign(task,restored);saveState.value='saved'}catch(reason){error.value=message(reason)}}
async function setRepeat(frequency: string) {
  const task = selected.value;
  if (!task) return;
  if (!frequency) return save(task, { repeat: null });
  const repeat = { frequency: frequency as NonNullable<Task["repeat"]>["frequency"], interval: 1 };
  await save(task, { repeat, due: task.due ?? nextRepeatDue(repeat) });
}
async function addChildTask() {
  const parent = selected.value,
    title = childDraft.value.trim();
  if (!parent || !title) return;
  try {
    tasks.value.push(
      await bridge().createTask(title, parent.projectId, parent.id),
    );
    expandedTasks.value = new Set(expandedTasks.value).add(parent.id);
    childDraft.value = "";
  } catch (reason) {
    error.value = message(reason);
  }
}
async function createProject(parentId: string | null = null, name?: string) {
  const value = (name ?? newProjectName.value).trim();
  if (!value) return;
  try {
    projects.value.push(await bridge().createProject(value, parentId));
    newProjectName.value = "";
    closeMenus();
  } catch (reason) {
    error.value = message(reason);
  }
}
function openContext(event: MouseEvent, project: Project) {
  event.preventDefault();
  closeMenus();
  contextMenu.value = { project, x: event.clientX, y: event.clientY };
}
function openBlankContext(event: MouseEvent) {
  if ((event.target as HTMLElement).closest(".list-row")) return;
  event.preventDefault();
  closeMenus();
  blankMenu.value = { x: event.clientX, y: event.clientY };
}
async function openDialog(
  kind: Dialog["kind"],
  project?: Project,
  task?: Task,
  trigger?: EventTarget | null,
) {
  inputDialogTrigger.value =
    trigger instanceof HTMLElement
      ? trigger
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
  closeMenus();
  inputDialog.value = {
    kind,
    project,
    task,
    value:
      kind === "subproject" || kind === "rootProject"
        ? (kind === "rootProject" ? newProjectName.value : "")
        : (project?.name ?? task?.title ?? ""),
    title:
      kind === "rootProject"
        ? "新增项目"
        : kind === "subproject"
          ? `在“${project?.name}”中新增子项目`
          : kind === "renameChild"
            ? "重命名子任务"
            : "重命名项目",
  };
  await nextTick();
  inputDialogNameInput.value?.focus();
  if(inputDialog.value?.value)inputDialogNameInput.value?.select();
}
async function closeInputDialog(){inputDialog.value=null;await nextTick();inputDialogTrigger.value?.focus()}
async function confirmInput() {
  const dialog = inputDialog.value,
    value = dialog?.value.trim();
  if (!dialog || !value) return;
  try {
    if (dialog.kind === "rootProject") await createProject(null, value);
    else if (dialog.kind === "subproject" && dialog.project)
      await createProject(dialog.project.projectId, value);
    else if (dialog.kind === "renameProject" && dialog.project)
      Object.assign(
        dialog.project,
        await bridge().renameProject(dialog.project.projectId, value),
      );
    else if (dialog.task) await save(dialog.task, { title: value });
    await closeInputDialog();
  } catch (reason) {
    error.value = message(reason);
  }
}
function startInlineRename(project: Project) {
  editingProjectId.value = project.projectId;
  editingProjectName.value = project.name;
  requestAnimationFrame(() =>
    document.querySelector<HTMLInputElement>(".project-inline-input")?.select(),
  );
}
async function finishInlineRename(saveValue = true) {
  const project = projects.value.find(
      (item) => item.projectId === editingProjectId.value,
    ),
    name = editingProjectName.value.trim();
  editingProjectId.value = undefined;
  if (!saveValue || !project || !name || name === project.name) return;
  try {
    Object.assign(
      project,
      await bridge().renameProject(project.projectId, name),
    );
  } catch (reason) {
    error.value = message(reason);
  }
}
async function toggleProject(project: Project) {
  try {
    Object.assign(
      project,
      await bridge().updateProject(project.projectId, {
        collapsed: !project.collapsed,
      }),
    );
  } catch (reason) {
    error.value = message(reason);
  }
}
function toggleTask(id: string) {
  const next = new Set(expandedTasks.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expandedTasks.value = next;
  if (currentProject.value && effectiveView.value.rememberTaskExpansion)
    void setProjectView({ expandedTaskIds: [...next] });
}
function openProperties(project: Project) {
  closeMenus();
  propertiesProject.value = { ...project };
}
async function saveProperties() {
  const draft = propertiesProject.value;
  if (!draft) return;
  try {
    const next = await bridge().updateProject(draft.projectId, {
      name: draft.name,
      icon: draft.icon,
      description: draft.description,
      sidebarColor: draft.sidebarColor,
      theme: draft.theme,
      git: draft.git,
      settingsMode: "own",
      viewSettings: { theme: draft.theme },
    });
    const existing = projects.value.find(
      (item) => item.projectId === draft.projectId,
    );
    if (existing) Object.assign(existing, next);
    propertiesProject.value = null;
  } catch (reason) {
    error.value = message(reason);
  }
}
const projectMoveCandidates=computed(()=>{const source=moveProject.value;if(!source)return[];const descendants=new Set<string>(),visit=(id:string)=>projects.value.filter(item=>item.parentId===id).forEach(item=>{descendants.add(item.projectId);visit(item.projectId)});visit(source.projectId);return projects.value.filter(item=>item.projectId!==source.projectId&&item.projectId!==source.parentId&&!descendants.has(item.projectId)&&!item.archived)});
async function moveTo(parentId: string | null) {
  const project = moveProject.value;
  if (!project||!parentId) return;
  try {
    const next = await bridge().moveProjectChecked({projectId:project.projectId,targetParentId:parentId,expectedRevision:project.revision});
    Object.assign(project, next);
    moveProject.value = null;
    moveTarget.value = null;
  } catch (reason) {
    error.value = message(reason);
  }
}
function startProjectDrag(event:DragEvent,project:Project){if(editingProjectId.value===project.projectId){event.preventDefault();return}draggedProjectId.value=project.projectId;event.dataTransfer?.setData('application/x-bearai-project',project.projectId);if(event.dataTransfer)event.dataTransfer.effectAllowed='move'}
function overProject(event:DragEvent,target:Project){if(draggedTaskId.value){const task=tasks.value.find(item=>item.id===draggedTaskId.value),allowed=Boolean(task&&task.projectId!==target.projectId&&!target.archived);projectDrop.value={projectId:target.projectId,mode:'inside',allowed,reason:allowed?undefined:'任务不能移动到该项目'};if(allowed){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move'}return}if(!draggedProjectId.value)return;const rect=(event.currentTarget as HTMLElement).getBoundingClientRect(),ratio=(event.clientY-rect.top)/rect.height,mode:ProjectDropMode=ratio<.28?'before':ratio>.72?'after':'inside',decision=resolveProjectDrop(projects.value,draggedProjectId.value,target.projectId,mode);projectDrop.value={projectId:target.projectId,mode,allowed:decision.allowed,reason:decision.allowed?undefined:decision.reason};if(decision.allowed){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move'}else if(event.dataTransfer)event.dataTransfer.dropEffect='none'}
async function dropOnProject(event:DragEvent,target:Project){event.preventDefault();const state=projectDrop.value;if(draggedTaskId.value&&state?.projectId===target.projectId&&state.allowed){const task=tasks.value.find(item=>item.id===draggedTaskId.value);if(task)pendingTaskMove.value={task,target}}else if(draggedProjectId.value&&state?.projectId===target.projectId){const source=projects.value.find(item=>item.projectId===draggedProjectId.value),decision=resolveProjectDrop(projects.value,draggedProjectId.value,target.projectId,state.mode);if(!decision.allowed){error.value=decision.reason}else if(source)try{if(decision.operation==='reorder')await bridge().reorderProject({projectId:source.projectId,parentId:decision.parentId,beforeId:decision.beforeId??null,afterId:decision.afterId??null,expectedRevision:source.revision});else await bridge().moveProjectChecked({projectId:source.projectId,targetParentId:decision.parentId!,expectedRevision:source.revision});projects.value=await bridge().listProjects();if(decision.operation==='move'){const parent=projects.value.find(item=>item.projectId===decision.parentId);if(parent?.collapsed)Object.assign(parent,await bridge().updateProject(parent.projectId,{collapsed:false}))}}catch(reason){error.value=message(reason)}}clearDrag()}
function clearDrag(){draggedProjectId.value=null;draggedTaskId.value=null;projectDrop.value=null;taskDrop.value=null}
function startTaskDrag(event:DragEvent,task:Task){draggedTaskId.value=task.id;event.dataTransfer?.setData('application/x-bearai-task',task.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move'}
function overTask(event:DragEvent,target:Task){if(!draggedTaskId.value||draggedTaskId.value===target.id||!currentProject.value||search.value||listSearch.value||effectiveView.value.sortMode!=='manual')return;event.preventDefault();const rect=(event.currentTarget as HTMLElement).getBoundingClientRect(),ratio=(event.clientY-rect.top)/rect.height;taskDrop.value={taskId:target.id,mode:ratio<.3?'before':ratio>.7?'after':'child'};if(event.dataTransfer)event.dataTransfer.dropEffect='move'}
async function dropOnTask(event:DragEvent,target:Task){event.preventDefault();const source=tasks.value.find(item=>item.id===draggedTaskId.value),drop=taskDrop.value;if(!source||!drop||drop.taskId!==target.id)return clearDrag();try{await flushSave(selected.value);await bridge().placeTask({taskId:source.id,sourceProjectId:source.projectId,targetProjectId:target.projectId,targetParentId:drop.mode==='child'?target.id:(target.parentId??null),beforeId:drop.mode==='before'?target.id:null,afterId:drop.mode==='after'?target.id:null,expectedRevision:source.revision});tasks.value=await bridge().listTasks()}catch(reason){error.value=message(reason)}finally{clearDrag()}}
async function dropTaskAtRoot(event:DragEvent){event.preventDefault();const source=tasks.value.find(item=>item.id===draggedTaskId.value),project=currentProject.value;if(!source||!project)return clearDrag();try{await bridge().placeTask({taskId:source.id,sourceProjectId:source.projectId,targetProjectId:project.projectId,targetParentId:null,afterId:shown.value.at(-1)?.id??null,expectedRevision:source.revision});tasks.value=await bridge().listTasks()}catch(reason){error.value=message(reason)}finally{clearDrag()}}
async function confirmTaskProjectMove(){const pending=pendingTaskMove.value;if(!pending)return;try{await flushSave(selected.value);await bridge().placeTask({taskId:pending.task.id,sourceProjectId:pending.task.projectId,targetProjectId:pending.target.projectId,targetParentId:null,expectedRevision:pending.task.revision});tasks.value=await bridge().listTasks();if(selected.value?.id===pending.task.id)selected.value=tasks.value.find(item=>item.id===pending.task.id)}catch(reason){error.value=message(reason)}finally{pendingTaskMove.value=null}}
async function openSettings() {
  closeMenus();
  try {
    settings.value = await bridge().getSettings();
    customThemeDrafts.value = plainThemes(settings.value.customThemes);
    transientSettingsPreview.value = settings.value.theme;
    settingsOpen.value = true;
  } catch (reason) {
    error.value = message(reason);
  }
}
async function openArchive() {
  closeMenus();
  try {
    archived.value = await bridge().listArchivedProjects();
    settingsSection.value = "archive";
    settings.value = await bridge().getSettings();
    customThemeDrafts.value = plainThemes(settings.value.customThemes);
    transientSettingsPreview.value = settings.value.theme;
    settingsOpen.value = true;
  } catch (reason) {
    error.value = message(reason);
  }
}
async function setGlobalTheme(theme: ProjectTheme) {
  try {
    transientSettingsPreview.value = theme;
    settings.value = await bridge().setPreferences({ theme });
  } catch (reason) {
    error.value = message(reason);
  }
}
function closeSettings(){settingsOpen.value=false;transientSettingsPreview.value=null}
function plainThemes(themes:CustomTheme[]){return JSON.parse(JSON.stringify(themes)) as CustomTheme[]}
function createCustomTheme(){newCustomThemeName.value='我的主题';customThemeComposerOpen.value=true}
async function persistCustomTheme(name:string,copy?:CustomTheme){const normalizedName=name.trim();if(!normalizedName){error.value='请输入主题名称';return}const now=new Date().toISOString(),id=`theme-${crypto.randomUUID()}`,theme:CustomTheme={id,name:normalizedName,tokens:{...(copy?.tokens??builtInThemes.mist.tokens)},backgroundImage:copy?.backgroundImage??null,createdAt:now,updatedAt:now};customThemeDrafts.value=[...customThemeDrafts.value,theme];transientSettingsPreview.value=id;customThemeNotice.value=`已创建“${normalizedName}”草稿，请调整后保存。`;customThemeComposerOpen.value=false;newCustomThemeName.value=''}
async function confirmCreateCustomTheme(){await persistCustomTheme(newCustomThemeName.value)}
function cancelCreateCustomTheme(){customThemeComposerOpen.value=false;newCustomThemeName.value=''}
async function saveCustomTheme(theme:CustomTheme){if(!settings.value)return;const saved={...JSON.parse(JSON.stringify(theme)),updatedAt:new Date().toISOString()} as CustomTheme,existing=settings.value.customThemes.some(item=>item.id===saved.id),customThemes=existing?settings.value.customThemes.map(item=>item.id===saved.id?saved:item):[...settings.value.customThemes,saved];await savePreferences({customThemes:plainThemes(customThemes)});customThemeDrafts.value=plainThemes(settings.value?.customThemes??customThemes);transientSettingsPreview.value=saved.id;customThemeNotice.value=`主题“${saved.name}”已保存。`}
async function applyCustomTheme(theme:CustomTheme){await saveCustomTheme(theme);await setGlobalTheme(theme.id);customThemeNotice.value=`主题“${theme.name}”已保存并应用。`}
async function copyCustomTheme(theme:CustomTheme){await persistCustomTheme(`${theme.name} 副本`,JSON.parse(JSON.stringify(theme)));customThemeNotice.value=`已创建“${theme.name} 副本”，可继续调整后保存。`}
async function deleteCustomTheme(theme:CustomTheme){if(!settings.value)return;const persisted=settings.value.customThemes.some(item=>item.id===theme.id);if(persisted&&!window.confirm(`删除自定义主题“${theme.name}”？使用该主题的位置将回退到当前全局主题。`))return;for(const project of projects.value.filter(item=>item.viewSettings?.theme===theme.id)){Object.assign(project,await bridge().updateProject(project.projectId,{settingsMode:'inherit',viewSettings:{}}))}const customThemes=settings.value.customThemes.filter(item=>item.id!==theme.id),fallback=settings.value.theme===theme.id?'mist':settings.value.theme;await savePreferences({customThemes:plainThemes(customThemes),theme:fallback});customThemeDrafts.value=plainThemes(customThemes);transientSettingsPreview.value=fallback;customThemeNotice.value=`主题“${theme.name}”已删除。`}
async function savePreferences(
  patch: Partial<
    Pick<
      UiSettings,
      "theme" | "sidebarWidth" | "customTheme" | "customThemes" | "todayWindowDays" | "projectDefaults" | "currentUser"
    >
  >,
) {
  try {
    settings.value = await bridge().setPreferences(patch);
  } catch (reason) {
    error.value = message(reason);
  }
}
async function setProjectView(patch: Partial<ProjectViewSettings>, close = true) {
  const project = currentProject.value;
  if (!project) return;
  try {
    const viewSettings = {
      ...effectiveView.value,
      expandedTaskIds: [
        ...(patch.expandedTaskIds ?? effectiveView.value.expandedTaskIds),
      ],
      ...patch,
      defaultTaskExpansion:{...effectiveView.value.defaultTaskExpansion,...patch.defaultTaskExpansion},
    };
    Object.assign(
      project,
      await bridge().updateProject(project.projectId, {
        settingsMode: "own",
        viewSettings,
      }),
    );
    if (close) headerMenu.value = false;
  } catch (reason) {
    error.value = message(reason);
  }
}
const expansionDepthOptions = [
  { value: 1 as const, label: "第一层" },
  { value: 2 as const, label: "第二层" },
  { value: 3 as const, label: "第三层" },
  { value: 4 as const, label: "第四层" },
  { value: 5 as const, label: "第五层" },
  { value: "all" as const, label: "全部" },
];
function expansionDepthLabel(value: ProjectViewSettings["defaultTaskExpansion"]["depth"]){return expansionDepthOptions.find(item=>item.value===value)?.label??"全部"}
type TaskExpansionChoice="collapsed"|"depth"|"remember";
const selectedTaskExpansion=computed<TaskExpansionChoice>(()=>effectiveView.value.rememberTaskExpansion?"remember":effectiveView.value.defaultTaskExpansion.mode);
async function selectTaskExpansion(choice:TaskExpansionChoice,close=true){if(choice==="remember")await setProjectView({rememberTaskExpansion:true},close);else await setProjectView({rememberTaskExpansion:false,defaultTaskExpansion:{...effectiveView.value.defaultTaskExpansion,mode:choice}},close)}
async function openExpansionDepthMenu(){depthMenuOpen.value=!depthMenuOpen.value;if(selectedTaskExpansion.value!=="depth")await selectTaskExpansion("depth",false)}
async function chooseExpansionDepth(depth:ProjectViewSettings["defaultTaskExpansion"]["depth"]){depthMenuOpen.value=false;await setProjectView({rememberTaskExpansion:false,defaultTaskExpansion:{mode:"depth",depth}})}
async function resetProjectView() {
  const project = currentProject.value;
  if (!project) return;
  try {
    Object.assign(
      project,
      await bridge().updateProject(project.projectId, {
        settingsMode: "inherit",
        viewSettings: {},
      }),
    );
    headerMenu.value = false;
  } catch (reason) {
    error.value = message(reason);
  }
}
async function chooseBackground(theme:CustomTheme) {
  try {
    const path = await bridge().chooseThemeBackground(theme.id);
    if (path){theme.backgroundImage=path;transientSettingsPreview.value=theme.id;customThemeNotice.value='背景已选择，请点击保存。'}
  } catch (reason) {
    error.value = message(reason);
  }
}
async function changeWorkspace() {
  migrating.value = true;
  try {
    const result = await bridge().changeWorkspace();
    if (!result.canceled) {
      settings.value = await bridge().getSettings();
      await load();
      selected.value = undefined;
      view.value = "today";
    }
  } catch (reason) {
    error.value = message(reason);
  } finally {
    migrating.value = false;
  }
}
async function archiveProject(project: Project) {
  const ids = new Set([project.projectId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of projects.value)
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.projectId)) {
        ids.add(item.projectId);
        changed = true;
      }
  }
  const active = tasks.value.filter(
    (task) => ids.has(task.projectId) && task.status === "active",
  ).length;
  const warning = active
    ? `“${project.name}”及其子项目中还有 ${active} 个未完成任务。归档后，项目目录和任务历史仍会保留，但会从正常视图隐藏。`
    : `将“${project.name}”及其全部子项目移入归档。项目目录、任务和附件都会保留。`;
  archiveConfirm.value={project,ids,active,message:warning};closeMenus()
}
async function confirmArchiveProject(){
  const pending=archiveConfirm.value;if(!pending)return;archiveConfirm.value=null
  try {
    await bridge().archiveProject(pending.project.projectId,pending.project.revision);
    projects.value = projects.value.filter((item) => !pending.ids.has(item.projectId));
    tasks.value = tasks.value.filter((task) => !pending.ids.has(task.projectId));
    if (pending.ids.has(view.value)) view.value = "today";
    closeMenus();
  } catch (reason) {
    error.value = message(reason);
  }
}
function cancelArchiveProject(){const projectId=archiveConfirm.value?.project.projectId;archiveConfirm.value=null;void nextTick(()=>document.querySelector<HTMLElement>(`.list-row[data-project-id="${projectId}"] .list-main`)?.focus())}
function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "操作失败，请重新加载";
}
watch(
  [
    view,
    () => tasks.value.length,
    () => effectiveView.value.rememberTaskExpansion,
    () => effectiveView.value.defaultTaskExpansion.mode,
    () => effectiveView.value.defaultTaskExpansion.depth,
  ],
  () => {
    if (!currentProject.value) return;
    const validIds = new Set(tasks.value.filter(task => task.projectId === currentProject.value?.projectId && childTasks(tasks.value,task.id).length).map(task=>task.id));
    const remembered = effectiveView.value.expandedTaskIds.filter(id=>validIds.has(id));
    if (effectiveView.value.rememberTaskExpansion && remembered.length) { expandedTasks.value = new Set(remembered); return; }
    if(effectiveView.value.defaultTaskExpansion.mode==='collapsed'){expandedTasks.value=new Set();return}
    const limit=effectiveView.value.defaultTaskExpansion.depth==='all'?Number.POSITIVE_INFINITY:effectiveView.value.defaultTaskExpansion.depth;
    const next = new Set<string>(),
      visit = (parentId: string | null, depth: number) => {
        if (depth >= limit) return;
        tasks.value
          .filter(
            (task) =>
              task.projectId === currentProject.value?.projectId &&
              (task.parentId ?? null) === parentId,
          )
          .forEach((task) => {
            if (childTasks(tasks.value, task.id).length) {
              next.add(task.id);
              visit(task.id, depth + 1);
            }
          });
      };
    visit(null, 0);
    expandedTasks.value = next;
  },
  { immediate: true },
);
watch(view,async()=>{completedSectionExpanded.value=false;voidedSectionExpanded.value=false;if(selected.value){await flushSave(selected.value);selected.value=undefined}});
watch(headerMenu,(open)=>{if(!open)depthMenuOpen.value=false});
onMounted(load);
</script>

<template>
  <main
    class="shell"
    :class="[themeClass, { 'has-detail': selected }]"
    :style="shellStyle"
    @click="closeMenus"
  >
    <header class="titlebar">
      <div class="drag-region">
        <b>熊智ToDo</b><span>本地 Markdown 工作台</span>
      </div>
      <div class="window-controls">
        <button aria-label="最小化" @click="bridge().minimizeWindow()">
          <AppIcon name="minimize" /></button
        ><button
          aria-label="最大化或还原"
          @click="bridge().toggleMaximizeWindow()"
        >
          <AppIcon name="maximize" :size="15" /></button
        ><button
          class="close"
          aria-label="关闭"
          @click="flushSave().then(() => bridge().closeWindow())"
        >
          <AppIcon name="close" :size="16" />
        </button>
      </div>
    </header>
    <aside class="nav" aria-label="任务与项目导航">
      <label class="search"
        ><AppIcon name="search" :size="16" /><input
          v-model="search"
          placeholder="搜索任务、标签或子任务"
          aria-label="全局搜索"
      /></label>
      <button
        v-for="item in smart"
        :key="item.id"
        class="smart-row"
        :class="{ selected: view === item.id }"
        @click="view = item.id"
      >
        <AppIcon :name="item.icon" /><span class="row-label">{{
          item.name
        }}</span
        ><small>{{ queryTasks(tasks, item.id).length }}</small>
      </button>
      <hr />
      <div class="section-title">项目</div>
      <div class="project-tree" @contextmenu="openBlankContext">
        <div
          v-for="row in projectRows"
          :key="row.project.projectId"
          :data-project-id="row.project.projectId"
          class="list-row"
          :class="{ selected: view === row.project.projectId, 'project-drop-before':projectDrop?.projectId===row.project.projectId&&projectDrop.allowed&&projectDrop.mode==='before', 'project-drop-inside':projectDrop?.projectId===row.project.projectId&&projectDrop.allowed&&projectDrop.mode==='inside', 'project-drop-after':projectDrop?.projectId===row.project.projectId&&projectDrop.allowed&&projectDrop.mode==='after', 'drop-forbidden':projectDrop?.projectId===row.project.projectId&&!projectDrop.allowed }"
          :title="projectDrop?.projectId===row.project.projectId&&!projectDrop.allowed?projectDrop.reason:undefined"
          :style="{
            '--depth': row.depth,
            '--row-color': row.project.sidebarColor,
          }"
          @contextmenu.stop="openContext($event, row.project)"
          :draggable="editingProjectId !== row.project.projectId"
          @dragstart="startProjectDrag($event,row.project)"
          @dragover="overProject($event,row.project)"
          @dragleave="projectDrop?.projectId===row.project.projectId&&(projectDrop=null)"
          @drop="dropOnProject($event,row.project)"
          @dragend="clearDrag"
        >
          <button
            class="tree-toggle"
            :class="{ hidden: !row.hasChildren }"
            :aria-label="row.project.collapsed ? '展开子项目' : '折叠子项目'"
            @click.stop="toggleProject(row.project)"
          >
            <AppIcon
              :name="row.project.collapsed ? 'chevron-right' : 'chevron-down'"
              :size="16"
            /></button
          ><button
            class="list-main"
            @click="view = row.project.projectId"
            @dblclick.stop="startInlineRename(row.project)"
          >
            <span class="project-icon"
              ><AppIcon
                v-if="row.project.icon === '📁'"
                name="folder"
                :size="18"
              /><template v-else>{{ row.project.icon }}</template></span
            ><input
              v-if="editingProjectId === row.project.projectId"
              v-model="editingProjectName"
              class="project-inline-input"
              draggable="false"
              @click.stop
              @dblclick.stop
              @pointerdown.stop
              @mousedown.stop
              @dragstart.stop.prevent
              @blur="finishInlineRename()"
              @keydown.enter.prevent="finishInlineRename()"
              @keydown.esc.prevent="finishInlineRename(false)"
            /><b v-else>{{ row.project.name }}</b
            ><small class="project-counts" title="当前项目及全部子项目的未完成任务总数"
              >{{ taskCounts(row.project.projectId) }}</small
            >
          </button>
        </div>
      </div>
      <div class="spacer" @contextmenu="openBlankContext" />
      <form
        class="new-row"
        @submit.prevent="openDialog('rootProject', undefined, undefined, $event.submitter)"
      >
        <input
          v-model="newProjectName"
          placeholder="新建项目"
          aria-label="新项目名称"
        /><button aria-label="创建项目"><AppIcon name="plus" /></button>
      </form>
      <div class="workspace-wrap">
        <div class="workspace-row">
          <button
            class="workspace-block"
            :aria-expanded="workspaceMenu"
            aria-haspopup="menu"
            @click.stop="workspaceMenu = !workspaceMenu"
          >
            <AppIcon name="folder" :size="17" />
            <span>{{ activeWorkspace?.name ?? "工作区" }}</span>
          </button>
          <button
            class="workspace-refresh"
            :class="{ refreshing: workspaceRefreshing }"
            :disabled="workspaceRefreshing || workspaceBusy"
            aria-label="刷新当前工作区"
            title="重新加载项目及任务文件"
            @click.stop="refreshWorkspace"
          ><AppIcon name="sync" :size="17" /></button>
          <button
            class="workspace-toggle"
            :aria-expanded="workspaceMenu"
            aria-label="选择或管理工作区"
            @click.stop="workspaceMenu = !workspaceMenu"
          ><AppIcon name="chevron-up" :size="15" /></button>
        </div>
        <div v-if="workspaceMenu" class="workspace-menu floating-menu" role="menu" @click.stop>
          <button
            v-for="workspace in workspaceRegistry?.workspaces"
            :key="workspace.workspaceId"
            role="menuitemradio"
            :aria-checked="workspace.workspaceId === workspaceRegistry?.activeWorkspaceId"
            :disabled="workspaceBusy"
            @click="switchWorkspace(workspace.workspaceId)"
          >
            <span class="menu-check"><AppIcon v-if="workspace.workspaceId === workspaceRegistry?.activeWorkspaceId" name="check" :size="16" /></span>
            <span>{{ workspace.name }}</span>
          </button>
          <hr />
          <button role="menuitem" @click="workspaceManagerOpen = true; workspaceMenu = false">
            <AppIcon name="settings" :size="17" /><span>管理工作区…</span>
          </button>
        </div>
      </div>
      <div class="account-wrap">
        <button class="account-block" @click.stop="accountMenu = !accountMenu">
          <span class="avatar">熊</span
          ><span><b>本地用户</b><small>本地工作区</small></span
          ><AppIcon name="chevron-up" :size="16" />
        </button>
        <div v-if="accountMenu" class="account-menu floating-menu" @click.stop>
          <button disabled>
            <AppIcon name="user" /><span>管理账号</span
            ><small>未来功能</small></button
          ><button @click="openArchive">
            <AppIcon name="archive" /><span>查看归档</span></button
          ><button @click="openSettings">
            <AppIcon name="settings" /><span>设置</span></button
          ><button disabled>
            <AppIcon name="sync" /><span>同步</span><small>未来功能</small>
          </button>
        </div>
      </div>
    </aside>
    <section class="list">
      <header class="list-header">
        <div class="heading-block">
          <nav
            v-if="breadcrumbs.length"
            class="breadcrumbs"
            aria-label="项目路径"
          >
            <template
              v-for="(project, index) in breadcrumbs"
              :key="project.projectId"
              ><button @click="view = project.projectId">
                {{ project.name }}</button
              ><AppIcon
                v-if="index < breadcrumbs.length - 1"
                name="chevron-right"
                :size="14"
            /></template>
          </nav>
          <h1 v-else>{{ viewName }}</h1>
          <p>
            {{
              new Date().toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })
            }}<template v-if="currentProject?.description">
              · {{ currentProject.description }}</template
            >
          </p>
        </div>
        <div class="header-actions">
          <label class="list-search"
            ><AppIcon name="search" :size="15" /><input
              v-model="listSearch"
              placeholder="查询当前任务"
          /></label>
          <div
            class="status-stats"
            title="每组数字依次为：当前项目顶级 / 当前项目全部 / 含子项目全部"
          >
            <span v-for="stat in statusStats" :key="stat.id"
              ><em>{{ stat.name }}</em
              ><b
                >{{ stat.top }} / {{ stat.direct }} / {{ stat.scope }}</b
              ></span
            >
          </div>
          <button
            v-if="currentProject"
            class="more"
            aria-label="项目菜单"
            @click.stop="headerMenu = !headerMenu"
          >
            <AppIcon name="more" :size="21" />
          </button>
        </div>
        <div
          v-if="headerMenu && currentProject"
          class="header-menu floating-menu project-menu"
          @click.stop
        >
          <div class="settings-origin">
            {{
              currentProject.settingsMode === "own"
                ? "当前项目自行维护"
                : "继承父项目或全局默认"
            }}
          </div>
          <button @click="openDialog('renameProject', currentProject, undefined, $event.currentTarget)">
            <AppIcon name="edit" /><span>重命名项目</span></button
          ><button v-if="currentProject.parentId"
            @click="
              moveProject = currentProject;
              headerMenu = false;
            "
          >
            <AppIcon name="move" /><span>将项目移动到</span>
          </button>
          <div class="menu-label">排序方式</div>
          <button
            v-for="option in [
              { id: 'manual', name: '手动排序' },
              { id: 'title', name: '按标题' },
              { id: 'updated', name: '最近更新' },
            ]"
            :key="option.id"
            @click="
              setProjectView({
                sortMode: option.id as ProjectViewSettings['sortMode'],
              })
            "
          >
            <span class="menu-check"
              ><AppIcon
                v-if="effectiveView.sortMode === option.id"
                name="check"
                :size="15" /></span
            ><span>{{ option.name }}</span>
          </button>
          <div class="menu-label">任务展开</div>
          <button
            class="task-expansion-choice"
            role="menuitemradio"
            :aria-checked="selectedTaskExpansion === 'collapsed'"
            @click="selectTaskExpansion('collapsed')"
          >
            <span class="menu-check"
              ><AppIcon
                v-if="selectedTaskExpansion === 'collapsed'"
                name="check"
                :size="15" /></span
            ><span>默认不展开</span></button
          ><div class="menu-depth expansion-depth-option"><button class="task-expansion-choice" role="menuitemradio" :aria-checked="selectedTaskExpansion === 'depth'" @click="selectTaskExpansion('depth',false)"><span class="menu-check"><AppIcon v-if="selectedTaskExpansion==='depth'" name="check" :size="15"/></span><span>默认展开到</span></button><div class="depth-picker"><button class="depth-picker-trigger" aria-label="默认展开层级" :aria-expanded="depthMenuOpen" @click.stop="openExpansionDepthMenu"><span>{{expansionDepthLabel(effectiveView.defaultTaskExpansion.depth)}}</span><AppIcon name="chevron-down" :size="14"/></button><div v-if="depthMenuOpen" class="depth-picker-menu" role="listbox"><button v-for="option in expansionDepthOptions" :key="String(option.value)" role="option" :aria-selected="effectiveView.defaultTaskExpansion.depth===option.value" @click.stop="chooseExpansionDepth(option.value)"><AppIcon v-if="effectiveView.defaultTaskExpansion.depth===option.value" name="check" :size="14"/><span v-else class="menu-check"></span>{{option.label}}</button></div></div></div>
          <button class="task-expansion-choice" role="menuitemradio" :aria-checked="selectedTaskExpansion === 'remember'" @click="selectTaskExpansion('remember')"><span class="menu-check"><AppIcon v-if="selectedTaskExpansion==='remember'" name="check" :size="15"/></span><span>记住上次展开情况</span></button>
          <div class="menu-label project-expand-label">项目展开</div>
          <button
            @click="
              setProjectView({
                showSubprojects: !effectiveView.showSubprojects,
              })
            "
          >
            <span class="menu-check"
              ><AppIcon
                v-if="effectiveView.showSubprojects"
                name="check"
                :size="15" /></span
            ><span>显示子项目目录</span>
          </button>
          <div class="menu-label">项目主题</div>
          <div class="theme-swatches">
            <button
              v-for="theme in [
                ...themes,
                ...(settings?.customThemes.map(custom=>({id:custom.id as ProjectTheme,name:custom.name,color:custom.tokens.accent}))??[]),
              ]"
              :key="theme.id"
              :style="{ background: theme.color }"
              :aria-label="theme.name"
              @click="setProjectView({ theme: theme.id })"
            ></button>
          </div>
          <button @click="resetProjectView">
            <AppIcon name="repeat" /><span>{{
              currentProject.parentId ? "重设为继承" : "重设为全局默认"
            }}</span></button
          ><button class="danger" @click="archiveProject(currentProject)">
            <AppIcon name="archive" /><span>归档</span>
          </button>
        </div>
      </header>
      <div v-if="error" class="error" role="alert">
        <span>{{ error }}</span>
        <button aria-label="关闭错误提示" @click="error = ''"><AppIcon name="close" :size="15" /></button>
      </div>
      <div v-if="view !== 'completed'" class="add">
        <AppIcon name="plus" /><input
          v-model="draft"
          @keyup.enter="add"
          placeholder="添加任务"
          aria-label="任务标题"
        />
      </div>
      <div class="cards">
        <button
          v-if="currentProject && effectiveView.showSubprojects"
          v-for="project in projects.filter(
            (item) => item.parentId === currentProject?.projectId,
          )"
          :key="project.projectId"
          class="project-directory"
          @dblclick="view = project.projectId"
        >
          <AppIcon name="folder" /><span>{{ project.name }}</span
          ><small>双击进入</small>
        </button>
        <template
          v-for="row in visibleTaskRows"
          :key="row.kind === 'task' ? row.task.id : `${row.kind}-${row.parentId}`"
        >
        <article
          v-if="row.kind === 'task'"
          :style="{ '--task-depth': row.depth }"
          :class="{
            active: selected?.id === row.task.id,
            child: row.depth > 0,
            'drop-before':taskDrop?.taskId===row.task.id&&taskDrop.mode==='before',
            'drop-child':taskDrop?.taskId===row.task.id&&taskDrop.mode==='child',
            'drop-after':taskDrop?.taskId===row.task.id&&taskDrop.mode==='after',
          }"
          @click="selectTask(row.task)"
          draggable="true"
          @dragstart="startTaskDrag($event,row.task)"
          @dragover="overTask($event,row.task)"
          @drop="dropOnTask($event,row.task)"
          @dragend="clearDrag"
        >
          <button
            v-if="row.hasChildren"
            class="task-expand"
            :aria-label="
              expandedTasks.has(row.task.id) ? '折叠子任务' : '展开子任务'
            "
            @click.stop="toggleTask(row.task.id)"
          >
            <AppIcon
              :name="
                expandedTasks.has(row.task.id)
                  ? 'chevron-down'
                  : 'chevron-right'
              "
              :size="16"
            /></button
          ><span v-else class="task-expand placeholder"></span
          ><button
            class="circle"
            :class="{ done: row.task.status === 'completed', voided: row.task.status === 'voided' }"
            :aria-label="
              row.task.status === 'completed' ? '恢复任务' : row.task.status === 'voided' ? '重新启用任务' : '完成任务'
            "
            @click.stop="toggleDone(row.task)"
          >
            <AppIcon
              v-if="row.task.status === 'completed'"
              name="check"
              :size="14"
            /><AppIcon v-else-if="row.task.status === 'voided'" name="archive" :size="13" />
          </button>
          <div>
            <strong :class="{ strike: row.task.status === 'completed', 'voided-title':row.task.status==='voided' }">{{
              row.task.title
            }}</strong
            ><small
              >{{ row.depth ? "子任务 · " : ""
              }}{{
                row.task.tags.map((tag) => "#" + tag).join(" ") ||
                projects.find(
                  (project) => project.projectId === row.task.projectId,
                )?.name ||
                "任务"
              }}</small
            ><span v-if="dueInfo(row.task)" class="due-badge" :class="`due-${dueInfo(row.task)!.state}`" :title="`截止：${dueInfo(row.task)!.text}`"><AppIcon name="calendar" :size="12"/>{{dueInfo(row.task)!.label}} · {{dueInfo(row.task)!.text}}</span>
          </div>
          <button
            class="star"
            :class="{ filled: row.task.favorite }"
            :aria-label="row.task.favorite ? '取消收藏' : '收藏任务'"
            @click.stop="save(row.task, { favorite: !row.task.favorite })"
          >
            <AppIcon name="star" :size="19" />
          </button>
        </article>
        <section
          v-else-if="row.kind === 'completed-group'"
          class="completed-section child-completed-section"
          :style="{ '--task-depth': row.depth }"
          :aria-label="`子任务已完成 ${row.tasks.length}`"
        >
          <button
            class="completed-toggle"
            :aria-expanded="expandedCompletedChildGroups.has(row.parentId)"
            @click="expandedCompletedChildGroups.has(row.parentId) ? expandedCompletedChildGroups.delete(row.parentId) : expandedCompletedChildGroups.add(row.parentId); expandedCompletedChildGroups = new Set(expandedCompletedChildGroups)"
          >
            <AppIcon :name="expandedCompletedChildGroups.has(row.parentId) ? 'chevron-down' : 'chevron-right'" :size="16" />
            <span>已完成</span><b>{{ row.tasks.length }}</b>
          </button>
          <div v-if="expandedCompletedChildGroups.has(row.parentId)" class="completed-list">
            <article
              v-for="task in row.tasks"
              :key="task.id"
              class="completed-task child"
              :style="{ '--task-depth': row.depth }"
              :class="{ active: selected?.id === task.id }"
              tabindex="0"
              @click="selectTask(task)"
              @keydown.enter="selectTask(task)"
            >
              <span class="task-expand placeholder"></span>
              <button class="circle done" aria-label="恢复子任务" @click.stop="toggleDone(task)"><AppIcon name="check" :size="14" /></button>
              <div><strong class="strike">{{ task.title }}</strong><small>已完成子任务</small></div>
              <button class="star" :class="{ filled: task.favorite }" :aria-label="task.favorite ? '取消收藏' : '收藏任务'" @click.stop="save(task, { favorite: !task.favorite })"><AppIcon name="star" :size="19" /></button>
            </article>
          </div>
        </section>
        <section v-else class="completed-section child-completed-section voided-section" :style="{ '--task-depth': row.depth }" :aria-label="`子任务已作废 ${row.tasks.length}`">
          <button class="completed-toggle voided-toggle" :aria-expanded="expandedVoidedChildGroups.has(row.parentId)" @click="expandedVoidedChildGroups.has(row.parentId)?expandedVoidedChildGroups.delete(row.parentId):expandedVoidedChildGroups.add(row.parentId);expandedVoidedChildGroups=new Set(expandedVoidedChildGroups)"><AppIcon :name="expandedVoidedChildGroups.has(row.parentId)?'chevron-down':'chevron-right'" :size="16"/><AppIcon name="archive" :size="15"/><span>已作废</span><b>{{row.tasks.length}}</b></button>
          <div v-if="expandedVoidedChildGroups.has(row.parentId)" class="completed-list"><article v-for="task in row.tasks" :key="task.id" class="completed-task voided-task child" :style="{'--task-depth':row.depth}" @click="selectTask(task)"><span class="task-expand placeholder"></span><button class="circle voided" aria-label="重新启用子任务" @click.stop="restoreVoided(task)"><AppIcon name="archive" :size="13"/></button><div><strong class="voided-title">{{task.title}}</strong><small>{{task.voidReason||'已作废子任务'}}</small></div></article></div>
        </section>
        </template>
        <section v-if="currentProject && completedProjectTasks.length" class="completed-section" aria-label="已完成任务">
          <button
            class="completed-toggle"
            :aria-expanded="completedSectionExpanded"
            @click="completedSectionExpanded = !completedSectionExpanded"
          >
            <AppIcon :name="completedSectionExpanded ? 'chevron-down' : 'chevron-right'" :size="16" />
            <span>已完成</span><b>{{ completedProjectTasks.length }}</b>
          </button>
          <div v-if="completedSectionExpanded" class="completed-list">
            <article
              v-for="task in completedProjectTasks"
              :key="task.id"
              class="completed-task"
              :class="{ active: selected?.id === task.id }"
              tabindex="0"
              @click="selectTask(task)"
              @keydown.enter="selectTask(task)"
            >
              <span class="task-expand placeholder"></span>
              <button class="circle done" aria-label="恢复任务" @click.stop="toggleDone(task)">
                <AppIcon name="check" :size="14" />
              </button>
              <div><strong class="strike">{{ task.title }}</strong><small>{{ task.tags.map((tag) => "#" + tag).join(" ") || "已完成任务" }}</small></div>
              <button class="star" :class="{ filled: task.favorite }" :aria-label="task.favorite ? '取消收藏' : '收藏任务'" @click.stop="save(task, { favorite: !task.favorite })"><AppIcon name="star" :size="19" /></button>
            </article>
          </div>
        </section>
        <section v-if="currentProject && voidedProjectTasks.length" class="completed-section voided-section" aria-label="已作废任务">
          <button class="completed-toggle voided-toggle" :aria-expanded="voidedSectionExpanded" @click="voidedSectionExpanded=!voidedSectionExpanded"><AppIcon :name="voidedSectionExpanded?'chevron-down':'chevron-right'" :size="16"/><AppIcon name="archive" :size="15"/><span>已作废</span><b>{{voidedProjectTasks.length}}</b></button>
          <div v-if="voidedSectionExpanded" class="completed-list"><article v-for="task in voidedProjectTasks" :key="task.id" class="completed-task voided-task" :class="{active:selected?.id===task.id}" tabindex="0" @click="selectTask(task)" @keydown.enter="selectTask(task)"><span class="task-expand placeholder"></span><button class="circle voided" aria-label="重新启用任务" @click.stop="restoreVoided(task)"><AppIcon name="archive" :size="13"/></button><div><strong class="voided-title">{{task.title}}</strong><small>{{task.voidReason||'已作废任务'}}</small></div></article></div>
        </section>
        <div v-if="currentProject && draggedTaskId" class="task-root-drop" @dragover.prevent @drop="dropTaskAtRoot">放到根任务末尾</div>
        <div
          v-if="
            !visibleTaskRows.length &&
            !completedProjectTasks.length &&
            !voidedProjectTasks.length &&
            !(
              currentProject &&
              effectiveView.showSubprojects &&
              projects.some(
                (item) => item.parentId === currentProject?.projectId,
              )
            )
          "
          class="empty"
        >
          <b>{{ listSearch || search ? "没有匹配结果" : "这里还没有任务" }}</b
          ><span>{{
            listSearch || search ? "尝试其他关键词" : "从添加一件小事开始"
          }}</span>
        </div>
      </div>
    </section>
    <aside
      v-if="selected"
      class="detail"
      :class="{ advanced: selected.kind === 'advanced' }"
      aria-label="任务详情"
    >
      <button
        class="detail-close"
        aria-label="关闭任务详情"
        @click="flushSave(selected).then(() => (selected = undefined))"
      >
        <AppIcon name="close" />
      </button>
      <div class="detail-scroll">
        <div class="task-title">
          <button
            class="circle"
            :class="{ done: selected.status === 'completed', voided:selected.status==='voided' }"
            @click="toggleDone(selected)"
          >
            <AppIcon
              v-if="selected.status === 'completed'"
              name="check"
              :size="14"
            /><AppIcon v-else-if="selected.status==='voided'" name="archive" :size="13" /></button
          ><input
            v-model="selected.title"
            @input="queueSave(selected, { title: selected.title })"
            aria-label="任务标题"
          /><button
            class="star"
            :class="{ filled: selected.favorite }"
            @click="save(selected, { favorite: !selected.favorite })"
          >
            <AppIcon name="star" :size="19" />
          </button>
        </div>
        <div class="save-indicator" :class="saveState" aria-live="polite">
          {{ saveState === 'dirty' ? '未保存' : saveState === 'saving' ? '正在保存…' : saveState === 'failed' ? '保存失败' : '已保存' }}
          <button v-if="saveState === 'failed'" @click="flushSave(selected)">重试</button>
        </div>
        <div class="steps" aria-label="子任务">
          <h3>子任务</h3>
          <div v-for="child in children" :key="child.id">
            <button
              class="circle"
              :class="{ done: child.status === 'completed', voided:child.status==='voided' }"
              @click="toggleDone(child)"
            >
              <AppIcon
                v-if="child.status === 'completed'"
                name="check"
                :size="14"
              /><AppIcon v-else-if="child.status==='voided'" name="archive" :size="13" /></button
            ><button
              class="step-name"
              :class="{ strike: child.status === 'completed', 'voided-title':child.status==='voided' }"
              @dblclick="openDialog('renameChild', undefined, child, $event.currentTarget)"
            >
              {{ child.title }}
            </button>
          </div>
          <form @submit.prevent="addChildTask">
            <input
              v-model="childDraft"
              placeholder="添加子任务"
              aria-label="子任务名称"
            /><button aria-label="添加子任务"><AppIcon name="plus" /></button>
          </form>
        </div>
        <section class="schedule-card">
          <SchedulePicker kind="reminder" :model-value="selected.reminder" @change="saveDate('reminder',$event)" />
          <SchedulePicker kind="due" :model-value="selected.due" @change="saveDate('due',$event)" />
          <label
            ><AppIcon name="repeat" /><span>重复</span
            ><select
              :value="selected.repeat?.frequency ?? ''"
              @change="setRepeat(($event.target as HTMLSelectElement).value)"
            >
              <option value="">不重复</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </select></label
          >
        </section>
        <section class="assignment-card"><AppIcon name="user" :size="18"/><span>分配给</span><select :value="selected.assigneeIds?.[0]??''" @change="save(selected,{assigneeIds:($event.target as HTMLSelectElement).value?[($event.target as HTMLSelectElement).value]:[]})"><option value="">未分配</option><option value="local-self">{{settings?.currentUser?.name??'本地用户（自己）'}}</option></select></section>
        <section class="attachment-card">
          <button class="attachment-add" @click="addAttachments">
            <AppIcon name="paperclip" /><span>添加附件</span>
          </button>
          <article
            v-for="attachment in selected.attachments.filter(item=>item.role!=='inline')"
            :key="attachment.id"
            class="attachment-row"
            @click="previewAttachment(attachment)"
          >
            <span class="file-badge">{{
              attachment.name.split(".").pop()?.slice(0, 4).toUpperCase() ||
              "FILE"
            }}</span>
            <div>
              <b>{{ attachment.name }}</b
              ><small
                >{{ Math.max(1, Math.round(attachment.size / 1024)) }} KB ·
                {{ attachment.mime }}</small
              >
            </div>
            <button
              aria-label="移除附件"
              @click.stop="removeAttachment(attachment)"
            >
              <AppIcon name="close" :size="16" />
            </button>
          </article>
        </section>
        <div class="task-kind" role="radiogroup" aria-label="任务类型">
          <button
            :class="{ selected: (selected.kind ?? 'simple') === 'simple' }"
            role="radio"
            :aria-checked="(selected.kind ?? 'simple') === 'simple'"
            @click="setKind('simple')"
          >
            简单任务</button
          ><button
            :class="{ selected: selected.kind === 'advanced' }"
            role="radio"
            :aria-checked="selected.kind === 'advanced'"
            @click="setKind('advanced')"
          >
            高级任务
          </button>
        </div>
        <textarea
          v-if="selected.kind !== 'advanced'"
          v-model="selected.note"
          class="simple-note"
          @input="queueSave(selected, { note: selected.note })"
          placeholder="添加备注"
        ></textarea>
        <section v-else class="markdown-editor milkdown-editor-shell">
          <MarkdownEditor :key="selected.id" :model-value="editorMarkdown(selected)" :upload-image="uploadEditorImage" :read-clipboard-image="readClipboardEditorImage" @change="editorChanged" />
        </section>
        <small class="created-at"
          >创建于 {{ new Date(selected.createdAt).toLocaleDateString() }}</small
        >
        <section class="task-lifecycle-card" :class="{voided:selected.status==='voided'}">
          <template v-if="selected.status==='voided'"><div><AppIcon name="archive" :size="18"/><span><b>任务已作废</b><small>{{selected.voidReason||'未填写原因'}}<template v-if="selected.voidedAt"> · {{new Date(selected.voidedAt).toLocaleString()}}</template></small></span></div><button @click="restoreVoided(selected)">重新启用</button></template>
          <button v-else-if="selected.status==='active'" class="void-task-button" @click="voidTask(selected)"><AppIcon name="archive" :size="17"/>作废任务</button>
        </section>
      </div>
    </aside>
    <div
      v-if="contextMenu"
      class="context-menu floating-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <button @click="openDialog('subproject', contextMenu.project, undefined, $event.currentTarget)">
        <AppIcon name="plus" /><span>新增子项目</span></button
      ><button @click="openDialog('renameProject', contextMenu.project, undefined, $event.currentTarget)">
        <AppIcon name="edit" /><span>重命名</span></button
      ><button @click="openProperties(contextMenu.project)">
        <AppIcon name="settings" /><span>属性</span></button
      ><button v-if="contextMenu.project.parentId" @click="moveProject=contextMenu.project;moveTarget=null;contextMenu=null">
        <AppIcon name="move" /><span>移动到</span></button
      ><button @click="bridge().openProjectFolder(contextMenu.project.projectId);contextMenu=null">
        <AppIcon name="folder" /><span>在资源管理器中打开</span></button
      ><button class="danger" @click="archiveProject(contextMenu.project)">
        <AppIcon name="archive" /><span>归档</span>
      </button>
    </div>
    <div
      v-if="blankMenu"
      class="context-menu floating-menu"
      :style="{ left: blankMenu.x + 'px', top: blankMenu.y + 'px' }"
      @click.stop
    >
      <button @click="openDialog('rootProject', undefined, undefined, $event.currentTarget)">
        <AppIcon name="plus" /><span>新增项目</span>
      </button>
    </div>
    <div
      v-if="inputDialog"
      class="modal-backdrop"
       @click.self="closeInputDialog"
    >
       <form class="modal compact" @submit.prevent="confirmInput" @keydown.esc.prevent="closeInputDialog">
         <button type="button" class="modal-close" aria-label="关闭新建项目对话框" @click="closeInputDialog"><AppIcon name="close" :size="17" /></button>
         <h2>{{ inputDialog.title }}</h2>
         <input ref="inputDialogNameInput" v-model="inputDialog.value" aria-label="名称" @keydown.enter.prevent="confirmInput" />
        <div class="modal-actions">
           <button type="button" @click="closeInputDialog">取消</button
          ><button class="primary">确定</button>
        </div>
      </form>
    </div>
    <ConfirmDialog v-if="archiveConfirm" title="归档项目？" :message="archiveConfirm.message" confirm-label="归档项目" danger @cancel="cancelArchiveProject" @confirm="confirmArchiveProject" />
    <div
      v-if="propertiesProject"
      class="modal-backdrop"
      @click.self="propertiesProject = null"
    >
      <form class="modal properties-modal" @submit.prevent="saveProperties">
        <h2>项目属性</h2>
        <div class="form-grid">
          <label>项目名称<input v-model="propertiesProject.name" /></label
          ><label
            >项目图标<input
              v-model="propertiesProject.icon"
              maxlength="4" /></label
          ><label class="wide"
            >项目描述<textarea
              v-model="propertiesProject.description"
              placeholder="这个项目用于……"
            ></textarea></label
          ><label
            >侧边栏主题色<input
              v-model="propertiesProject.sidebarColor"
              type="color"
          /></label>
          <fieldset>
            <legend>项目主题</legend>
            <div class="theme-options">
              <button
                v-for="theme in [...themes,...(settings?.customThemes.map(custom=>({id:custom.id,name:custom.name,color:custom.tokens.accent}))??[])]"
                :key="theme.id"
                type="button"
                :class="{ selected: propertiesProject.theme === theme.id }"
                @click="propertiesProject.theme = theme.id"
              >
                <i :style="{ background: theme.color }"></i>{{ theme.name }}
              </button>
            </div>
          </fieldset>
          <fieldset class="wide git-binding"><legend>Git 仓库（可选）</legend><p v-if="propertiesProject.parentId">子项目继承上级 Git 边界；只有没有 Git 上级的项目才可单独绑定。</p><label>远程地址<input :disabled="!!propertiesProject.parentId" :value="propertiesProject.git?.remoteUrl??''" placeholder="git@github.com:owner/repo.git" @input="propertiesProject.git={provider:propertiesProject.git?.provider??'other',branch:propertiesProject.git?.branch??'main',remoteUrl:($event.target as HTMLInputElement).value}"/></label><label>分支<input :disabled="!!propertiesProject.parentId" :value="propertiesProject.git?.branch??'main'" @input="propertiesProject.git={provider:propertiesProject.git?.provider??'other',remoteUrl:propertiesProject.git?.remoteUrl??'',branch:($event.target as HTMLInputElement).value}"/></label><button v-if="propertiesProject.git" type="button" @click="propertiesProject.git=null">取消绑定</button></fieldset>
        </div>
        <div class="modal-actions">
          <button type="button" @click="propertiesProject = null">取消</button
          ><button class="primary">保存属性</button>
        </div>
      </form>
    </div>
    <div
      v-if="moveProject"
      class="modal-backdrop"
      @click.self="moveProject = null;moveTarget=null"
    >
      <section class="modal compact">
        <h2>移动“{{ moveProject.name }}”</h2>
        <p v-if="moveTarget"><b>{{moveProject.name}}</b> 将从 <b>{{projects.find(item=>item.projectId===moveProject?.parentId)?.name}}</b> 移动到 <b>{{moveTarget.name}}</b>；任务、附件和全部子项目会整体保留。</p>
        <div v-else class="move-list">
          <button
            v-for="project in projectMoveCandidates"
            :key="project.projectId"
            @click="moveTarget=project"
          >
            {{ project.icon }} {{ project.name }}
          </button>
        </div>
        <div class="modal-actions">
          <button @click="moveProject = null;moveTarget=null">取消</button><button v-if="moveTarget" class="primary" @click="moveTo(moveTarget.projectId)">确认移动</button>
        </div>
      </section>
    </div>
    <div v-if="pendingTaskMove" class="modal-backdrop" @click.self="pendingTaskMove=null"><section class="modal compact"><h2>确认移动任务</h2><p>任务“<b>{{pendingTaskMove.task.title}}</b>”将从“{{projects.find(item=>item.projectId===pendingTaskMove?.task.projectId)?.name}}”移动到“{{pendingTaskMove.target.name}}”。<template v-if="tasks.some(item=>item.parentId===pendingTaskMove?.task.id)">其全部子任务会一起移动。</template><template v-if="pendingTaskMove.task.attachments.length">其附件引用会保持不变。</template></p><div class="modal-actions"><button @click="pendingTaskMove=null">取消</button><button class="primary" @click="confirmTaskProjectMove">确认移动</button></div></section></div>
    <div v-if="workspaceManagerOpen && workspaceRegistry" class="modal-backdrop" @click.self="workspaceManagerOpen=false">
      <section class="modal workspace-manager" aria-labelledby="workspace-manager-title">
        <header><div><h2 id="workspace-manager-title">管理工作区</h2><p>每个工作区拥有独立的项目、任务、附件和外观设置。</p></div><button aria-label="关闭工作区管理" @click="workspaceManagerOpen=false"><AppIcon name="close" /></button></header>
        <div class="workspace-manager-list">
          <article v-for="workspace in workspaceRegistry.workspaces" :key="workspace.workspaceId" :class="{active:workspace.workspaceId===workspaceRegistry.activeWorkspaceId}">
            <AppIcon name="folder" :size="21"/><div><b>{{workspace.name}}</b><small>{{workspace.path}}</small></div><span v-if="workspace.workspaceId===workspaceRegistry.activeWorkspaceId" class="current-badge">当前</span>
            <div class="workspace-actions"><button v-if="workspace.workspaceId!==workspaceRegistry.activeWorkspaceId" @click="switchWorkspace(workspace.workspaceId)">切换</button><button @click="bridge().openWorkspace(workspace.workspaceId)">打开目录</button><button @click="renameWorkspace(workspace.workspaceId,workspace.name)">重命名</button><button class="danger" :disabled="workspaceRegistry.workspaces.length<=1" @click="removeWorkspace(workspace.workspaceId,workspace.name)">移除</button></div>
          </article>
        </div>
        <form class="workspace-create" @submit.prevent="createWorkspace"><label>新工作区名称<input v-model="workspaceName" maxlength="80"/></label><button class="primary" :disabled="workspaceBusy">新建工作区…</button><button type="button" :disabled="workspaceBusy" @click="addWorkspace">添加现有工作区…</button></form>
        <p class="workspace-safety">“移除”只取消软件中的注册，不会删除目录或其中任何任务数据。当前工作区如需换到新磁盘位置，请在设置中使用“修改工作目录并迁移”。</p>
      </section>
    </div>
    <div
      v-if="settingsOpen && settings"
      class="modal-backdrop"
      @click.self="closeSettings"
    >
      <section class="modal settings-modal settings-layout">
        <nav>
          <h2>设置</h2>
          <button
            :class="{ selected: settingsSection === 'general' }"
            @click="settingsSection = 'general'"
          >
            常规</button
          ><button
            :class="{ selected: settingsSection === 'appearance' }"
            @click="settingsSection = 'appearance'"
          >
            外观</button
          ><button
            :class="{ selected: settingsSection === 'projects' }"
            @click="settingsSection = 'projects'"
          >
            项目默认</button
          ><button
            :class="{ selected: settingsSection === 'archive' }"
            @click="
              settingsSection = 'archive';
              openArchive();
            "
          >
            归档
          </button>
        </nav>
        <div class="settings-content">
          <template v-if="settingsSection === 'general'"
            ><h2>常规</h2>
            <fieldset v-if="settings.currentUser"><legend>本机身份</legend><div class="form-grid"><label>显示名称<input v-model="settings.currentUser.name" @change="savePreferences({currentUser:settings.currentUser})"/></label><label>Git 邮箱<input v-model="settings.currentUser.email" type="email" placeholder="you@example.com" @change="savePreferences({currentUser:settings.currentUser})"/></label></div><p>身份 ID 固定为 {{settings.currentUser.id}}；密码和 Git 凭据由操作系统管理。</p></fieldset>
            <label>工作目录</label>
            <div class="path-box">{{ settings.workspacePath }}</div>
            <p>迁移校验成功后切换到新目录并删除旧工作目录。</p>
            <label>今日待办截止窗口（天）<input v-model.number="settings.todayWindowDays" type="number" min="0" max="30" @change="savePreferences({todayWindowDays:settings.todayWindowDays})"/></label>
            <button
              class="primary"
              :disabled="migrating"
              @click="changeWorkspace"
            >
              {{ migrating ? "正在迁移…" : "修改工作目录并迁移" }}
            </button>
            <fieldset>
              <legend>侧边栏宽度</legend>
              <div class="range-setting">
                <input
                  v-model.number="settings.sidebarWidth"
                  type="range"
                  min="220"
                  max="380"
                  step="4"
                  @change="
                    savePreferences({ sidebarWidth: settings.sidebarWidth })
                  "
                /><output>{{ settings.sidebarWidth }} px</output>
              </div>
            </fieldset></template
          ><template v-else-if="settingsSection === 'appearance'"
            ><h2>外观</h2>
            <fieldset>
              <legend>全局主题</legend>
              <div class="theme-options">
                <button
                  v-for="theme in themes"
                  :key="theme.id"
                  :class="{ selected: settings.theme === theme.id }"
                  @click="setGlobalTheme(theme.id)"
                >
                  <i :style="{ background: theme.color }"></i
                  >{{ theme.name }}</button
                ><button v-for="custom in settings.customThemes" :key="custom.id" :class="{selected:settings.theme===custom.id}" @click="setGlobalTheme(custom.id)"><i :style="{background:custom.tokens.accent}"></i>{{custom.name}}</button>
              </div>
            </fieldset>
            <fieldset class="custom-theme-manager"><legend>自定义主题</legend><button type="button" class="primary" @click="createCustomTheme()">新增主题</button><span v-if="customThemeNotice" class="theme-notice" role="status">{{customThemeNotice}}</span><form v-if="customThemeComposerOpen" class="custom-theme-composer" @submit.prevent="confirmCreateCustomTheme"><input v-model="newCustomThemeName" aria-label="新主题名称" placeholder="输入主题名称" autofocus/><button type="submit" class="primary">创建草稿</button><button type="button" @click="cancelCreateCustomTheme">取消</button></form><article v-for="custom in customThemeDrafts" :key="custom.id" class="custom-theme-card"><input v-model="custom.name" aria-label="主题名称"/><div class="token-colors"><label v-for="field in ['scene','sceneLayer','panel','card','hover','accent','accentAlt','text','muted','border','danger','shadow']" :key="field">{{field}}<input v-model="custom.tokens[field as keyof typeof custom.tokens]" type="color" @input="transientSettingsPreview=custom.id"/></label></div><div class="custom-theme-actions"><button class="primary" @click="saveCustomTheme(custom)">保存</button><button @click="applyCustomTheme(custom)">保存并应用</button><button title="以当前主题创建一个可独立编辑的新副本" @click="copyCustomTheme(custom)">复制为新主题</button><button @click="chooseBackground(custom)">{{custom.backgroundImage?'替换背景':'选择背景'}}</button><button v-if="custom.backgroundImage" @click="custom.backgroundImage=null;transientSettingsPreview=custom.id;customThemeNotice='背景已移除，请点击保存。'">移除背景</button><button class="danger" @click="deleteCustomTheme(custom)">删除</button></div></article></fieldset></template
          ><template v-else-if="settingsSection === 'projects'"
            ><h2>全项目默认设置</h2>
            <label
              >排序方式<select
                v-model="settings.projectDefaults.sortMode"
                @change="
                  savePreferences({ projectDefaults: settings.projectDefaults })
                "
              >
                <option value="manual">手动排序</option>
                <option value="title">按标题</option>
                <option value="updated">最近更新</option>
              </select></label
            ><label>默认任务展开<select v-model="settings.projectDefaults.defaultTaskExpansion.mode" @change="savePreferences({projectDefaults:settings.projectDefaults})"><option value="collapsed">默认不展开</option><option value="depth">默认展开到指定层级</option></select></label>
            <label>默认展开到<select v-model="settings.projectDefaults.defaultTaskExpansion.depth" :disabled="settings.projectDefaults.defaultTaskExpansion.mode!=='depth'" @change="savePreferences({projectDefaults:settings.projectDefaults})"><option :value="1">第一层</option><option :value="2">第二层</option><option :value="3">第三层</option><option :value="4">第四层</option><option :value="5">第五层</option><option value="all">全部</option></select></label>
            <label class="check-setting"
              ><input
                v-model="settings.projectDefaults.rememberTaskExpansion"
                type="checkbox"
                @change="
                  savePreferences({ projectDefaults: settings.projectDefaults })
                "
              />记住上次任务展开情况</label
            ><label class="check-setting"
              ><input
                v-model="settings.projectDefaults.showSubprojects"
                type="checkbox"
                @change="
                  savePreferences({ projectDefaults: settings.projectDefaults })
                "
              />任务列表显示子项目目录</label
            ><label class="inherited-theme-note">默认项目主题 <span>跟随“外观”中的全局主题（当前：{{ globalThemeName }}）</span></label
            ></template
          ><template v-else
            ><h2>归档项目</h2>
            <p v-if="!archived.length">还没有归档项目。</p>
            <article
              v-for="item in archived"
              :key="item.project.projectId"
              class="archive-card"
            >
              <AppIcon name="archive" />
              <div>
                <b>{{ item.project.name }}</b
                ><small
                  >{{ item.active }} 未完成 · {{ item.completed }} 已完成 ·
                  {{ item.total }} 全部</small
                >
                <details>
                  <summary>查看任务</summary>
                  <p
                    v-for="task in item.tasks"
                    :key="task.id"
                    :class="{ strike: task.status === 'completed' }"
                  >
                    {{ task.title }}
                  </p>
                </details>
              </div>
            </article></template
          >
          <div class="modal-actions">
            <button @click="closeSettings">关闭</button>
          </div>
        </div>
      </section>
    </div>
    <div
      v-if="attachmentPreview"
      class="modal-backdrop preview-backdrop"
      @click.self="attachmentPreview = null"
    >
      <section class="modal attachment-preview">
        <header>
          <div>
            <b>{{ attachmentPreview.attachment.name }}</b
            ><small>{{ attachmentPreview.attachment.mime }}</small>
          </div>
          <button aria-label="关闭预览" @click="attachmentPreview = null">
            <AppIcon name="close" />
          </button>
        </header>
        <div class="preview-stage">
          <img
            v-if="
              attachmentPreview.supported &&
              attachmentPreview.mime?.startsWith('image/')
            "
            :src="attachmentPreview.dataUrl"
          /><audio
            v-else-if="
              attachmentPreview.supported &&
              attachmentPreview.mime?.startsWith('audio/')
            "
            :src="attachmentPreview.dataUrl"
            controls
          /><video
            v-else-if="
              attachmentPreview.supported &&
              attachmentPreview.mime?.startsWith('video/')
            "
            :src="attachmentPreview.dataUrl"
            controls
          /><iframe
            v-else-if="
              attachmentPreview.supported &&
              attachmentPreview.mime === 'application/pdf'
            "
            :src="attachmentPreview.dataUrl"
          ></iframe>
          <pre
            v-else-if="
              attachmentPreview.supported &&
              attachmentPreview.text !== undefined
            "
            >{{ attachmentPreview.text }}</pre>
          <div v-else class="unsupported">
            <AppIcon name="file" :size="42" /><b>不支持内置预览</b
            ><span>{{ attachmentPreview.reason }}</span>
          </div>
        </div>
        <footer>
          <button
            class="primary"
            @click="downloadAttachment(attachmentPreview.attachment)"
          >
            <AppIcon name="download" /><span>下载文件</span>
          </button>
        </footer>
      </section>
    </div>
    <div v-if="conflict" class="modal-backdrop"><section class="modal compact"><h2>任务已被外部修改</h2><p>本地草稿和磁盘版本都已保留。请选择要继续编辑的版本。</p><div class="modal-actions"><button @click="resolveConflict('disk')">使用磁盘版本</button><button class="primary" @click="resolveConflict('local')">保留本地草稿</button></div></section></div>
  </main>
</template>
