# Development

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, TanStack Query, shadcn/ui, Tailwind CSS v4 |
| Backend | Hono with shared frontend/backend RPC types |
| Database | Cloudflare D1 (SQLite) and Drizzle ORM |
| Hosting | Cloudflare Workers serving static assets and the API |
| Browser extension | WXT and React, sharing frontend components and styles |

The backend uses standard Web APIs and SQLite. A self-hosted port would need replacements for D1 bindings, deployment configuration, and any Cloudflare-specific services it uses.

## Architecture

```text
src/
├── worker/            # Backend: one Worker for API and static assets
│   ├── index.ts       # Hono entry point, CORS, optional auth, scheduled handler
│   ├── middleware/    # Cookie JWT / Bearer token authentication
│   ├── routes/        # auth, public, and admin route groups
│   ├── lib/           # Tokens, passwords, AI, maintenance, backups, parsing, rate limits
│   └── db/            # D1 client and schema
├── react-app/         # Public home page and lazy-loaded /admin/* routes
└── extension/         # WXT browser extension
```

- **Two authentication channels:** the website uses an `HttpOnly`, `SameSite=Lax` JWT cookie. The extension uses `Authorization: Bearer bnav_…`. Both populate the same user context. Password changes increment `tokenVersion`, invalidating older JWTs, and revoke the extension token.
- **CORS:** only extension origins are allowed (`chrome-extension://`, `moz-extension://`, and `safari-web-extension://`). Credentials are disabled because the extension does not use cookies.
- **Public visibility:** anonymous users can see a category only if every ancestor is public. Click reporting returns `ok: true` even for inaccessible bookmarks to avoid exposing private records.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # Set JWT_SECRET for local sessions
npx wrangler d1 migrations apply DB --local
npm run dev                      # http://localhost:5173, frontend and backend reload
```

The local database lives in `.wrangler/state/v3/d1/`. After changing the schema:

1. Run `npx drizzle-kit generate --name xxx` to generate a migration.
2. Run `npx wrangler d1 migrations apply DB --local` to apply it locally.

Create a local administrator on the first visit. The original development account convention is documented in [commands.md](./commands.md). For extension development, see [extension.md](./extension.md#extension-development).

## Conventions and implementation notes

- **Comments:** explain why important decisions were made, not just what the code does.
- **Shared types:** the backend exports Hono `AppType`; the frontend uses `hc<AppType>` for end-to-end inference. The extension uses its own fetch wrapper because the site URL is configured at runtime.
- **Public settings:** `/api/public/site` returns only `PUBLIC_SETTING_KEYS`, excluding AI credentials and other private configuration.
- **D1 bindings:** batch large operations conservatively with `BATCH_SIZE = 90`. For large tag associations, load and map records in memory instead of constructing oversized `IN` lists; see `attachTags`.
- **MV3 lifecycle:** service workers may be stopped, so persistent state belongs in storage. WXT owns the `@` alias; `src/extension/lib/utils.ts` forwards shared UI imports.
- **Secrets:** keep secrets out of Git. `.dev.vars` is ignored. Deployment injects build variables as described in [project.md](./project.md).
- **Language:** application text, extension text, generated AI descriptions, and documentation use English. Existing user content is preserved. Schedules still use UTC+8.
