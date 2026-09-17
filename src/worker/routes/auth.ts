import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { setCookie, deleteCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../lib/password";
import { requireAuth } from "../middleware/auth";
import { AUTH_COOKIE, TOKEN_TTL_SECONDS, type AppEnv } from "../lib/types";
import {
	clearRateLimit,
	clientIp,
	consumeRateLimit,
	pruneRateLimits,
} from "../lib/rate-limit";

const credentialsSchema = z.object({
	username: z.string().min(1).max(50),
	password: z.string().min(6).max(100),
});

// Rate-limit by IP to prevent username rotation, and by IP plus username to protect individual accounts.
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_IP_LIMIT = 30;
const LOGIN_USER_LIMIT = 10;

// Administrator setup is public until initialization, so rate-limit it by IP.
// This limits scanners attempting to claim the account or brute-force weak passwords.
const SETUP_WINDOW_MS = 60 * 60_000;
const SETUP_IP_LIMIT = 10;

// Include tokenVersion in JWTs so softAuth invalidates old sessions after password changes.
async function issueToken(
	c: Context<AppEnv>,
	user: { id: number; username: string; tokenVersion?: number },
) {
	// Report a missing JWT_SECRET explicitly instead of returning a generic 500 error.
	if (!c.env.JWT_SECRET) {
		throw new HTTPException(500, {
			message:
				"JWT_SECRET is not configured. Add the JWT_SECRET secret under Worker → Settings → Variables and Secrets, then try again.",
		});
	}
	const token = await sign(
		{
			id: user.id,
			username: user.username,
			ver: user.tokenVersion ?? 0,
			exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
		},
		c.env.JWT_SECRET,
		"HS256",
	);
	setCookie(c, AUTH_COOKIE, token, {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: TOKEN_TTL_SECONDS,
	});
}

export const authRoutes = new Hono<AppEnv>()
	// Initialization status determines whether the frontend shows account setup or sign-in.
	.get("/status", async (c) => {
		const db = createDb(c.env.DB);
		const [first] = await db.select({ id: users.id }).from(users).limit(1);
		return c.json({
			initialized: !!first,
			authenticated: !!c.get("user"),
			user: c.get("user") ?? null,
		});
	})
	// Create the initial administrator only when no users exist.
	.post("/setup", zValidator("json", credentialsSchema), async (c) => {
		const db = createDb(c.env.DB);
		// Rate-limit the public setup endpoint before checking initialization to discourage scanners and brute-force attempts.
		const setupRl = await consumeRateLimit(
			db,
			`setup:${clientIp(c)}`,
			SETUP_IP_LIMIT,
			SETUP_WINDOW_MS,
		);
		if (!setupRl.ok) {
			await pruneRateLimits(db, SETUP_WINDOW_MS);
			return c.json({ error: "Too many attempts. Please try again later." }, 429);
		}
		const [exists] = await db.select({ id: users.id }).from(users).limit(1);
		if (exists) {
			return c.json({ error: "Already initialized" }, 403);
		}
		const { username, password } = c.req.valid("json");
		const [user] = await db
			.insert(users)
			.values({ username, passwordHash: await hashPassword(password) })
			.returning({
				id: users.id,
				username: users.username,
				tokenVersion: users.tokenVersion,
			});
		// Handle concurrent setup races by checking after insertion and rolling back extra accounts.
		const all = await db.select({ id: users.id }).from(users);
		if (all.length > 1) {
			await db.delete(users).where(eq(users.id, user.id));
			return c.json({ error: "Already initialized" }, 403);
		}
		await issueToken(c, user);
		return c.json({ user });
	})
	.post("/login", zValidator("json", credentialsSchema), async (c) => {
		const db = createDb(c.env.DB);
		const { username, password } = c.req.valid("json");
		const ip = clientIp(c);
		const ipKey = `login:${ip}`;
		const userKey = `login:${ip}:${username}`;
		const byIp = await consumeRateLimit(db, ipKey, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);
		if (!byIp.ok) {
			await pruneRateLimits(db, LOGIN_WINDOW_MS);
			return c.json({ error: "Too many attempts. Please try again in 15 minutes." }, 429);
		}
		const byUser = await consumeRateLimit(db, userKey, LOGIN_USER_LIMIT, LOGIN_WINDOW_MS);
		if (!byUser.ok) {
			return c.json({ error: "Too many attempts. Please try again in 15 minutes." }, 429);
		}
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.username, username))
			.limit(1);
		if (!user || !(await verifyPassword(password, user.passwordHash))) {
			return c.json({ error: "Incorrect username or password" }, 401);
		}
		// Reset the counter after sign-in so past failures do not accumulate for legitimate users.
		await Promise.all([clearRateLimit(db, ipKey), clearRateLimit(db, userKey)]);
		await issueToken(c, user);
		return c.json({ user: { id: user.id, username: user.username } });
	})
	// Change the signed-in user's password after verifying the current password.
	.post(
		"/change-password",
		requireAuth,
		zValidator(
			"json",
			z.object({
				oldPassword: z.string().min(1).max(100),
				newPassword: z.string().min(6).max(100),
			}),
		),
		async (c) => {
			const me = c.get("user")!;
			const db = createDb(c.env.DB);
			const { oldPassword, newPassword } = c.req.valid("json");
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.id, me.id))
				.limit(1);
			if (!user || !(await verifyPassword(oldPassword, user.passwordHash))) {
				return c.json({ error: "Incorrect current password" }, 400);
			}
			// Increment tokenVersion to invalidate all previously issued tokens immediately.
			// Also revoke the extension token because it grants administrator access.
			const [updated] = await db
				.update(users)
				.set({
					passwordHash: await hashPassword(newPassword),
					tokenVersion: sql`${users.tokenVersion} + 1`,
					apiTokenHash: null,
					apiTokenHint: null,
					apiTokenCreatedAt: null,
				})
				.where(eq(users.id, me.id))
				.returning({
					id: users.id,
					username: users.username,
					tokenVersion: users.tokenVersion,
				});
			// Reissue the current session so changing a password does not sign out the current user.
			await issueToken(c, updated);
			return c.json({ ok: true });
		},
	)
	// Change the signed-in user's username after verifying the current password.
	.post(
		"/change-username",
		requireAuth,
		zValidator(
			"json",
			z.object({
				username: z.string().min(1).max(50),
				password: z.string().min(1).max(100),
			}),
		),
		async (c) => {
			const me = c.get("user")!;
			const db = createDb(c.env.DB);
			const { username, password } = c.req.valid("json");
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.id, me.id))
				.limit(1);
			if (!user || !(await verifyPassword(password, user.passwordHash))) {
				return c.json({ error: "Incorrect password" }, 400);
			}
			if (username !== user.username) {
				const [taken] = await db
					.select({ id: users.id })
					.from(users)
					.where(eq(users.username, username))
					.limit(1);
				if (taken) {
					return c.json({ error: "Username is already in use" }, 400);
				}
			}
			const [updated] = await db
				.update(users)
				.set({ username })
				.where(eq(users.id, me.id))
				.returning({
					id: users.id,
					username: users.username,
					tokenVersion: users.tokenVersion,
				});
			// Reissue the JWT after changing the username stored in it.
			await issueToken(c, updated);
			return c.json({ user: { id: updated.id, username: updated.username } });
		},
	)
	.post("/logout", (c) => {
		deleteCookie(c, AUTH_COOKIE, { path: "/" });
		return c.json({ ok: true });
	});
