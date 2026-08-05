# Markdown 数据格式 v1

## 目录

```text
data/
  manifest.md
  lists/<list-uuid>.md
  groups/<group-uuid>.md
  tasks/<task-uuid>.md
  attachments/<task-uuid>/<attachment-uuid>-原文件名
  .recovery/
```

一任务一文件，降低外部编辑与未来同步的冲突面。所有 ID 为 UUID。日期时间使用 ISO 8601；纯日期使用 `YYYY-MM-DD`，按本地时区解释。

## 任务 v1

```markdown
---
schema: bearai.todo/task@1
id: 550e8400-e29b-41d4-a716-446655440000
revision: 1
title: 示例任务
listId: inbox
status: active
important: false
myDay: 2026-08-05
due: 2026-08-06
reminder: 2026-08-06T09:00:00+08:00
repeat: { frequency: weekly, interval: 1 }
tags: [工作]
steps: [{ id: 6ea..., title: 第一步, completed: false }]
attachments: []
createdAt: 2026-08-05T10:00:00+08:00
updatedAt: 2026-08-05T10:00:00+08:00
completedAt: null
---
这里是备注正文。未知 frontmatter 字段和正文必须保留。
```

`myDay` 记录加入日期；智能列表只匹配今天，因此每日自然重置，不修改或删除任务。重复任务在当前实例完成后创建新 UUID 的下一实例，并通过 `seriesId`/`previousId` 串联；不会偷偷把已完成文件改成未完成。

## 列表与列表组 v1

列表文件使用 `schema: bearai.todo/list@1`，包含 `id`、`revision`、`name`、可空 `groupId`、整数 `order`、`archived`、`createdAt` 和 `updatedAt`。列表组使用 `schema: bearai.todo/group@1`，包含相同的身份、排序与归档字段，以及 `collapsed`。

列表和组均保留未知 frontmatter 字段。`inbox` 是受保护的逻辑默认列表，不需要可被外部误删的元数据文件。删除操作在 v1 中实现为 `archived: true`，不物理删除文件；归档组不会级联归档成员列表，应用会把成员移出该组。未来恢复中心通过读取包含归档项的仓储视图实现恢复。

## 智能列表语义

- 我的⼀天：`status: active` 且 `myDay` 等于当前本地日期。
- 重要：活动任务且 `important: true`。
- 计划内：活动任务且具有 `due`。
- 全部：全部活动任务。
- 已完成：`status: completed`；恢复后重新进入活动视图。
- 任务：活动任务且 `listId: inbox`。

格式升级必须先备份、逐文件迁移且可重复运行。
