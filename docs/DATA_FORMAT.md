# 工作目录与数据格式 v2

## 目录结构

```text
工作目录/
  .bearai-workspace.json
  默认项目/
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

项目是带 `.bearai-project.json` 的真实文件夹；子项目是嵌套项目文件夹，不是另一种实体。项目配置使用 `bearai.todo/project@1`，包含稳定 `projectId`、revision、name、parentId、order、archived、icon、description、sidebarColor、theme、collapsed、`settingsMode`、`viewSettings` 和时间。目录位置表示当前结构，ID 表示身份；移动项目会移动整个文件夹并保持 ID。

`settingsMode` 为 `inherit` 或 `own`。`inherit` 从最近的自行维护祖先项目继承，没有祖先覆盖时使用本机设置中的全项目默认值；`own` 表示该项目自行维护完整视图设置。`viewSettings` 包含排序方式、主题、任务展开策略、默认展开层级、是否显示直接子项目目录，以及“记住上次展开情况”所需的已展开任务 UUID。子项目选择“重设为继承”会清空覆盖，顶级项目选择“重设为全局默认”也恢复继承。任务 UUID 只是界面展开状态引用，不构成任务业务副本。

项目右键支持新增子项目、重命名、属性和归档；项目树下方空白区域右键可新增顶级项目。属性中的图标、描述、侧边栏颜色与主题均写入项目配置。归档前统计项目及全部子项目中的未完成任务；存在未完成项时必须明确二次确认。归档把整个目录原子移动到 `.archive/projects/<projectId>`，不物理删除。归档项目及其中任务可从账号菜单的归档视图只读查看。项目或子项目改名不改变 ID。

`默认项目/` 是初始化时自动创建的真实项目文件夹，并包含正常的 `.bearai-project.json`，不是虚拟视图。旧工作区中的一级 `任务/` 项目会在启动时保留 projectId 和全部内容并安全改名为 `默认项目/`。

## 本机设置与切换工作目录

当前电脑的工作目录路径、侧边栏宽度、全局主题、自定义配色、自定义背景图片路径和全项目视图默认值保存在 `%APPDATA%/BearAI ToDo/settings.json`，不包含任务业务副本。内置主题含纯色与随应用打包的本地图片预设；自定义背景引用用户选择的本地图片。修改工作目录只允许选择空目标目录，并执行：复制全部内容、统计项目/任务数量、校验根配置存在、删除原工作目录、写入本机设置、切换仓储。迁移成功后不保留旧目录副本；任一步校验失败则不删除旧目录。新旧目录不得互相嵌套。

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
kind: simple
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

`kind` 为 `simple` 或 `advanced`，缺省按 `simple` 兼容。两种类型的备注都仍是 Markdown 正文：简单任务显示普通文本框，高级任务显示 Markdown 工具栏、源码和预览，不引入另一份富文本数据。`due`、`reminder` 使用带时区含义的 ISO 8601 时间；`repeat` v1 使用 `{ frequency: daily|weekly|monthly|yearly, interval: 1 }`。应用启动和任务保存时会为未来 24.8 天内的 reminder 安排 Windows 本地通知，完成任务会取消其调度。

附件复制到 `.attachments/<task-uuid>/<attachment-id-prefix>--<原文件名>`。任务 frontmatter 中的 `attachments` 只保存稳定附件 ID、原文件名、相对路径、MIME、字节数和创建时间。主进程必须验证解析后的路径仍在工作目录 `.attachments` 内；渲染层不能读取任意本地路径。当前内置预览支持图片、音频、视频、PDF、文本、Markdown、JSON 和 CSV；其他格式或超过 25 MB 的文件显示不支持提示，但所有预览弹窗都提供“下载文件”（另存为）操作。

## 智能视图

- 今日待办：全部未完成顶层任务。
- 收藏：`favorite: true` 的未完成顶层任务。
- 计划内：具有截止日期的未完成顶层任务。
- 已完成：全部已完成顶层任务，可恢复。
