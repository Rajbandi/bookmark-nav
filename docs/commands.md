# Command reference

Run commands from the repository root. WXT writes extension builds to `.output/` and its cache to `.wxt/`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite and Workerd at http://localhost:5173 with frontend/backend reload |
| `npm run build` | Inject deployment variables, run TypeScript, and build with Vite |
| `npm run check` | Run TypeScript, Vite build, and a Wrangler deployment dry run |
| `npm run lint` | Run ESLint across the source |
| `npm run preview` | Build and preview production output locally |
| `npm run deploy` | Apply remote D1 migrations, then deploy the Worker |
| `npm run db:migrate` | Apply remote D1 migrations only |
| `npm run cf-typegen` | Regenerate worker-configuration.d.ts after changing Wrangler bindings |
| `npm run dev:ext` | Start extension development with WXT reload |
| `npm run typecheck:ext` | Prepare WXT and type-check the extension before building |
| `npm run build:ext` | Build Chrome output in .output/chrome-mv3 |
| `npm run build:ext:firefox` | Build Firefox output in .output/firefox-mv2 |
| `npm run zip:ext` | Package the Chrome extension as ZIP |
| `npx wxt zip` | Create .output/bookmark-nav-VERSION-chrome.zip |
| `npx wxt -b firefox zip` | Create Firefox installation and source ZIP archives |
| `npx wxt submit init` | Configure store credentials interactively in .env.submit |
| `npx wxt submit` | Submit prepared archives to stores for review or publishing |
| `npx wxt submit --dry-run …` | Validate credentials and archives without submitting |
| `npm version patch --no-git-tag-version` | Increment the version before tagging a release |

See [publishing.md](./publishing.md) for the packaging and store workflow, including [CI/CD builds](./publishing.md#cicd-builds).

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars   # Set a random JWT_SECRET
npx wrangler d1 migrations apply DB --local
npm run dev
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if execution policy blocks the `.ps1` launchers. Copy the environment template with `Copy-Item .dev.vars.example .dev.vars`.

## Database: Drizzle and D1

| Command | Purpose |
| --- | --- |
| `npx drizzle-kit generate --name xxx` | Generate migration SQL from schema.ts |
| `npx wrangler d1 migrations apply DB --local` | Apply migrations to local D1 |
| `npx wrangler d1 migrations apply DB --remote` | Apply migrations to remote D1 |

The schema is in `src/worker/db/schema.ts`, migrations in `drizzle/`, and the journal in `drizzle/meta/_journal.json`.

## Other useful commands

| Command | Purpose |
| --- | --- |
| `openssl rand -hex 32` | Generate a session-signing secret |
| `npx tsc -b` | Type-check the main application |
| `npx tsc -p tsconfig.ext.json --noEmit` | Type-check the extension after WXT preparation |

## Local development account

The documented development account convention is `admin` / `password`; it is not automatically created by migrations. On a fresh database, create an administrator through the initial setup page.

| Item | Value |
| --- | --- |
| Admin page | http://localhost:5173/admin |
| Development username | `admin` |
| Development password | `password` |
| Sign-in endpoint | `POST /api/auth/login` |

Use these example credentials only locally. Set a unique password for a deployed instance. Generate or revoke the browser extension token on the admin Security page.
