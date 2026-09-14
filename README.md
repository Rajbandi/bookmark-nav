# Bookmark Nav

多功能简洁书签导航站。前台是干净的公开导航页,后台提供完整的书签管理能力,数据完全存放在你自己的 Cloudflare 账号里。另有浏览器插件,一键收藏 + AI 智能填充。

![Bookmark Nav 预览](./img/image.png)

## 文档

详细文档已拆分到 [`docs/`](./docs/) 目录:

- [项目说明与部署](./docs/project.md):功能特性、Fork 部署到 Cloudflare、更新版本、许可证
- [浏览器插件](./docs/extension.md):安装、配置、日常使用、AI 功能、插件开发
- [开发相关](./docs/development.md):技术栈、架构、目录结构、本地开发、代码规范
- [命令速查](./docs/commands.md):npm / wrangler / drizzle / wxt 全部常用命令
- [已知限制与建议](./docs/limitations.md):限制清单、遗留建议、后续规划

## 快速开始

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入任意 JWT_SECRET
npx wrangler d1 migrations apply DB --local
npm run dev                      # http://localhost:5173
```

## 许可证

[GPL-3.0](./LICENSE)

