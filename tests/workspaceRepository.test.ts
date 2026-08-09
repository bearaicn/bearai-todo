import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ProjectRepository,
  WorkspaceRepository,
} from "../src/infrastructure/workspaceRepository";
import { WorkspaceRegistryRepository } from "../src/infrastructure/workspaceRegistryRepository";
import {
  migrateWorkspace,
  SettingsRepository,
} from "../src/infrastructure/settingsRepository";
const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "bear-workspace-"));
  roots.push(root);
  return {
    root,
    workspace: new WorkspaceRepository(root),
    projects: new ProjectRepository(root),
  };
}
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);
describe("workspace and project folders", () => {
  it("creates root JSON and a real default project folder", async () => {
    const { root, workspace, projects } = await setup();
    const config = await workspace.initialize();
    const values = await projects.initialize();
    expect(config.schema).toBe("bearai.todo/workspace@1");
    expect(
      JSON.parse(await readFile(join(root, ".bearai-workspace.json"), "utf8"))
        .workspaceId,
    ).toBe(config.workspaceId);
    expect(values.some((item) => item.name === "默认项目")).toBe(true);
    expect(
      JSON.parse(
        await readFile(join(root, "默认项目", ".bearai-project.json"), "utf8"),
      ).name,
    ).toBe("默认项目");
  });
  it("safely renames a legacy default 任务 project folder", async () => {
    const { root, workspace, projects } = await setup();
    await workspace.initialize();
    const legacy = await projects.create("任务", null);
    const values = await projects.initialize();
    expect(
      values.find((item) => item.projectId === legacy.projectId)?.name,
    ).toBe("默认项目");
    expect((await stat(join(root, "默认项目"))).isDirectory()).toBe(true);
  });
  it("rebuilds non-authoritative statistics in root configuration", async () => {
    const { workspace } = await setup();
    await workspace.initialize();
    const updated = await workspace.updateStatistics(3, 7);
    expect(updated.statistics).toMatchObject({
      activeTasks: 3,
      completedTasks: 7,
    });
    expect(updated.statistics.rebuiltAt).toBeTruthy();
  });
  it("creates nested project folders with stable configuration", async () => {
    const { root, projects } = await setup();
    await projects.initialize();
    const parent = await projects.create("工作", null),
      child = await projects.create("BearAI", parent.projectId);
    expect(child.parentId).toBe(parent.projectId);
    expect(
      JSON.parse(
        await readFile(
          join(root, "工作", "BearAI", ".bearai-project.json"),
          "utf8",
        ),
      ).projectId,
    ).toBe(child.projectId);
  });
  it("persists project appearance, collapse state and physical moves", async () => {
    const { root, projects } = await setup();
    await projects.initialize();
    const parent = await projects.create("产品", null),
      sourceParent = await projects.create("旧父项目", null),
      child = await projects.create("客户端", sourceParent.projectId);
    const styled = await projects.update(parent.projectId, {
      icon: "🧭",
      description: "桌面产品",
      sidebarColor: "#336699",
      theme: "ocean",
      collapsed: true,
    });
    expect(styled).toMatchObject({
      icon: "🧭",
      description: "桌面产品",
      theme: "ocean",
      collapsed: true,
    });
    const moved = await projects.move(child.projectId, parent.projectId);
    expect(moved.parentId).toBe(parent.projectId);
    expect((await stat(join(root, "产品", "客户端"))).isDirectory()).toBe(true);
    expect(
      (await projects.list()).find(
        (item) => item.projectId === parent.projectId,
      ),
    ).toMatchObject({ sidebarColor: "#336699", collapsed: true });
  });
  it("renames, safely archives and lists the whole project folder", async () => {
    const { root, projects } = await setup();
    await projects.initialize();
    const project = await projects.create("旧项目", null);
    const renamed = await projects.rename(project.projectId, "新项目");
    expect(renamed.relativePath).toBe("新项目");
    const archived = await projects.archive(project.projectId);
    expect(archived.archived).toBe(true);
    expect(
      (
        await stat(join(root, ".archive", "projects", project.projectId))
      ).isDirectory(),
    ).toBe(true);
    expect(
      (await projects.list()).some(
        (item) => item.projectId === project.projectId,
      ),
    ).toBe(false);
    expect(await projects.listArchived()).toEqual([
      expect.objectContaining({
        projectId: project.projectId,
        name: "新项目",
        archived: true,
      }),
    ]);
  });
  it("migrates workspace, verifies it and removes the original directory", async () => {
    const { root, projects } = await setup();
    await projects.initialize();
    const target = await mkdtemp(join(tmpdir(), "bear-target-")),
      settingsRoot = await mkdtemp(join(tmpdir(), "bear-settings-"));
    roots.push(target, settingsRoot);
    const evidence = await migrateWorkspace(root, target);
    expect(evidence).toMatchObject({ projects: 1, sourceRemoved: true });
    await expect(stat(root)).rejects.toThrow();
    expect(
      JSON.parse(await readFile(join(target, ".bearai-workspace.json"), "utf8"))
        .schema,
    ).toBe("bearai.todo/workspace@1");
    const settings = new SettingsRepository(
      join(settingsRoot, "settings.json"),
    );
    await settings.setWorkspace(target);
    await settings.setTheme("ocean");
    expect(await settings.read()).toMatchObject({
      workspacePath: target,
      theme: "ocean",
    });
  });
  it("rejects non-empty or nested migration targets", async () => {
    const { root, projects } = await setup();
    await projects.initialize();
    await expect(migrateWorkspace(root, join(root, "inside"))).rejects.toThrow(
      "不能互相嵌套",
    );
    const target = await mkdtemp(join(tmpdir(), "bear-nonempty-"));
    roots.push(target);
    await writeFile(join(target, "existing.txt"), "x");
    await expect(migrateWorkspace(root, target)).rejects.toThrow("必须为空");
  });
  it("migrates the legacy custom slot into a stable named theme", async () => {
    const root = await mkdtemp(join(tmpdir(), "bear-settings-"));
    roots.push(root);
    const settings = new SettingsRepository(join(root, "settings.json"));
    const value = await settings.setPreferences({
      theme: "custom",
      sidebarWidth: 999,
      customTheme: {
        accent: "#123456",
        scene: "#eeeeee",
        backgroundImage: "D:\\image.png",
      },
    });
    expect(value).toMatchObject({ theme: "custom", sidebarWidth: 380 });
    expect(await settings.read()).toMatchObject({
      sidebarWidth: 380,
      theme: "custom-migrated",
      customThemes: [
        {
          id: "custom-migrated",
          name: "原自定义主题",
          backgroundImage: "D:\\image.png",
        },
      ],
    });
  });
  it("persists and clamps the Today deadline window", async () => {
    const root = await mkdtemp(join(tmpdir(), "bear-settings-"));
    roots.push(root);
    const settings = new SettingsRepository(join(root, "settings.json"));
    expect((await settings.read()).todayWindowDays).toBe(3);
    expect(
      (await settings.setPreferences({ todayWindowDays: -2 })).todayWindowDays,
    ).toBe(0);
    expect(
      (await settings.setPreferences({ todayWindowDays: 99 })).todayWindowDays,
    ).toBe(30);
  });
  it("migrates legacy task expansion once and persists only the independent model", async () => {
    const root = await mkdtemp(join(tmpdir(), "bear-settings-")),
      path = join(root, "settings.json");
    roots.push(root);
    await writeFile(
      path,
      JSON.stringify({
        schema: "bearai.todo/settings@1",
        projectDefaults: {
          sortMode: "manual",
          theme: "mist",
          expandMode: "remember",
          rememberDefaultDepth: 4,
          showSubprojects: true,
          expandedTaskIds: ["a"],
        },
      }),
    );
    const settings = new SettingsRepository(path),
      migrated = await settings.read();
    expect(migrated.projectDefaults).toMatchObject({
      defaultTaskExpansion: { mode: "collapsed", depth: 4 },
      rememberTaskExpansion: true,
      showSubprojects: true,
    });
    expect(migrated.projectDefaults).not.toHaveProperty("expandMode");
    expect(migrated.projectDefaults).not.toHaveProperty("rememberDefaultDepth");
    await settings.setPreferences({
      projectDefaults: {
        ...migrated.projectDefaults,
        defaultTaskExpansion: { mode: "depth", depth: 5 },
        rememberTaskExpansion: false,
      },
    });
    const disk = JSON.parse(await readFile(path, "utf8")).projectDefaults;
    expect(disk).toMatchObject({
      defaultTaskExpansion: { mode: "depth", depth: 5 },
      rememberTaskExpansion: false,
      showSubprojects: true,
    });
    expect(disk).not.toHaveProperty("expandMode");
    expect(disk).not.toHaveProperty("rememberDefaultDepth");
  });
  it("uses all levels as the default expansion depth for new settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "bear-settings-default-"));
    roots.push(root);
    const settings = await new SettingsRepository(join(root, "settings.json")).read();
    expect(settings.projectDefaults.defaultTaskExpansion).toEqual({
      mode: "collapsed",
      depth: "all",
    });
  });
  it("strips legacy expansion fields from project JSON when project settings are updated", async () => {
    const { root, projects } = await setup();
    await projects.initialize();
    const project = await projects.create("兼容项目", null),
      path = join(root, "兼容项目", ".bearai-project.json"),
      raw = JSON.parse(await readFile(path, "utf8"));
    raw.viewSettings = {
      expandMode: "remember",
      rememberDefaultDepth: 3,
      showSubprojects: false,
    };
    await writeFile(path, JSON.stringify(raw));
    await projects.update(project.projectId, {
      settingsMode: "own",
      viewSettings: {
        defaultTaskExpansion: { mode: "depth", depth: 2 },
        rememberTaskExpansion: true,
      },
    });
    const disk = JSON.parse(await readFile(path, "utf8")).viewSettings;
    expect(disk).toMatchObject({
      defaultTaskExpansion: { mode: "depth", depth: 2 },
      rememberTaskExpansion: true,
      showSubprojects: false,
    });
    expect(disk).not.toHaveProperty("expandMode");
    expect(disk).not.toHaveProperty("rememberDefaultDepth");
  });
  it("allows one Git binding per inherited project subtree", async () => {
    const { projects } = await setup();
    await projects.initialize();
    const root = await projects.create("Git根", null),
      child = await projects.create("子项目", root.projectId);
    await projects.update(root.projectId, {
      git: {
        remoteUrl: "git@example.com:a/repo.git",
        branch: "main",
        provider: "other",
      },
    });
    await expect(
      projects.update(child.projectId, {
        git: {
          remoteUrl: "git@example.com:b/repo.git",
          branch: "main",
          provider: "other",
        },
      }),
    ).rejects.toThrow("上级项目");
  });
  it("reorders only siblings and persists unique project order", async () => {
    const { projects } = await setup();
    const [fallback] = await projects.initialize(),
      a = await projects.create("A", null),
      b = await projects.create("B", null),
      childA = await projects.create("A1", a.projectId),
      childB = await projects.create("B1", b.projectId);
    await projects.reorder({
      projectId: b.projectId,
      parentId: null,
      beforeId: a.projectId,
      expectedRevision: b.revision,
    });
    const roots = (await projects.list()).filter(
      (item) => item.parentId === null,
    );
    expect(roots.map((item) => item.projectId)).toEqual([
      fallback.projectId,
      b.projectId,
      a.projectId,
    ]);
    expect(new Set(roots.map((item) => item.order)).size).toBe(roots.length);
    await expect(
      projects.reorder({
        projectId: childA.projectId,
        parentId: b.projectId,
        beforeId: childB.projectId,
        expectedRevision: childA.revision,
      }),
    ).rejects.toThrow("同一父项目");
  });
  it("moves only child projects and rejects cycles and stale revisions", async () => {
    const { root, projects } = await setup();
    await projects.initialize();
    const a = await projects.create("父A", null),
      b = await projects.create("父B", null),
      child = await projects.create("子", a.projectId),
      grandchild = await projects.create("孙", child.projectId);
    await expect(
      projects.moveChecked({
        projectId: a.projectId,
        targetParentId: b.projectId,
        expectedRevision: a.revision,
      }),
    ).rejects.toThrow("顶级项目");
    await expect(
      projects.moveChecked({
        projectId: child.projectId,
        targetParentId: grandchild.projectId,
        expectedRevision: child.revision,
      }),
    ).rejects.toThrow("子项目");
    await expect(
      projects.moveChecked({
        projectId: child.projectId,
        targetParentId: b.projectId,
        expectedRevision: 999,
      }),
    ).rejects.toThrow("revision");
    const moved = await projects.moveChecked({
      projectId: child.projectId,
      targetParentId: b.projectId,
      expectedRevision: child.revision,
    });
    expect(moved).toMatchObject({
      projectId: child.projectId,
      parentId: b.projectId,
    });
    expect((await stat(join(root, "父B", "子", "孙"))).isDirectory()).toBe(
      true,
    );
  });
  it("keeps only user and workspace locations in the runtime registry",async()=>{const first=await mkdtemp(join(tmpdir(),"bear-space-a-")),second=await mkdtemp(join(tmpdir(),"bear-space-b-")),runtime=await mkdtemp(join(tmpdir(),"bear-runtime-"));roots.push(first,second,runtime);await new WorkspaceRepository(first).initialize("工作区一");await new WorkspaceRepository(second).initialize("工作区二");const registry=new WorkspaceRegistryRepository(join(runtime,"workspaces.json"));await registry.ensure(first);let value=await registry.add(second,true);expect(value.workspaces.map(item=>item.name)).toEqual(["工作区一","工作区二"]);expect(value.activeWorkspaceId).toBe(value.workspaces[1].workspaceId);expect(value).not.toHaveProperty("theme");expect(value).not.toHaveProperty("projectDefaults");value=await registry.rename(value.workspaces[1].workspaceId,"第二仓库");expect((await new WorkspaceRepository(second).read()).name).toBe("第二仓库");await registry.setUser({id:"local-self",name:"竹子",email:"zhu@example.com"});expect((await registry.read()).user.name).toBe("竹子")});
  it("switches and unregisters workspaces without deleting their data",async()=>{const first=await mkdtemp(join(tmpdir(),"bear-space-a-")),second=await mkdtemp(join(tmpdir(),"bear-space-b-")),runtime=await mkdtemp(join(tmpdir(),"bear-runtime-"));roots.push(first,second,runtime);const one=await new WorkspaceRepository(first).initialize("一"),two=await new WorkspaceRepository(second).initialize("二"),registry=new WorkspaceRegistryRepository(join(runtime,"workspaces.json"));await registry.add(first,true);await registry.add(second);await registry.activate(two.workspaceId);const removed=await registry.remove(two.workspaceId);expect(removed.activeWorkspaceId).toBe(one.workspaceId);expect((await stat(join(second,".bearai-workspace.json"))).isFile()).toBe(true);await expect(registry.remove(one.workspaceId)).rejects.toThrow("至少保留")});
});
