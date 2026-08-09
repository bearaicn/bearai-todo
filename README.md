# 熊智ToDo

高级任务使用 Milkdown/Crepe 提供 Markdown-first 所见即所得编辑；任务正文、项目和附件归属仍以工作目录中的 Markdown/JSON 与附件文件为唯一权威。应用不使用业务数据库。

Windows 优先、本地优先的 Markdown 待办应用。任务、列表、步骤、备注、日期、重复、标签及完成历史只以用户数据目录中的 Markdown/附件为权威来源；应用设置与业务数据严格分离。

## 当前状态

MVP 持续开发中：已建立根工作目录、项目/子项目文件夹、task@2 Markdown 仓储、原子写入与 revision 冲突保护，以及今日待办、收藏、计划内、已完成、可恢复的已作废分组和三栏 Electron 界面。项目配置使用 JSON，任务与子任务使用独立 Markdown；MVP 不使用数据库。详见 [实施进度](docs/IMPLEMENTATION.md)。

“作废”用于保留那些不再执行但不能伪装为完成的任务历史。显式标记为不可顺延的任务实例可由外部自动化按本地日历日幂等补齐和跨日作废；应用不会根据标题或类别自动创建晨练、学习或每日简报建议任务。

无界面自动化必须先执行 `npm run build:cli`，然后把一条 plain JSON 请求写入 `node dist-cli/cli/taskAutomation.js` 的 stdin。请求必须显式提供绝对 `workspacePath`；支持 `capabilities`、`find-instance`、`ensure-instance` 和 `void-expired`。CLI 的 stdout 只输出一条协议 JSON，诊断信息不混入 stdout；退出码 `0/1/2/3` 分别表示成功、运行错误、请求错误和可重试的工作区锁超时。每日简报等调用方仍负责业务判断，禁止直接拼接任务 frontmatter。完整协议见 [数据格式](docs/DATA_FORMAT.md)。

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

项目树拖拽时，目标行上/下边缘表示同父级前插/后插，中央表示把子项目连同完整子树移动为目标项目的子项目；拖入自身、后代或其他非法目标会显示禁止状态且不写盘。右键“移动到”仍作为无需拖拽的替代入口。任务卡片的上边缘、中央和下边缘分别表示前插、成为子任务和后插，也可拖到根任务末尾区域。拖到左侧其他项目后必须确认，任务后代和附件归属整体保留。搜索或过滤状态禁用任务重排，以保护未显示任务的顺序。

高级任务编辑器的固定工具栏和选区浮动工具栏均直接调用 Milkdown/ProseMirror 命令；可从系统剪贴板粘贴纯文本、网页格式和图片，也可通过可见的“图片”按钮选择上传。图片先复制到工作区受管附件目录，再在 Markdown 中写入相对引用；应用重启后仍通过受边界校验的安全协议显示。任务列表栏依据自身容器宽度响应：空间不足时标题信息与查询/统计/更多操作自动分成上下两行，恢复宽度后回到单行。

## 许可证

本项目代码采用 [GNU General Public License Version 3，GPL-3.0-only](LICENSE) 授权。BearAI 名称、Logo 和其他品牌标识不因软件代码许可证而当然获得授权；用户在本地工作目录中创建的任务、附件及其他数据也不属于本项目代码许可证的授权范围。
熊智ToDo 支持多个相互隔离的本地工作区。侧边栏底部可切换或管理工作区；每个工作区独立保存项目文件夹、任务 Markdown、附件、主题资源和界面偏好。Electron 运行目录只保存本机用户与工作区目录注册表，不保存任务业务副本。
