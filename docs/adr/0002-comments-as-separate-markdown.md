---
status: accepted
---

# 评论使用独立 Markdown 文件

评论不嵌入任务 frontmatter，而保存为 `.comments/<taskId>/<commentId>.md`，通过稳定 `authorId` 和可空 `parentCommentId` 表达作者与回复关系。这样不同用户发表评论通常创建不同文件，Git 合并冲突显著少于共同修改任务文件；网站协作层也只能通过仓库提交写回这些 Markdown，不能建立第二业务数据库权威源。
