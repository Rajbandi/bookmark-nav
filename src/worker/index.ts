import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import type { AppEnv } from "./lib/types";
import { softAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { runScheduledTasks } from "./lib/maintenance";

const app = new Hono<AppEnv>()
	// Allow CORS only for browser extensions; background requests do not carry cookies.
	// Authentication uses Bearer tokens, which ordinary websites do not possess.
	// Keep credentials false to avoid mixing cookie authentication and introducing CSRF exposure.
	.use(
		"/api/*",
		cors({
			origin: (origin) =>
				/^(chrome|moz|safari-web)-extension:\/\/[a-z0-9-]+$/i.test(origin)
					? origin
					: null,
			allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowHeaders: ["Authorization", "Content-Type"],
			// Disable credentials explicitly: the extension uses Bearer tokens, avoiding cookie-based CSRF exposure.
			credentials: false,
			maxAge: 86_400,
		}),
	)
	// Parse JWT cookies or Bearer tokens globally so public routes can filter private content.
	.use("/api/*", softAuth)
	// Disable shared caching for authentication-dependent responses to protect private bookmarks.
	.use("/api/*", async (c, next) => {
		await next();
		c.header("Cache-Control", "private, no-store");
	})
	.route("/api/auth", authRoutes)
	.route("/api/public", publicRoutes)
	.route("/api/admin", adminRoutes);

// Return JSON for API errors so the frontend can show a specific message rather than a generic network error.
app.onError((err, c) => {
	const status = err instanceof HTTPException ? err.status : 500;
	console.error(`[api] ${c.req.method} ${c.req.path}:`, err);
	// HTTPException messages are controlled application messages and can be returned safely.
	// Other exceptions may reveal SQL or internal details, so return a generic message.
	const message =
		err instanceof HTTPException ? err.message : "Internal Server Error";
	return c.json({ error: message }, status);
});

// Fall back to static assets for non-API routes; SPA fallback serves index.html for direct navigation and refresh.
app.notFound((c) => {
	if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found" }, 404);
	return c.env.ASSETS.fetch(c.req.raw);
});

// Type used by the frontend Hono RPC client.
export type AppType = typeof app;

// The cron trigger in wrangler.json invokes the scheduler at the start of each hour.
// Run link checks and backups according to the switches and UTC+8 schedules configured in admin.
// Schedule changes take effect immediately without redeployment.
export default {
	fetch: app.fetch,
	scheduled: (event: ScheduledEvent, env: Env) => {
		event.waitUntil(runScheduledTasks(env));
	},
};
