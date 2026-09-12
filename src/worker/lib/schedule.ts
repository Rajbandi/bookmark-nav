// 自动任务的运行计划:由每小时整点触发的 cron 统一评估,到点的任务才执行。
// 计划以北京时间表达(频率 + 小时 [+ 星期/日期]),存 settings 表,后台可随时修改、立即生效,
// 无需重新部署(Cloudflare 的 cron 触发器是部署期静态配置,运行时改计划只能走调度器评估模式)。

export type TaskFreq = "daily" | "weekly" | "monthly";

export type TaskSchedule = {
	freq: TaskFreq;
	/** 北京时间 0-23 点(整点运行) */
	hour: number;
	/** weekly 用:0=周日 … 6=周六 */
	weekday: number;
	/** monthly 用:1-28 号(避开月末) */
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

// 宽松解析:字段缺失/非法时逐项回退到默认值,坏数据不会让定时任务崩溃
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

// 是否到点:以北京时间比较。每小时整点触发一次,因此同一计划每小时最多执行一次
export function isScheduleDue(schedule: TaskSchedule, now = new Date()): boolean {
	const bj = new Date(now.getTime() + 8 * 60 * 60_000);
	if (bj.getUTCHours() !== schedule.hour) return false;
	if (schedule.freq === "weekly") return bj.getUTCDay() === schedule.weekday;
	if (schedule.freq === "monthly") return bj.getUTCDate() === schedule.monthday;
	return true;
}
