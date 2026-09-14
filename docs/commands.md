# 命令速查

> 在仓库根目录 `bookmark-nav/` 下执行。插件的 WXT 构建产物输出到 `.output/`,WXT 缓存到 `.wxt/`。

## npm scripts(package.json)

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动本地开发服务(Vite + Workerd),http://localhost:5173,热重载前后端 |
| `npm run build` | 生产构建:`prepare-deploy-config` 注入构建变量 → tsc → vite build |
| `npm run check` | 完整校验:tsc + vite build + wrangler deploy --dry-run(部署前必跑) |
| `npm run lint` | ESLint 检查全部源码 |
| `npm run preview` | 构建后本地预览生产包 |
| `npm run deploy` | 应用 D1 迁移(remote)→ wrangler deploy(正式部署) |
| `npm run db:migrate` | 仅对远程 D1 应用迁移 |
| `npm run cf-typegen` | 重新生成 `worker-configuration.d.ts`(改了 wrangler.json 绑定后跑) |
| `npm run dev:ext` | 插件开发模式(WXT 热重载) |
| `npm run typecheck:ext` | 插件类型检查(tsconfig.ext.json),构建前必跑 |
| `npm run build:ext` | 构建插件 Chrome 版,输出 `.output/chrome-mv3` |
| `npm run build:ext:firefox` | 构建插件 Firefox 版,输出 `.output/firefox-mv2` |
| `npm run zip:ext` | 打包插件 zip(Chrome 版,发布用) |

## 本地开发初始化

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入任意 JWT_SECRET
npx wrangler d1 migrations apply DB --local
npm run dev                      # http://localhost:5173
```

## 数据库(Drizzle / D1)

| 命令 | 作用 |
| --- | --- |
| `npx drizzle-kit generate --name xxx` | 依据 schema.ts 生成新的迁移 SQL(drizzle/xxxx_xxx.sql) |
| `npx wrangler d1 migrations apply DB --local` | 应用迁移到本地 D1 |
| `npx wrangler d1 migrations apply DB --remote` | 应用迁移到远程 D1(等同 `npm run db:migrate`) |

> schema 在 `src/worker/db/schema.ts`,迁移在 `drizzle/`,journal 在 `drizzle/meta/_journal.json`。

## 其他常用

| 命令 | 作用 |
| --- | --- |
| `openssl rand -hex 32` | 生成 JWT_SECRET |
| `npx tsc -b` | 主应用类型检查 |
| `npx tsc -p tsconfig.ext.json --noEmit` | 等同 `npm run typecheck:ext` |

## 测试账号(仅本地开发)

| 项 | 值 |
| --- | --- |
| 后台地址 | http://localhost:5173/admin |
| 用户名 | `admin` |
| 密码 | `password` |
| 登录接口 | `POST /api/auth/login` |

> ⚠️ 仅限本地开发使用;正式部署后请在后台「安全」页修改。浏览器插件访问令牌同样在「安全」页生成/吊销。
