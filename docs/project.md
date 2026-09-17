# Project and deployment

## Overview

A simple bookmark directory with a clean public page and full bookmark management in admin. All data is stored in your own Cloudflare account.

## Features

- **Public directory:** grouped categories, pinned bookmarks, click counts, live search with Cmd+K / Ctrl+K / `/`, and light, dark, or system theme preferences.
- **Browser extension:** save the current page with a prefilled title, duplicate warnings, privacy controls, tags, and categories. Save links from the context menu. When AI is configured, use AI autofill for titles, descriptions, tags, and categories. The extension authenticates with an access token generated on the admin Security page. Plaintext is shown once; the database stores only SHA-256. Changing the password revokes the token. See [extension.md](./extension.md).
- **Visual styles:** switch between classic cards and liquid glass with translucent surfaces and a gradient background.
- **Nested categories:** preserve imported folder nesting; manually create or move categories up to three levels. Drag to reorder and delete categories in bulk with cascading deletion.
- **Private bookmarks:** mark bookmarks or categories private. They are visible only when signed in; private category subtrees are hidden from visitors.
- **Import and export:** browser-compatible Netscape Bookmark HTML with nested folders, plus full JSON backups for this application.
- **Broken link checks:** scheduled checks mark broken links and restore recovered ones. Manual checks are also available in admin.
- **Automatic backups:** optionally save all data as JSON to your Cloudflare R2 bucket on a schedule, or trigger a backup manually.
- **Bulk actions:** move and delete bookmarks, and select multiple categories.
- **Tags:** attach multiple tags and include them in searches.
- **Icons:** use custom icons or an icon service, with a domain initial and stable background color as a fallback.
- **Custom footer:** render Markdown links, bold, and italic text through an allowlist.
- **Site name:** automatically updates the public header and browser tab title.
- **Responsive layout:** public and admin pages support small screens.

![Bookmark Nav preview](../img/image.png)

## Deployment

1. Fork this repository.
2. In the [Cloudflare dashboard](https://dash.cloudflare.com), open **Storage & databases → D1**, create a database such as `bookmark-nav-db`, and copy its database ID.
3. Open **Workers & Pages → Create → Import a repository** and select your fork. Set all of the following:
   - Build command: `npm run build`
   - Deploy command: `npm run deploy`
   - Build variable `D1_DATABASE_ID`: the database ID from step 2.
   - Build variable `JWT_SECRET`: a long random session-signing secret, for example from `openssl rand -hex 32`. Enable encryption for the variable.
   - Optional build variable `R2_BUCKET`: the name of a bucket you have created under **Storage & databases → R2**, such as `bookmark-nav-backup`. This enables R2 backup support. The default backup schedule is daily at 05:00 UTC+8; enable the task and adjust its schedule on the admin Scheduled tasks page. Omitting this variable leaves R2 backups unavailable without preventing deployment.
4. Open the Worker URL and create your administrator account when prompted.

`JWT_SECRET` is injected from build variables because GitHub-integrated deployments have been reported to clear manually configured dashboard secrets during `wrangler deploy`; see [cloudflare/workers-sdk#8871](https://github.com/cloudflare/workers-sdk/issues/8871). Build-time injection includes the secret in each deployment.

Deployment settings are injected automatically, so you do not need to edit the fork's configuration files. This keeps upstream updates straightforward.

## Updating

On your fork, choose **Sync fork → Update branch**. Cloudflare then rebuilds and deploys the updated branch.

The `db:migrate` script uses `bookmark-nav-db`, matching `database_name` in `wrangler.json`. If you change the database name, update the script too.

## Export formats

Use **Admin → Import / Export** to download either format:

| Format | Contents | Use |
| --- | --- | --- |
| Bookmark HTML | URLs, titles, nested folders, creation dates, and icons | Transfer bookmarks between browsers and compatible tools |
| JSON backup | Bookmarks, categories, tags, associations, privacy flags, link status, and settings | Restore this application or process its data with your own tools |

JSON is an open text format, but this backup schema is specific to Bookmark Nav. The application does not currently export a standalone SQLite database file.

## License

[GPL-3.0](../LICENSE)
