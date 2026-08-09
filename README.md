# 熊智ToDo

高级任务使用 Milkdown/Crepe 提供 Markdown-first 所见即所得编辑；任务正文、项目和附件归属仍以工作目录中的 Markdown/JSON 与附件文件为唯一权威。应用不使用业务数据库。

Windows 优先、本地优先的 Markdown 待办应用。任务、列表、步骤、备注、日期、重复、标签及完成历史只以用户数据目录中的 Markdown/附件为权威来源；应用设置与业务数据严格分离。

## 当前状态

MVP 持续开发中：已建立根工作目录、项目/子项目文件夹、task@2 Markdown 仓储、原子写入与 revision 冲突保护，以及今日待办、收藏、计划内、已完成和三栏 Electron 界面。项目配置使用 JSON，任务与子任务使用独立 Markdown；MVP 不使用数据库。详见 [实施进度](docs/IMPLEMENTATION.md)。

“今日待办”按本地日历日列出已超时及未来可配置天数（默认 3 天）内截止的未完成任务，不再等同于全部未完成任务。全局 `workspaces.json` 只登记本机用户和工作区目录；主题、截止窗口、自定义主题及受管背景资源保存在各工作区中，不进入任务 Markdown。

```powershell
npm install
npm test
npm run build
npm run dist:win
npm run dev
```

`npm run dev` 启动 Vite 开发服务器和 Electron；`npm start` 直接打开最近一次生产构建。`npm run smoke:electron` 用隔离的 `BEARAI_TODO_DATA_DIR` 验证 preload、IPC、项目/子项目、任务/子任务和关键 UI 交互，不能指向正式数据目录。

`npm run dist:win` 生成 x64 NSIS 安装包。安装器默认创建桌面和开始菜单快捷方式；卸载只移除程序与快捷方式，不删除 Electron 用户设置、工作区注册表或任何工作区任务数据。

侧边栏底部的本地用户头像菜单可打开设置。切换工作目录时应用只接受空目标目录，先完整复制并校验项目与任务数量及根配置，再删除旧工作目录、写入 `%APPDATA%/BearAI ToDo/settings.json` 并切换；不会保留旧目录副本。默认项目是工作目录下真实的 `默认项目/` 文件夹及 `.bearai-project.json`。

开发模式默认使用 `%APPDATA%/BearAI ToDo/data`；可通过 `BEARAI_TODO_DATA_DIR` 指向测试目录。项目不配置远程，也不会自动上传数据。

## 项目与任务拖拽

项目树拖拽只改变同父项目顺序；改变子项目父级使用右键“移动到”并确认。任务卡片的上边缘、中央和下边缘分别表示前插、成为子任务和后插，也可拖到根任务末尾区域。拖到左侧其他项目后必须确认，任务后代和附件归属整体保留。搜索或过滤状态禁用任务重排，以保护未显示任务的顺序。

## 许可证

本项目代码采用 [GNU General Public License Version 3，GPL-3.0-only](LICENSE) 授权。BearAI 名称、Logo 和其他品牌标识不因软件代码许可证而当然获得授权；用户在本地工作目录中创建的任务、附件及其他数据也不属于本项目代码许可证的授权范围。
熊智ToDo 支持多个相互隔离的本地工作区。侧边栏底部可切换或管理工作区；每个工作区独立保存项目文件夹、任务 Markdown、附件、主题资源和界面偏好。Electron 运行目录只保存本机用户与工作区目录注册表，不保存任务业务副本。
