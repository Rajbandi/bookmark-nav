// Evaluate task schedules at the start of each hour and run only tasks that are due.
// Store frequency and UTC+8 hour, plus weekday or monthday, in settings for immediate admin updates.
// No redeployment is needed: the static Cloudflare cron trigger delegates runtime scheduling to this evaluator.

export type TaskFreq = "daily" | "weekly" | "monthly";

export type TaskSchedule = {
	freq: TaskFreq;
	/** UTC+8 hour, 0-23 (runs at the start of the hour). */
	hour: number;
	/** Weekly: 0 = Sunday through 6 = Saturday. */
	weekday: number;
	/** Monthly: day 1-28 to avoid month-end differences. */
	monthday: number;
};

export const DEFAULT_DEADLINK_SCHEDULE: TaskSchedule = {
	freq: "daily",
	hour: 4,
	weekday: 1,
	monthday: 1,
};

export const DEFAULT_BACKUP_SCHEDULE: TaskSchedule = {
	freq: "daily",
	hour: 5,
	weekday: 1,
	monthday: 1,
};

// Fall back per field for missing or invalid schedule values so bad data cannot crash scheduled tasks.
export function parseSchedule(
	raw: string | null | undefined,
	fallback: TaskSchedule,
): TaskSchedule {
	try {
		const p = JSON.parse(raw ?? "") as Partial<TaskSchedule>;
		const freq: TaskFreq =
			p.freq === "weekly" || p.freq === "monthly" ? p.freq : "daily";
		const hour =
			typeof p.hour === "number" &&
			Number.isInteger(p.hour) &&
			p.hour >= 0 &&
			p.hour <= 23
				? p.hour
				: fallback.hour;
		const weekday =
			typeof p.weekday === "number" &&
			Number.isInteger(p.weekday) &&
			p.weekday >= 0 &&
			p.weekday <= 6
				? p.weekday
				: fallback.weekday;
		const monthday =
			typeof p.monthday === "number" &&
			Number.isInteger(p.monthday) &&
			p.monthday >= 1 &&
			p.monthday <= 28
				? p.monthday
				: fallback.monthday;
		return { freq, hour, weekday, monthday };
	} catch {
		return fallback;
	}
}

// Compare in UTC+8; the hourly cron trigger runs a given schedule at most once per hour.
export function isScheduleDue(schedule: TaskSchedule, now = new Date()): boolean {
	const bj = new Date(now.getTime() + 8 * 60 * 60_000);
	if (bj.getUTCHours() !== schedule.hour) return false;
	if (schedule.freq === "weekly") return bj.getUTCDay() === schedule.weekday;
	if (schedule.freq === "monthly") return bj.getUTCDate() === schedule.monthday;
	return true;
}
