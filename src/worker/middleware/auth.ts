import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { users } from "../db/schema";
import { hashApiToken, isApiToken } from "../lib/token";
import { AUTH_COOKIE, type AppEnv, type JwtUser } from "../lib/types";

// Optional authentication: inject user for valid tokens; public routes filter visibility based on authentication.
export const softAuth = createMiddleware<AppEnv>(async (c, next) => {
	// Extensions use Bearer tokens because cross-origin fetch does not send SameSite=Lax cookies.
	// Use valid tokens directly; invalid or revoked tokens fall back to cookie authentication.
	const authz = c.req.header("Authorization") ?? "";
	const bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
	if (isApiToken(bearer)) {
		const db = createDb(c.env.DB);
		const user = await userFromApiToken(db, bearer);
		if (user) {
			c.set("user", user satisfies JwtUser);
			await next();
			return;
		}
		// Invalid token: continue to cookie authentication below.
	}

	const token = getCookie(c, AUTH_COOKIE);
	if (token) {
		try {
			const payload = await verify(token, c.env.JWT_SECRET, "HS256");
			if (typeof payload.id === "number" && typeof payload.username === "string") {
				// Check the token version so password changes invalidate old sessions immediately.
				const db = createDb(c.env.DB);
				const [user] = await db
					.select({
						id: users.id,
						username: users.username,
						tokenVersion: users.tokenVersion,
					})
					.from(users)
					.where(eq(users.id, payload.id))
					.limit(1);
				// Reject older tokens without a ver field.
				const ver = typeof payload.ver === "number" ? payload.ver : -1;
				if (user && user.tokenVersion === ver) {
					c.set("user", { id: user.id, username: user.username } satisfies JwtUser);
				}
			}
		} catch {
			// Treat invalid or expired tokens as unauthenticated without raising an error.
		}
	}
	await next();
});

// Required authentication for admin endpoints.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	if (!c.get("user")) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
});

// Look up users by token hash; password changes revoke these account-bound tokens directly.
export async function userFromApiToken(
	db: Db,
	raw: string,
): Promise<JwtUser | null> {
	const hash = await hashApiToken(raw);
	const [user] = await db
		.select({
			id: users.id,
			username: users.username,
			apiTokenHash: users.apiTokenHash,
		})
		.from(users)
		.where(eq(users.apiTokenHash, hash))
		.limit(1);
	if (!user || user.apiTokenHash !== hash) return null;
	return { id: user.id, username: user.username };
}
