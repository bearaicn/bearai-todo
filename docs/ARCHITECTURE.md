# 架构

## 技术栈

Electron + Vue 3 + TypeScript + Vite。选择理由是 Windows 桌面集成成熟、渲染层生态稳定，并可把 Node 文件能力限制在主进程。渲染层仅通过 contextBridge 暴露的窄 IPC 调用数据服务。

## 边界

`domain` 定义工作目录、项目和任务模型；`infrastructure` 实现 JSON/Markdown 仓储、原子写入和未来文件监听；Electron 主进程组成服务并暴露 IPC；Vue 只持有视图状态。业务源为用户工作目录下的项目文件夹、Markdown、JSON 和附件。

MVP 完全不使用数据库。工作区全局配置和可重建统计位于 `.bearai-workspace.json`，项目配置位于各项目文件夹的 `.bearai-project.json`，本机窗口状态未来保存为 `%APPDATA%/BearAI ToDo/settings.json`。若未来出现 SQLite，只能作为可删除、可重建索引，不能成为权威数据源。

首期没有持久化业务索引。根配置中的数量统计由扫描任务 Markdown 重建，不参与具体业务判断。未来若增加搜索索引，必须标为可删除缓存，并提供从 Markdown 全量重建与一致性测试。

## 并发与恢复

每个任务带 UUID、整数 `revision`、ISO `updatedAt`。写入时调用方提交期望 revision，仓储重新读取磁盘并比较；不匹配则返回冲突，不覆盖。写入同目录临时文件，经 fsync 后 rename 原子替换；旧内容可进入 `.recovery/`。外部文件监听器未来把变更广播到 UI。

## Git 同步与网站协作

项目可选绑定 `remoteUrl + branch + provider`。绑定只允许出现在没有 Git 祖先/后代绑定的项目根；子项目继承仓库边界。Git 凭据不进入应用设置，统一委托系统 `git`、SSH agent、Git Credential Manager 或用户已有的 Git 配置。

`GitSyncAdapter` 分为：检测工作树 → 原子写入完成后聚合 add/commit → fetch → 在隔离临时 worktree 中 rebase/merge → 领域级 Markdown 冲突检查 → 成功后 push。非快进、删除/修改冲突、相同 UUID 双方 revision 分叉时进入用户处理队列，绝不后台强推。提交作者取本机身份或仓库 Git 配置。

未来网站采用无状态 Collaboration Gateway：用户通过 GitHub/Gitee/GitLab OAuth 或自建 GitLab OIDC 登录；服务校验仓库权限，读取 Markdown/评论文件并把新增评论、回复和任务更新提交到独立分支，再通过合并请求或受保护分支合入。服务端数据库只能保存会话、速率限制和可重建索引，任务及评论权威仍在 Git 仓库。

## 同步预留

未来 `SyncAdapter` 只交换带稳定 UUID/revision/updatedAt 的文档快照，不绕过仓储。冲突先保留双方副本，再由用户合并；云端不是本地 Markdown 的隐藏替代权威。
