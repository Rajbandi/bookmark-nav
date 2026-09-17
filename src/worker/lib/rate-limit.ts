import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { rateLimits } from "../db/schema";

// Fixed-window rate limiting.
// One upsert resets expired windows or increments the count, avoiding races between reads and writes.
// Use Unix seconds consistently for window timestamps and CASE comparisons.
export async function consumeRateLimit(
	db: Db,
	key: string,
	limit: number,
	windowMs: number,
): Promise<{ ok: boolean; remaining: number }> {
	const nowSec = Math.floor(Date.now() / 1000);
	const cutoffSec = Math.floor((Date.now() - windowMs) / 1000);
	const [row] = await db
		.insert(rateLimits)
		.values({ key, count: 1, windowStart: new Date(nowSec * 1000) })
		.onConflictDoUpdate({
			target: rateLimits.key,
			set: {
				count: sql`CASE WHEN ${rateLimits.windowStart} < ${cutoffSec} THEN 1 ELSE ${rateLimits.count} + 1 END`,
				windowStart: sql`CASE WHEN ${rateLimits.windowStart} < ${cutoffSec} THEN ${nowSec} ELSE ${rateLimits.windowStart} END`,
			},
		})
		.returning({ count: rateLimits.count });
	const count = Number(row?.count ?? 1);
	return { ok: count <= limit, remaining: Math.max(0, limit - count) };
}

// Reset after success, such as sign-in, so past failures do not penalize legitimate users.
export async function clearRateLimit(db: Db, key: string): Promise<void> {
	await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

// Remove expired windows to prevent table growth from forged keys.
export async function pruneRateLimits(db: Db, windowMs: number): Promise<void> {
	await db
		.delete(rateLimits)
		.where(lt(rateLimits.windowStart, new Date(Date.now() - windowMs)));
}

// Cloudflare supplies CF-Connecting-IP and overrides spoofed values, making it suitable for rate limiting.
export function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
	return (
		c.req.header("CF-Connecting-IP") ??
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown"
	);
}
