import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskRepository } from "../src/infrastructure/taskRepository";
import { parseTask, serializeTask } from "../src/infrastructure/taskCodec";
import { ProjectRepository } from "../src/infrastructure/workspaceRepository";
const roots: string[] = [];
async function repo() {
  const root = await mkdtemp(join(tmpdir(), "bear-todo-"));
  roots.push(root);
  return { root, repository: new TaskRepository(root) };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
describe("Markdown task repository", () => {
  it("creates a readable task file inside the default project folder", async () => {
    const { root, repository } = await repo();
    const task = await repository.create("第一件事");
    const files = await import("node:fs/promises").then((fs) =>
      fs.readdir(join(root, "默认项目")),
    );
    const text = await readFile(
      join(
        root,
        "默认项目",
        files.find((name) => name.endsWith(".md"))!,
      ),
      "utf8",
    );
    expect(text).toContain("bearai.todo/task@2");
    expect(parseTask(text).title).toBe("第一件事");
    expect(task.projectId).toBeTruthy();
  });
  it("lists tasks and persists a revisioned favorite update", async () => {
    const { repository } = await repo();
    const first = await repository.create("第一件事");
    const second = await repository.create("第二件事");
    const saved = await repository.save({ ...first, favorite: true }, 1);
    expect(saved.revision).toBe(2);
    expect((await repository.get(first.id)).favorite).toBe(true);
    expect((await repository.list()).map((task) => task.id)).toContain(
      second.id,
    );
  });
  it("persists a child task as its own Markdown file", async () => {
    const { repository } = await repo();
    const parent = await repository.create("父任务");
    const child = await repository.create(
      "子任务",
      parent.projectId,
      parent.id,
    );
    expect(child.parentId).toBe(parent.id);
    expect(
      (await repository.list()).filter((task) => task.parentId === parent.id),
    ).toHaveLength(1);
  });
  it("treats the containing project folder as authority after an external move", async () => {
    const { root, repository } = await repo();
    const source = await repository.create("可移动任务");
    const projects = new ProjectRepository(root),
      target = await projects.create("目标项目", null);
    const file = (await readdir(join(root, "默认项目"))).find((name) =>
      name.endsWith(".md"),
    )!;
    await rename(
      join(root, "默认项目", file),
      join(root, target.relativePath, file),
    );
    expect((await repository.get(source.id)).projectId).toBe(target.projectId);
  });
  it("preserves legacy and unknown frontmatter during v2 reads", () => {
    const task = parseTask(
      "---\nschema: bearai.todo/task@1\nid: abc\nrevision: 1\ntitle: T\nlistId: inbox\nstatus: active\nimportant: true\ncreatedAt: now\nupdatedAt: now\npluginValue:\n  nested: 42\n---\n原始正文\n",
    );
    const round = parseTask(serializeTask(task));
    expect(round.favorite).toBe(true);
    expect(round.extra.pluginValue).toEqual({ nested: 42 });
    expect(round.note).toBe("原始正文\n");
  });
  it("rejects stale saves after an external edit", async () => {
    const { root, repository } = await repo();
    const task = await repository.create("原任务");
    const files = await import("node:fs/promises").then((fs) =>
        fs.readdir(join(root, "默认项目")),
      ),
      path = join(
        root,
        "默认项目",
        files.find((name) => name.endsWith(".md"))!,
      );
    const external = { ...task, revision: 2, title: "外部修改" };
    await writeFile(path, serializeTask(external), "utf8");
    await expect(
      repository.save({ ...task, title: "应用修改" }, 1),
    ).rejects.toThrow("外部修改");
    expect((await repository.get(task.id)).title).toBe("外部修改");
  });
  it("persists advanced task scheduling, repeat and attachment metadata", async () => {
    const { repository } = await repo();
    const task = await repository.create("高级任务");
    await repository.save(
      {
        ...task,
        kind: "advanced",
        due: "2026-08-10T10:00:00.000Z",
        reminder: "2026-08-10T09:30:00.000Z",
        repeat: { frequency: "weekly", interval: 1 },
        attachments: [
          {
            id: "attachment-a",
            name: "说明.pdf",
            relativePath: ".attachments/task-a/file.pdf",
            mime: "application/pdf",
            size: 2048,
            createdAt: "2026-08-07T00:00:00.000Z",
          },
        ],
        note: "# Markdown 备注",
      },
      task.revision,
    );
    const restored = await repository.get(task.id);
    expect(restored).toMatchObject({
      kind: "advanced",
      due: "2026-08-10T10:00:00.000Z",
      reminder: "2026-08-10T09:30:00.000Z",
      repeat: { frequency: "weekly", interval: 1 },
      attachments: [{ name: "说明.pdf" }],
    });
    expect(restored.note.trim()).toBe("# Markdown 备注");
  });
  it("persists stable assignee ids without duplicating user profiles", async () => {
    const { repository } = await repo();
    const task = await repository.create("分配任务");
    await repository.save(
      { ...task, assigneeIds: ["local-self"] },
      task.revision,
    );
    expect(await repository.get(task.id)).toMatchObject({
      assigneeIds: ["local-self"],
    });
  });
  it("completes a recurring Markdown task and atomically creates its next occurrence", async () => {
    const { repository } = await repo();
    const task = await repository.create("每周回顾");
    const scheduled = await repository.save({
      ...task,
      due: "2026-08-09",
      reminder: "2026-08-09T09:00:00.000Z",
      repeat: { frequency: "weekly", interval: 1 },
      favorite: true,
      tags: ["复盘"],
      note: "保留为下一实例模板",
    }, task.revision);
    const result = await repository.complete(scheduled.id, scheduled.revision);
    expect(result.completed).toMatchObject({ id: scheduled.id, status: "completed" });
    expect(result.next).toMatchObject({
      status: "active",
      due: "2026-08-16",
      reminder: null,
      repeat: { frequency: "weekly", interval: 1 },
      favorite: true,
      tags: ["复盘"],
      attachments: [],
    });
    expect(result.next?.note.trim()).toBe("保留为下一实例模板");
    expect(result.next?.id).not.toBe(scheduled.id);
    const persisted = await repository.list();
    expect(persisted.filter(item => item.title === "每周回顾")).toHaveLength(2);
  });
  it("persists inline editor image ownership separately from visible attachments", async () => {
    const { repository } = await repo();
    const task = await repository.create("图片任务"),
      inline = {
        id: "inline-a",
        name: "paste.png",
        relativePath: ".attachments/x/paste.png",
        mime: "image/png",
        size: 12,
        createdAt: "2026-08-08T00:00:00Z",
        role: "inline" as const,
      };
    await repository.save(
      {
        ...task,
        attachments: [inline],
        note: "![图](.attachments/x/paste.png)",
      },
      task.revision,
    );
    expect((await repository.get(task.id)).attachments).toEqual([inline]);
  });
  it("reorders and reparents tasks without changing stable content", async () => {
    const { repository } = await repo();
    const a = await repository.create("A"),
      b = await repository.create("B"),
      child = await repository.create("子", a.projectId, a.id);
    await repository.place({
      taskId: b.id,
      sourceProjectId: b.projectId,
      targetProjectId: b.projectId,
      targetParentId: null,
      beforeId: a.id,
      expectedRevision: b.revision,
    });
    expect(
      (await repository.list())
        .filter((task) => !task.parentId)
        .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
        .map((task) => task.id),
    ).toEqual([b.id, a.id]);
    const nested = await repository.place({
      taskId: b.id,
      sourceProjectId: b.projectId,
      targetProjectId: b.projectId,
      targetParentId: a.id,
      expectedRevision: (await repository.get(b.id)).revision,
    });
    expect(nested).toMatchObject({ id: b.id, parentId: a.id });
    await expect(
      repository.place({
        taskId: a.id,
        sourceProjectId: a.projectId,
        targetProjectId: a.projectId,
        targetParentId: child.id,
        expectedRevision: (await repository.get(a.id)).revision,
      }),
    ).rejects.toThrow("后代");
  });
  it("moves a task subtree across projects while preserving ids and attachment references", async () => {
    const { root, repository } = await repo(),
      projects = new ProjectRepository(root);
    const source = (await projects.initialize())[0],
      target = await projects.create("目标", null),
      parent = await repository.create("整组", source.projectId),
      child = await repository.create("子项", source.projectId, parent.id),
      saved = await repository.save(
        {
          ...parent,
          attachments: [
            {
              id: "a",
              name: "a.txt",
              relativePath: `.attachments/${parent.id}/a.txt`,
              mime: "text/plain",
              size: 1,
              createdAt: "now",
            },
          ],
          reminder: "2026-08-09T09:00:00Z",
        },
        parent.revision,
      );
    await repository.place({
      taskId: parent.id,
      sourceProjectId: source.projectId,
      targetProjectId: target.projectId,
      targetParentId: null,
      expectedRevision: saved.revision,
    });
    const values = await repository.list(),
      moved = values.find((item) => item.id === parent.id)!,
      movedChild = values.find((item) => item.id === child.id)!;
    expect(moved).toMatchObject({
      projectId: target.projectId,
      id: parent.id,
      attachments: [{ relativePath: `.attachments/${parent.id}/a.txt` }],
      reminder: "2026-08-09T09:00:00Z",
    });
    expect(movedChild).toMatchObject({
      projectId: target.projectId,
      parentId: parent.id,
      id: child.id,
    });
    expect(
      (await readdir(join(root, target.relativePath))).filter((name) =>
        name.endsWith(".md"),
      ),
    ).toHaveLength(2);
  });
  it("voids and restores a task with revision-safe Markdown audit history",async()=>{
    const {root,repository}=await repo(),task=await repository.create('可作废任务'),result=await repository.void(task.id,task.revision,'仅当天有效');
    expect(result.voided).toMatchObject({status:'voided',voidReason:'仅当天有效'});expect(result.voided.voidedAt).toBeTruthy();expect(result.voided.statusHistory?.at(-1)).toMatchObject({status:'voided',reason:'仅当天有效'});
    await expect(repository.restoreVoided(task.id,task.revision)).rejects.toThrow('外部修改');
    const restarted=new TaskRepository(root),restored=await restarted.restoreVoided(task.id,result.voided.revision);expect(restored).toMatchObject({status:'active',voidedAt:null,voidReason:'仅当天有效'});expect(restored.statusHistory?.map(item=>item.status)).toEqual(['voided','active']);
  });
  it("voids one recurring occurrence and creates exactly one clean next occurrence",async()=>{
    const {repository}=await repo(),task=await repository.create('每日实例'),scheduled=await repository.save({...task,due:'2026-08-09',validOn:'2026-08-09',rollover:'forbidden',instanceKey:'daily:2026-08-09',seriesKey:'daily',repeat:{frequency:'daily',interval:1}},task.revision),first=await repository.void(scheduled.id,scheduled.revision,'跨日作废');
    expect(first.voided.status).toBe('voided');expect(first.next).toMatchObject({status:'active',due:'2026-08-10',validOn:'2026-08-10',instanceKey:'daily:2026-08-10',recurrenceSourceId:scheduled.id,voidedAt:null});
    const retry=await repository.void(scheduled.id,first.voided.revision,'重复调用');expect(retry.next?.id).toBe(first.next?.id);expect((await repository.list()).filter(item=>item.title==='每日实例')).toHaveLength(2);
    const restored=await repository.restoreVoided(scheduled.id,first.voided.revision),completed=await repository.complete(scheduled.id,restored.revision);expect(completed.next?.id).toBe(first.next?.id);expect((await repository.list()).filter(item=>item.title==='每日实例')).toHaveLength(2);
  });
  it("ensures instances idempotently and voids only expired forbidden active instances",async()=>{
    const {repository}=await repo(),defaultProject=(await repository.create('定位项目')).projectId,request={title:'幂等实例',projectId:defaultProject,instanceKey:'brief:2026-08-08',validOn:'2026-08-08',rollover:'forbidden' as const};
    const [first,second]=await Promise.all([repository.ensureInstance(request),repository.ensureInstance(request)]);expect(first.created).toBe(true);expect(second).toMatchObject({created:false,task:{id:first.task.id}});
    await repository.ensureInstance({...request,title:'允许顺延',instanceKey:'carry:2026-08-08',rollover:'allowed'});
    await repository.ensureInstance({...request,title:'今天实例',instanceKey:'brief:2026-08-09',validOn:'2026-08-09'});
    const voided=await repository.voidExpired('2026-08-09');expect(voided.map(item=>item.id)).toEqual([first.task.id]);expect((await repository.get(first.task.id)).status).toBe('voided');expect(await repository.voidExpired('2026-08-09')).toEqual([]);
  });
  it("writes a complete instance once and leaves no half-instance after an atomic failure",async()=>{
    const root=await mkdtemp(join(tmpdir(),'bear-todo-instance-fault-'));roots.push(root);const project=(await new ProjectRepository(root).initialize())[0],failure=new TaskRepository(root,{beforeAtomicRename:()=>{throw new Error('故障注入')}}),request={title:'故障恢复实例',projectId:project.projectId,instanceKey:'fault:2026-08-09',validOn:'2026-08-09',rollover:'forbidden' as const};
    await expect(failure.ensureInstance(request)).rejects.toThrow('故障注入');const afterFailure=await readdir(join(root,project.relativePath));expect(afterFailure.filter(name=>name.endsWith('.md')||name.includes('.tmp'))).toEqual([]);
    const retry=new TaskRepository(root),created=await retry.ensureInstance(request),again=await retry.ensureInstance(request);expect(created).toMatchObject({created:true,task:{revision:1,instanceKey:'fault:2026-08-09',validOn:'2026-08-09',rollover:'forbidden'}});expect(again).toMatchObject({created:false,task:{id:created.task.id}});expect((await retry.list()).filter(task=>task.instanceKey===request.instanceKey)).toHaveLength(1);
  });
});
