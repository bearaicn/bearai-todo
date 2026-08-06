# 熊智ToDo

Windows 优先、本地优先的 Markdown 待办应用。任务、列表、步骤、备注、日期、重复、标签及完成历史只以用户数据目录中的 Markdown/附件为权威来源；应用设置与业务数据严格分离。

## 当前状态

MVP 持续开发中：已建立根工作目录、项目/子项目文件夹、task@2 Markdown 仓储、原子写入与 revision 冲突保护，以及今日待办、收藏、计划内、已完成和三栏 Electron 界面。项目配置使用 JSON，任务与子任务使用独立 Markdown；MVP 不使用数据库。详见 [实施进度](docs/IMPLEMENTATION.md)。

```powershell
npm install
npm test
npm run build
npm run dev
```

`npm run dev` 启动 Vite 开发服务器和 Electron；`npm start` 直接打开最近一次生产构建。`npm run smoke:electron` 用隔离的 `BEARAI_TODO_DATA_DIR` 验证 preload、IPC、项目/子项目、任务/子任务和关键 UI 交互，不能指向正式数据目录。

左侧“设置”可查看和修改工作目录。切换时应用只接受空目标目录，先完整复制并校验项目与任务数量，再写入 `%APPDATA%/BearAI ToDo/settings.json` 并切换；原目录保留为恢复备份。默认项目是工作目录下真实的 `默认项目/` 文件夹及 `.bearai-project.json`。

开发模式默认使用 `%APPDATA%/BearAI ToDo/data`；可通过 `BEARAI_TODO_DATA_DIR` 指向测试目录。项目不配置远程，也不会自动上传数据。
