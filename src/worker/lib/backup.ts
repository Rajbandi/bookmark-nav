import { asc } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookmarkTags, bookmarks, categories, settings, tags } from "../db/schema";

// Full data snapshot for daily R2 backups.
export async function buildBackupPayload(db: Db): Promise<string> {
	const [cats, bms, tagRows, links, settingRows] = await Promise.all([
		db.select().from(categories).orderBy(asc(categories.sort), asc(categories.id)),
		db.select().from(bookmarks).orderBy(asc(bookmarks.sort), asc(bookmarks.id)),
		db.select().from(tags),
		db.select().from(bookmarkTags),
		db.select().from(settings),
	]);
	return JSON.stringify(
		{
			exportedAt: new Date().toISOString(),
			app: "bookmark-nav",
			categories: cats,
			bookmarks: bms,
			tags: tagRows,
			bookmarkTags: links,
			// Export settings as a key/value object, matching the restore endpoint.
			settings: Object.fromEntries(settingRows.map((r) => [r.key, r.value])),
		},
		null,
		2,
	);
}

// Write the snapshot to R2 (backups/date.json); return null when no bucket is bound.
export async function backupToR2(env: Env, db: Db): Promise<string | null> {
	if (!env.BACKUP) return null;
	const payload = await buildBackupPayload(db);
	const date = new Date().toISOString().slice(0, 10);
	const key = `backups/${date}.json`;
	await env.BACKUP.put(key, payload, {
		httpMetadata: { contentType: "application/json; charset=utf-8" },
	});
	// Record the latest backup time for the admin interface.
	await db
		.insert(settings)
		.values({ key: "backup.lastRun", value: new Date().toISOString() })
		.onConflictDoUpdate({ target: settings.key, set: { value: new Date().toISOString() } });
	return key;
}
