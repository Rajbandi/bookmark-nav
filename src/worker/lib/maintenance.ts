import { inArray } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { bookmarks, settings } from "../db/schema";
import { checkUrl } from "./check-url";
import { backupToR2 } from "./backup";
import {
	DEFAULT_BACKUP_SCHEDULE,
	DEFAULT_DEADLINK_SCHEDULE,
	isScheduleDue,
	parseSchedule,
} from "./schedule";

// Worker cron CPU time is limited, while external requests mostly wait for I/O.
// Use a fixed concurrency pool to limit peak connections rather than launching all requests at once.
const CHECK_CONCURRENCY = 8;
// Use batches of 90 to stay below the D1 SQL binding limit.
const BATCH_SIZE = 90;

export type LinkCheckResult = {
	total: number;
	dead: number;
	revived: number;
};

// Check all bookmarks concurrently, update only changed statuses, and record the latest result.
export async function checkAllLinks(db: Db): Promise<LinkCheckResult> {
	const rows = await db
		.select({
			id: bookmarks.id,
			url: bookmarks.url,
			status: bookmarks.status,
		})
		.from(bookmarks);

	const dead: number[] = []; // Update only newly broken links to avoid redundant writes.
	const revived: number[] = [];
	let totalDead = 0; // Total broken links after the run, including previously broken links, for the admin display.
	let cursor = 0;
	async function worker() {
		while (cursor < rows.length) {
			const row = rows[cursor++];
			const alive = await checkUrl(row.url);
			if (!alive) {
				totalDead++;
				if (row.status !== "dead") dead.push(row.id);
			} else if (row.status !== "active") {
				revived.push(row.id);
			}
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(CHECK_CONCURRENCY, rows.length || 1) }, worker),
	);

	for (let i = 0; i < dead.length; i += BATCH_SIZE) {
		await db
			.update(bookmarks)
			.set({ status: "dead" })
			.where(inArray(bookmarks.id, dead.slice(i, i + BATCH_SIZE)));
	}
	for (let i = 0; i < revived.length; i += BATCH_SIZE) {
		await db
			.update(bookmarks)
			.set({ status: "active" })
			.where(inArray(bookmarks.id, revived.slice(i, i + BATCH_SIZE)));
	}

	const result: LinkCheckResult = {
		total: rows.length,
		dead: totalDead,
		revived: revived.length,
	};
	await Promise.all([
		writeSetting(db, "deadLink.lastRun", new Date().toISOString()),
		writeSetting(db, "deadLink.dead", String(result.dead)),
	]);
	return result;
}

async function writeSetting(db: Db, key: string, value: string) {
	await db
		.insert(settings)
		.values({ key, value })
		.onConflictDoUpdate({ target: settings.key, set: { value } });
}

async function readSettingsMap(db: Db): Promise<Map<string, string>> {
	const rows = await db
		.select({ key: settings.key, value: settings.value })
		.from(settings);
	return new Map(rows.map((r) => [r.key, r.value]));
}

// Hourly cron entry point: evaluate each task against its configured enable switch and schedule.
// Treat missing switches as enabled; only an explicit 0 disables them. Manual runs bypass this scheduler.
export async function runScheduledTasks(
	env: Env,
): Promise<{ checked: boolean; backed: boolean }> {
	const db = createDb(env.DB);
	const map = await readSettingsMap(db);
	const enabled = (key: string) => map.get(key) === "1";
	const result = { checked: false, backed: false };

	if (
		enabled("maintenance.checkLinks") &&
		isScheduleDue(
			parseSchedule(map.get("deadLink.schedule"), DEFAULT_DEADLINK_SCHEDULE),
		)
	) {
		try {
			await checkAllLinks(db);
			result.checked = true;
		} catch (err) {
			console.error("[maintenance] Link check failed:", err);
		}
	}
	if (
		enabled("maintenance.backup") &&
		isScheduleDue(parseSchedule(map.get("backup.schedule"), DEFAULT_BACKUP_SCHEDULE))
	) {
		try {
			await backupToR2(env, db);
			result.backed = true;
		} catch (err) {
			// Backup failures do not affect link check results; this path is skipped when R2 is not configured.
			console.error("[maintenance] R2 backup failed:", err);
		}
	}
	return result;
}
