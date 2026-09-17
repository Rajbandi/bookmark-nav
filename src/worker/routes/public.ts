import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import { bookmarks, bookmarkTags, categories, settings, tags } from "../db/schema";
import type { AppEnv } from "../lib/types";
import { extractJson, loadAISettings, runChat } from "../lib/ai";
import { clientIp, consumeRateLimit, pruneRateLimits } from "../lib/rate-limit";
import { mergeDefaultSettings } from "../lib/settings";

// Anonymous semantic search invokes the LLM on every request, so rate-limit it to protect the AI allowance.
const SEMANTIC_SEARCH_LIMIT = 30;
const SEMANTIC_SEARCH_WINDOW_MS = 60 * 60_000;

// Escape user input because % and _ are wildcards in LIKE expressions.
function escapeLike(s: string): string {
	return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// Anonymous users see public items; authenticated users also see private items.
function visibleBookmarks(authed: boolean) {
	return authed ? undefined : eq(bookmarks.visibility, "public");
}

type CatRow = { id: number; parentId: number | null; visibility: "public" | "private" };

// Anonymous users can see a category only if all its ancestors are public; hide entire private subtrees.
function allowedCategoryIds(cats: CatRow[], authed: boolean): Set<number> {
	if (authed) return new Set(cats.map((c) => c.id));
	const byId = new Map(cats.map((c) => [c.id, c]));
	const allowed = new Set<number>();
	for (const cat of cats) {
		let cur: CatRow | undefined = cat;
		let ok = true;
		while (cur) {
			if (cur.visibility !== "public") {
				ok = false;
				break;
			}
			cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined;
		}
		if (ok) allowed.add(cat.id);
	}
	return allowed;
}

// Attach tag names to the bookmark list.
async function attachTags<T extends { id: number }>(db: Db, rows: T[]) {
	if (rows.length === 0) return rows.map((r) => ({ ...r, tags: [] as string[] }));
	// Load tag associations and map them in memory to avoid exceeding the D1 100-binding limit with IN lists.
	const links = await db
		.select({
			bookmarkId: bookmarkTags.bookmarkId,
			name: tags.name,
		})
		.from(bookmarkTags)
		.innerJoin(tags, eq(bookmarkTags.tagId, tags.id));
	const map = new Map<number, string[]>();
	for (const l of links) {
		const arr = map.get(l.bookmarkId) ?? [];
		arr.push(l.name);
		map.set(l.bookmarkId, arr);
	}
	return rows.map((r) => ({ ...r, tags: map.get(r.id) ?? [] }));
}

// Site setting keys available to anonymous users.
// Allowlist response keys because settings also stores sensitive AI credentials and endpoints.
// Otherwise /api/public/site would expose plaintext API keys to visitors.
const PUBLIC_SETTING_KEYS = new Set([
	"siteName",
	"footer",
	"icon.service",
	"appearance.compact",
	"appearance.anchorNav",
	"appearance.style",
	"showGithubLink",
]);

const bookmarkColumns = {
	id: bookmarks.id,
	title: bookmarks.title,
	url: bookmarks.url,
	description: bookmarks.description,
	icon: bookmarks.icon,
	categoryId: bookmarks.categoryId,
	sort: bookmarks.sort,
	clickCount: bookmarks.clickCount,
	isPinned: bookmarks.isPinned,
	visibility: bookmarks.visibility,
	status: bookmarks.status,
};

export const publicRoutes = new Hono<AppEnv>()
	// Public site settings such as the name and logo.
	.get("/site", async (c) => {
		const db = createDb(c.env.DB);
		const rows = await db.select().from(settings);
		const safe = rows.filter((r) => PUBLIC_SETTING_KEYS.has(r.key));
		// Fill missing settings with defaults, preserving saved values.
		return c.json(mergeDefaultSettings(safe));
	})
	// Public AI availability controls the semantic search entry point.
	.get("/ai-config", async (c) => {
		const db = createDb(c.env.DB);
		const rows = await db
			.select({ key: settings.key, value: settings.value })
			.from(settings);
		const map = new Map(rows.map((r) => [r.key, r.value]));
		const enabled = map.get("ai.enabled") === "true";
		const semantic = map.get("ai.features.semanticSearch") === "true";
		return c.json({ aiEnabled: enabled, semanticSearch: enabled && semantic });
	})
	// Navigation data filtered by authentication, hiding entire private category subtrees.
	.get("/bookmarks", async (c) => {
		const db = createDb(c.env.DB);
		const authed = !!c.get("user");
		const allCats = await db
			.select()
			.from(categories)
			.orderBy(asc(categories.sort), asc(categories.id));
		const allowed = allowedCategoryIds(allCats, authed);
		const cats = allCats.filter((cat) => allowed.has(cat.id));
		const rows = await db
			.select(bookmarkColumns)
			.from(bookmarks)
			.where(visibleBookmarks(authed))
			.orderBy(desc(bookmarks.isPinned), asc(bookmarks.sort), asc(bookmarks.id));
		const visible = rows.filter((b) => b.categoryId === null || allowed.has(b.categoryId));
		return c.json({
			authenticated: authed,
			categories: cats,
			bookmarks: await attachTags(db, visible),
		});
	})
	// Search title, description, and URL with authentication-based filtering.
	.get(
		"/search",
		zValidator("query", z.object({ q: z.string().min(1).max(100) })),
		async (c) => {
			const db = createDb(c.env.DB);
			const authed = !!c.get("user");
			const kw = `%${escapeLike(c.req.valid("query").q)}%`;
			const allCats = await db.select().from(categories);
			const allowed = allowedCategoryIds(allCats, authed);
			const rows = await db
				.select(bookmarkColumns)
				.from(bookmarks)
				.where(
					and(
						visibleBookmarks(authed),
						or(
							sql`${bookmarks.title} LIKE ${kw} ESCAPE '\'`,
							sql`${bookmarks.description} LIKE ${kw} ESCAPE '\'`,
							sql`${bookmarks.url} LIKE ${kw} ESCAPE '\'`,
						),
					),
				)
				.orderBy(desc(bookmarks.clickCount))
				.limit(50);
			// Exclude bookmarks in private category subtrees from search, matching list visibility.
			const visible = rows.filter(
				(b) => b.categoryId === null || allowed.has(b.categoryId),
			);
			return c.json({ bookmarks: await attachTags(db, visible) });
		},
	)
	// Semantic search: natural language to expanded keywords to bookmark search.
	.get(
		"/search/semantic",
		zValidator("query", z.object({ q: z.string().min(1).max(100) })),
		async (c) => {
			const db = createDb(c.env.DB);
			const aiSettings = await loadAISettings(db);
			if (!aiSettings.enabled || !aiSettings.features.semanticSearch) {
				return c.json({ error: "AI semantic search is disabled" }, 400);
			}
			// Rate-limit before anonymous LLM requests to prevent AI allowance abuse.
			const rl = await consumeRateLimit(
				db,
				`semantic:${clientIp(c)}`,
				SEMANTIC_SEARCH_LIMIT,
				SEMANTIC_SEARCH_WINDOW_MS,
			);
			if (!rl.ok) {
				await pruneRateLimits(db, SEMANTIC_SEARCH_WINDOW_MS);
				return c.json({ error: "Too many requests. Please try again later." }, 429);
			}
			const query = c.req.valid("query").q;
			const authed = !!c.get("user");
			// Convert natural-language queries into searchable keywords with the LLM.
			const system =
				"You are a bookmark search engine. Rewrite the natural-language query as English search keywords likely to match bookmark titles, descriptions, URLs, or tags. Preserve proper names when needed.";
			const user = `Return only a JSON array of 2-6 keywords:
["keyword1", "keyword2"]

Query: ${query}`;
			let keywords: string[] = [query];
			try {
				const raw = await runChat(
					c.env,
					aiSettings,
					[
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
					"semanticSearch",
					db,
				);
				const parsed = extractJson<{ keywords?: string[] } | string[]>(raw);
				const list = Array.isArray(parsed) ? parsed : parsed.keywords ?? [];
				if (list.length) keywords = list.filter(Boolean);
			} catch {
				// Fall back to the original query if keyword conversion fails.
			}
			// Match keywords with OR, prioritizing bookmarks matching multiple keywords.
			const allCats = await db.select().from(categories);
			const allowed = allowedCategoryIds(allCats, authed);
			const rows = await db
				.select(bookmarkColumns)
				.from(bookmarks)
				.where(visibleBookmarks(authed))
				.orderBy(desc(bookmarks.clickCount));
			const tagged = await attachTags(db, rows);
			const needle = keywords.map((k) => k.toLowerCase());
			const scored = tagged
				.map((b) => {
					const hay = [b.title, b.description ?? "", b.url, ...b.tags]
						.join(" ")
						.toLowerCase();
					const hits = needle.filter((k) => hay.includes(k)).length;
					return { b, hits };
				})
				.filter((x) => x.hits > 0)
				.sort((a, b) => b.hits - a.hits)
				.map((x) => x.b)
				.filter((b) => b.categoryId === null || allowed.has(b.categoryId))
				.slice(0, 50);
			return c.json({ bookmarks: scored });
		},
	)
	// Record bookmark clicks.
	.post(
		"/bookmarks/:id/click",
		zValidator("param", z.object({ id: z.coerce.number().int() })),
		async (c) => {
			const db = createDb(c.env.DB);
			const id = c.req.valid("param").id;
			const authed = !!c.get("user");
			// Count clicks only for visible bookmarks so response differences cannot expose private bookmarks.
			const allCats = await db.select().from(categories);
			const allowed = allowedCategoryIds(allCats, authed);
			const [row] = await db
				.select({
					id: bookmarks.id,
					categoryId: bookmarks.categoryId,
					visibility: bookmarks.visibility,
				})
				.from(bookmarks)
				.where(eq(bookmarks.id, id))
				.limit(1);
			// Return ok for missing or inaccessible bookmarks to avoid revealing their existence.
			if (!row) return c.json({ ok: true });
			if (row.visibility !== "public" && !authed) return c.json({ ok: true });
			if (row.categoryId !== null && !allowed.has(row.categoryId)) {
				return c.json({ ok: true });
			}
			await db
				.update(bookmarks)
				.set({ clickCount: sql`${bookmarks.clickCount} + 1` })
				.where(eq(bookmarks.id, id));
			return c.json({ ok: true });
		},
	);
