# 熊智ToDo

Windows 优先、本地优先的 Markdown 待办应用。任务、列表、步骤、备注、日期、重复、标签及完成历史只以用户数据目录中的 Markdown/附件为权威来源；应用设置与业务数据严格分离。

## 当前状态

MVP 持续开发中：已建立 v1 数据格式、任务/列表/列表组 Markdown 仓储、原子写入与 revision 冲突保护、六类智能列表、搜索、步骤和三栏 Electron 界面。新增、读取、完成/恢复、重要、我的一天、标题、备注及步骤已形成真实持久化闭环。详见 [实施进度](docs/IMPLEMENTATION.md)。

```powershell
npm install
npm test
npm run build
npm run dev
```

开发模式默认使用 `%APPDATA%/BearAI ToDo/data`；可通过 `BEARAI_TODO_DATA_DIR` 指向测试目录。项目不配置远程，也不会自动上传数据。
