# ADR-0002：高级任务使用 Milkdown/Crepe

## 决定

高级任务采用 Milkdown 官方 Crepe 编辑器。Crepe 基于 ProseMirror/Remark，但持久化接口只监听并输出 Markdown；ProseMirror state、HTML 和 JSON 均不写入磁盘。AI 与 LaTeX 功能关闭，不启用遥测或 usage statistics。

Milkdown 对 Vue 3 有官方支持；Crepe 提供标题、粗体、斜体、删除线、列表、任务列表、引用、代码、代码块、链接、表格、撤销/重做和所见即所得交互。相比自制 textarea，它能提供成熟的 Markdown-first 行为；相比以 HTML/JSON 为主数据的编辑器，不会引入第二正文权威源。

## 图片与安全资源

上传图片由主进程复制到 `.attachments/<taskId>/` 并追加 attachment 元数据。编辑期间使用受限 `bearai-asset://attachment/<attachmentId>`；协议处理器只能按 Markdown 仓储中已登记的附件 ID 解析，并再次执行附件根目录边界校验。进入自动保存队列前，运行时 URL 转回 `.attachments/...` 相对路径；重新打开时反向映射。因此磁盘正文禁止 base64、blob URL、绝对路径和应用协议 URL。

从 HTML/Office 粘贴时由 ProseMirror/Remark 转换可识别结构；无法可靠转换的复杂样式降级为文本和基础 Markdown。删除正文图片只删除引用，不自动删除附件实体，避免不可恢复的数据丢失；实体继续显示在附件区，由用户明确移除。

## 代价

Milkdown 显著增加渲染包体，当前主 chunk 约 1.54 MB（gzip 约 486 KB），后续应动态加载。图片粘贴、网页/Office 图文转换仍需扩大真实样本矩阵。
