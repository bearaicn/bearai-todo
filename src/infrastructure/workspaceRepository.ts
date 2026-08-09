import { mkdir, open, readFile, readdir, rename, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  withoutLegacyExpansionSettings,
  type Project,
  type ProjectMoveDto,
  type ProjectReorderDto,
  type ProjectTheme,
  type ProjectViewSettings,
  type WorkspaceConfig,
} from "../domain/project.js";
import {withWorkspaceWriteLock} from './workspaceWriteLock.js'

const WORKSPACE_FILE = ".bearai-workspace.json",
  PROJECT_FILE = ".bearai-project.json";
function safeName(value: string) {
  const name = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "");
  if (!name) throw new Error("项目名称不能为空");
  return name;
}
async function atomicJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temp, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, path);
}
export class WorkspaceRepository {
  constructor(readonly root: string) {}
  async initialize(name = "熊智ToDo工作目录") {
    await mkdir(this.root, { recursive: true });
    const path = join(this.root, WORKSPACE_FILE);
    try {
      return JSON.parse(await readFile(path, "utf8")) as WorkspaceConfig;
    } catch {
      const now = new Date().toISOString();
      const value: WorkspaceConfig = {
        schema: "bearai.todo/workspace@1",
        workspaceId: randomUUID(),
        revision: 1,
        name,
        createdAt: now,
        updatedAt: now,
        statistics: { activeTasks: 0, completedTasks: 0, rebuiltAt: null },
      };
      await atomicJson(path, value);
      return value;
    }
  }
  async read() {
    return JSON.parse(
      await readFile(join(this.root, WORKSPACE_FILE), "utf8"),
    ) as WorkspaceConfig;
  }
  async save(value: WorkspaceConfig) {
    await atomicJson(join(this.root, WORKSPACE_FILE), value);
    return value;
  }
  async updateStatistics(activeTasks: number, completedTasks: number) {
    const current = await this.read();
    const next = {
      ...current,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      statistics: {
        activeTasks,
        completedTasks,
        rebuiltAt: new Date().toISOString(),
      },
    };
    await atomicJson(join(this.root, WORKSPACE_FILE), next);
    return next;
  }
}
export class ProjectRepository {
  constructor(readonly root: string) {}
  private withWrite<T>(work:()=>Promise<T>){return withWorkspaceWriteLock(this.root,work)}
  async initialize() {
    await new WorkspaceRepository(this.root).initialize();
    let projects = await this.list();
    const legacyDefault = projects.find(
      (item) => item.name === "任务" && item.parentId === null,
    );
    if (legacyDefault) await this.rename(legacyDefault.projectId, "默认项目");
    projects = await this.list();
    if (!projects.length) await this.create("默认项目", null);
    return this.list();
  }
  async list(): Promise<Project[]> {
    await mkdir(this.root, { recursive: true });
    const result: Project[] = [];
    await this.walk(this.root, result);
    return result.sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );
  }
  async listArchived(): Promise<Project[]> {
    const archiveRoot = join(this.root, ".archive", "projects"),
      result: Project[] = [];
    let entries;
    try {
      entries = await readdir(archiveRoot, { withFileTypes: true });
    } catch {
      return result;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = join(archiveRoot, entry.name);
      try {
        const value = JSON.parse(
          await readFile(join(folder, PROJECT_FILE), "utf8"),
        );
        result.push({
          icon: "📁",
          description: "",
          sidebarColor: "#71807a",
          theme: "mist",
          collapsed: false,
          ...value,
          archived: true,
          relativePath: relative(this.root, folder),
        });
      } catch {}
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  private async walk(directory: string, result: Project[]) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const folder = join(directory, entry.name),
        config = join(folder, PROJECT_FILE);
      try {
        const value = JSON.parse(await readFile(config, "utf8"));
        result.push({
          icon: "📁",
          description: "",
          sidebarColor: "#4fa879",
          theme: "sage",
          collapsed: false,
          ...value,
          relativePath: relative(this.root, folder),
        });
      } catch {}
      await this.walk(folder, result);
    }
  }
  async create(name: string, parentId: string | null) {
    const projects = await this.list();
    const parent = parentId
      ? projects.find((item) => item.projectId === parentId)
      : null;
    if (parentId && !parent) throw new Error("父项目不存在");
    const folder = this.uniqueFolder(
      parent ? join(this.root, parent.relativePath) : this.root,
      safeName(name),
      projects,
    );
    const now = new Date().toISOString();
    const value: Project = {
      schema: "bearai.todo/project@1",
      projectId: randomUUID(),
      revision: 1,
      name: name.trim(),
      parentId,
      order: projects.filter((item) => item.parentId === parentId).length,
      archived: false,
      createdAt: now,
      updatedAt: now,
      relativePath: relative(this.root, folder),
      icon: "📁",
      description: "",
      sidebarColor: "#4fa879",
      theme: "sage",
      collapsed: false,
      settingsMode: "inherit",
      viewSettings: {},
    };
    await mkdir(folder, { recursive: false });
    await atomicJson(join(folder, PROJECT_FILE), this.persisted(value));
    return value;
  }
  async rename(projectId: string, name: string) {
    const project = await this.get(projectId),
      source = join(this.root, project.relativePath),
      target = join(dirname(source), safeName(name));
    if (resolve(source) !== resolve(target)) {
      try {
        await stat(target);
        throw new Error("同级项目名称已存在");
      } catch (error) {
        if (error instanceof Error && error.message === "同级项目名称已存在")
          throw error;
      }
      await rename(source, target);
    }
    const next = {
      ...project,
      name: name.trim(),
      relativePath: relative(this.root, target),
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await atomicJson(join(target, PROJECT_FILE), this.persisted(next));
    return next;
  }
  async archive(projectId: string,expectedRevision?:number) {
    return this.withWrite(()=>this.archiveUnlocked(projectId,expectedRevision))
  }
  private async archiveUnlocked(projectId:string,expectedRevision?:number) {
    const project = await this.get(projectId),
      source = join(this.root, project.relativePath),
      target = join(this.root, ".archive", "projects", project.projectId);
    if(expectedRevision!==undefined&&project.revision!==expectedRevision)throw new Error(`项目 revision 冲突（期望 ${expectedRevision}，实际 ${project.revision}）`)
    await mkdir(dirname(target), { recursive: true });
    await rename(source, target);
    const next = {
      ...project,
      archived: true,
      relativePath: relative(this.root, target),
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await atomicJson(join(target, PROJECT_FILE), this.persisted(next));
    return next;
  }
  async update(
    projectId: string,
    patch: {
      name?: string;
      icon?: string;
      description?: string;
      sidebarColor?: string;
      theme?: ProjectTheme;
      collapsed?: boolean;
      viewSettings?: Partial<ProjectViewSettings>;
      settingsMode?: "inherit" | "own";
      git?: Project["git"];
    },
  ) {
    let project = await this.get(projectId);
    const projects = await this.list();
    if (patch.git) {
      let ancestor = project.parentId
        ? projects.find((item) => item.projectId === project.parentId)
        : undefined;
      while (ancestor) {
        if (ancestor.git)
          throw new Error(`Git 已由上级项目“${ancestor.name}”管理`);
        ancestor = ancestor.parentId
          ? projects.find((item) => item.projectId === ancestor?.parentId)
          : undefined;
      }
      if (
        projects.some(
          (item) =>
            item.projectId !== projectId &&
            item.relativePath.startsWith(project.relativePath + "\\") &&
            item.git,
        )
      )
        throw new Error("子项目已绑定 Git，不能在其上级重复绑定");
    }
    if (patch.name !== undefined && patch.name.trim() !== project.name)
      project = await this.rename(projectId, patch.name);
    const mergedView = patch.viewSettings
        ? { ...project.viewSettings, ...patch.viewSettings }
        : project.viewSettings,
      next = {
        ...project,
        ...patch,
        viewSettings: mergedView
          ? withoutLegacyExpansionSettings(mergedView)
          : mergedView,
        name: patch.name?.trim() ?? project.name,
        revision: project.revision + 1,
        updatedAt: new Date().toISOString(),
      };
    await atomicJson(
      join(this.root, next.relativePath, PROJECT_FILE),
      this.persisted(next),
    );
    return next;
  }
  async reorder(dto: ProjectReorderDto) {
    return this.withWrite(()=>this.reorderUnlocked(dto))
  }
  private async reorderUnlocked(dto:ProjectReorderDto) {
    const projects = await this.list(),
      project = projects.find((item) => item.projectId === dto.projectId);
    if (!project) throw new Error("项目不存在");
    if (project.parentId !== dto.parentId)
      throw new Error("拖拽排序只允许同一父项目");
    if (project.revision !== dto.expectedRevision)
      throw new Error(
        `项目 revision 冲突（期望 ${dto.expectedRevision}，实际 ${project.revision}）`,
      );
    const siblings = projects
      .filter(
        (item) =>
          item.parentId === dto.parentId &&
          item.projectId !== project.projectId,
      )
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    let index = dto.beforeId
      ? siblings.findIndex((item) => item.projectId === dto.beforeId)
      : dto.afterId
        ? siblings.findIndex((item) => item.projectId === dto.afterId) + 1
        : siblings.length;
    if (index < 0) throw new Error("排序目标不是同级项目");
    siblings.splice(index, 0, project);
    const now = new Date().toISOString(),
      changed = siblings
        .map((item, order) => ({ item, order }))
        .filter(({ item, order }) => item.order !== order)
        .map(({ item, order }) => ({
          ...item,
          order,
          revision: item.revision + 1,
          updatedAt: now,
        }));
    const backups = new Map<string, string>();
    try {
      for (const item of changed) {
        const path = join(this.root, item.relativePath, PROJECT_FILE);
        backups.set(path, await readFile(path, "utf8"));
        await atomicJson(path, this.persisted(item));
      }
    } catch (error) {
      for (const [path, content] of backups)
        await atomicJson(path, JSON.parse(content)).catch(() => undefined);
      throw error;
    }
    return (await this.list()).find(
      (item) => item.projectId === project.projectId,
    )!;
  }
  async move(projectId: string, parentId: string | null) {
    const project = await this.get(projectId);
    if (parentId === null) throw new Error("子项目不能通过移动提升为顶级项目");
    return this.moveChecked({
      projectId,
      targetParentId: parentId,
      expectedRevision: project.revision,
    });
  }
  async moveChecked(dto: ProjectMoveDto) {
    return this.withWrite(()=>this.moveCheckedUnlocked(dto))
  }
  private async moveCheckedUnlocked(dto:ProjectMoveDto) {
    const project = await this.get(dto.projectId),
      projects = await this.list();
    if (project.parentId === null)
      throw new Error("顶级项目不允许使用“移动到”");
    if (project.revision !== dto.expectedRevision)
      throw new Error(
        `项目 revision 冲突（期望 ${dto.expectedRevision}，实际 ${project.revision}）`,
      );
    if (dto.targetParentId === project.parentId)
      throw new Error("目标就是当前父项目");
    const parent = projects.find(
      (item) => item.projectId === dto.targetParentId,
    );
    if (!parent) throw new Error("目标项目不存在");
    if (parent.archived) throw new Error("不能移动到已归档项目");
    let cursor: Project | undefined = parent;
    while (cursor) {
      if (cursor.projectId === project.projectId)
        throw new Error("项目不能移动到自己的子项目");
      cursor = cursor.parentId
        ? projects.find((item) => item.projectId === cursor?.parentId)
        : undefined;
    }
    const source = join(this.root, project.relativePath),
      target = this.uniqueFolder(
        join(this.root, parent.relativePath),
        safeName(project.name),
        projects.filter((item) => item.projectId !== project.projectId),
      ),
      now = new Date().toISOString(),
      next = {
        ...project,
        parentId: parent.projectId,
        order: projects.filter((item) => item.parentId === parent.projectId)
          .length,
        relativePath: relative(this.root, target),
        revision: project.revision + 1,
        updatedAt: now,
      };
    await rename(source, target);
    try {
      await atomicJson(join(target, PROJECT_FILE), this.persisted(next));
    } catch (error) {
      await rename(target, source).catch(() => undefined);
      throw error;
    }
    return next;
  }
  async get(projectId: string) {
    const project = (await this.list()).find(
      (item) => item.projectId === projectId,
    );
    if (!project) throw new Error("项目不存在");
    return project;
  }
  private persisted({ relativePath, ...value }: Project) {
    return value;
  }
  private uniqueFolder(parent: string, name: string, projects: Project[]) {
    let target = join(parent, name),
      index = 2;
    const paths = new Set(
      projects.map((item) =>
        resolve(this.root, item.relativePath).toLocaleLowerCase(),
      ),
    );
    while (paths.has(resolve(target).toLocaleLowerCase()))
      target = join(parent, `${name} (${index++})`);
    if (!resolve(target).startsWith(resolve(this.root) + sep))
      throw new Error("项目路径越界");
    return target;
  }
}
