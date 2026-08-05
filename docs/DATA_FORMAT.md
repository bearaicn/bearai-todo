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

列表和组同样使用 `schema`、UUID、revision、名称、排序和归档字段。`inbox` 是受保护的逻辑默认列表。格式升级必须先备份、逐文件迁移且可重复运行。

