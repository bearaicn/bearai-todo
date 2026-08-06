# 工作目录与数据格式 v2

## 目录结构

```text
工作目录/
  .bearai-workspace.json
  任务/
    .bearai-project.json
    第一件事--550e8400.md
  工作/
    .bearai-project.json
    BearAI/
      .bearai-project.json
      发布版本--6ba7b810.md
  .attachments/<task-uuid>/
  .archive/projects/<project-uuid>/
  .recovery/
```

工作目录是全部业务数据的边界，不使用数据库。`.bearai-workspace.json` 使用 `bearai.todo/workspace@1`，保存稳定 `workspaceId`、revision、名称和可从任务 Markdown 重建的统计。统计不是业务权威。

## 项目与子项目

项目是带 `.bearai-project.json` 的真实文件夹；子项目是嵌套项目文件夹，不是另一种实体。项目配置使用 `bearai.todo/project@1`，包含稳定 `projectId`、revision、name、parentId、order、archived 和时间。目录位置表示当前结构，ID 表示身份。

项目右键支持新增子项目、重命名和归档。归档把整个目录原子移动到 `.archive/projects/<projectId>`，不物理删除。项目或子项目改名不改变 ID。

## 任务与子任务

任务使用一任务一 Markdown 文件，文件名为 `<可读标题>--<UUID前8位>.md`，frontmatter 使用 `bearai.todo/task@2`：

```markdown
---
schema: bearai.todo/task@2
id: 550e8400-e29b-41d4-a716-446655440000
revision: 1
title: 示例任务
projectId: 51e58eb6-082a-46dc-80e4-65fb32c49a52
parentId: null
status: active
favorite: false
due: null
reminder: null
repeat: null
tags: []
attachments: []
createdAt: 2026-08-06T10:00:00+08:00
updatedAt: 2026-08-06T10:00:00+08:00
completedAt: null
---
备注正文。
```

项目归属以文件所在目录为最终依据；`projectId` 用于冲突检测和外部移动后的重建校验。子任务也是独立 Markdown，通过 `parentId` 指向父任务。旧 task@1 的 `listId`、`important`、`myDay` 和 `steps` 只用于迁移：`important` 映射为 `favorite`，旧 steps 转为独立子任务文件，未知字段和正文必须保留。

## 智能视图

- 今日待办：全部未完成顶层任务。
- 收藏：`favorite: true` 的未完成顶层任务。
- 计划内：具有截止日期的未完成顶层任务。
- 已完成：全部已完成顶层任务，可恢复。
