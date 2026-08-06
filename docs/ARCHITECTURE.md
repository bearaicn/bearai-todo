# 架构

## 技术栈

Electron + Vue 3 + TypeScript + Vite。选择理由是 Windows 桌面集成成熟、渲染层生态稳定，并可把 Node 文件能力限制在主进程。渲染层仅通过 contextBridge 暴露的窄 IPC 调用数据服务。

## 边界

`domain` 定义工作目录、项目和任务模型；`infrastructure` 实现 JSON/Markdown 仓储、原子写入和未来文件监听；Electron 主进程组成服务并暴露 IPC；Vue 只持有视图状态。业务源为用户工作目录下的项目文件夹、Markdown、JSON 和附件。

MVP 完全不使用数据库。工作区全局配置和可重建统计位于 `.bearai-workspace.json`，项目配置位于各项目文件夹的 `.bearai-project.json`，本机窗口状态未来保存为 `%APPDATA%/BearAI ToDo/settings.json`。若未来出现 SQLite，只能作为可删除、可重建索引，不能成为权威数据源。

首期没有持久化业务索引。根配置中的数量统计由扫描任务 Markdown 重建，不参与具体业务判断。未来若增加搜索索引，必须标为可删除缓存，并提供从 Markdown 全量重建与一致性测试。

## 并发与恢复

每个任务带 UUID、整数 `revision`、ISO `updatedAt`。写入时调用方提交期望 revision，仓储重新读取磁盘并比较；不匹配则返回冲突，不覆盖。写入同目录临时文件，经 fsync 后 rename 原子替换；旧内容可进入 `.recovery/`。外部文件监听器未来把变更广播到 UI。

## 同步预留

未来 `SyncAdapter` 只交换带稳定 UUID/revision/updatedAt 的文档快照，不绕过仓储。冲突先保留双方副本，再由用户合并；云端不是本地 Markdown 的隐藏替代权威。
