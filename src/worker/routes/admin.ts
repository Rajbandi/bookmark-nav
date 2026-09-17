import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { createDb, type Db } from "../db/client";
import {
	aiUsage,
	bookmarks,
	bookmarkTags,
	categories,
	settings,
	tags,
	users,
} from "../db/schema";
import type { AppEnv } from "../lib/types";
import { requireAuth } from "../middleware/auth";
import { mergeDefaultSettings } from "../lib/settings";
import { checkUrl } from "../lib/check-url";
import { backupToR2, buildBackupPayload } from "../lib/backup";
import { checkAllLinks } from "../lib/maintenance";
import {
	buildNetscapeHtml,
	parseNetscapeHtml,
	type ExportFolder,
	type ParsedFolder,
} from "../lib/netscape";
import { extractJson, loadAISettings, runChat, testModel } from "../lib/ai";
import { generateApiToken, hashApiToken, tokenHint } from "../lib/token";

const idParam = zValidator("param", z.object({ id: z.coerce.number().int() }));
// Limit reorder batches like other bulk endpoints because each item requires an UPDATE.
const reorderSchema = z.object({ ids: z.array(z.number().int()).min(1).max(1000) });

// Limit manually created or moved categories to three levels; imports preserve arbitrary browser nesting.
const MAX_CATEGORY_DEPTH = 3;

// Validate parent assignments to prevent cycles and excessive depth, including the moved subtree.
function validateCategoryNesting(
	all: { id: number; parentId: number | null }[],
	parentId: number,
	movingId?: number,
): string | null {
	const parentOf = new Map(all.map((r) => [r.id, r.parentId]));
	if (movingId !== undefined) {
		if (parentId === movingId) return "A category cannot be its own parent";
		let cur: number | null = parentId;
		while (cur != null) {
			if (cur === movingId) return "Categories cannot form a circular hierarchy";
			cur = parentOf.get(cur) ?? null;
		}
	}
	// Parent depth, starting at 1.
	let parentDepth = 0;
	for (let cur: number | null = parentId; cur != null; cur = parentOf.get(cur) ?? null) {
		parentDepth++;
	}
	// Height of the moved subtree (1 when creating a category).
	const childrenOf = new Map<number, number[]>();
	for (const r of all) {
		if (r.parentId != null) {
			const list = childrenOf.get(r.parentId) ?? [];
			list.push(r.id);
			childrenOf.set(r.parentId, list);
		}
	}
	const height = (id: number): number =>
		1 + Math.max(0, ...(childrenOf.get(id) ?? []).map(height));
	const subtreeHeight = movingId !== undefined ? height(movingId) : 1;
	if (parentDepth + subtreeHeight > MAX_CATEGORY_DEPTH) {
		return `A maximum of ${MAX_CATEGORY_DEPTH} category levels is supported`;
	}
	return null;
}

const categoryInput = z.object({
	name: z.string().min(1).max(50),
	icon: z.string().max(200).nullish(),
	parentId: z.number().int().nullish(),
	sort: z.number().int().optional(),
	visibility: z.enum(["public", "private"]).optional(),
});

const bookmarkInput = z.object({
	title: z.string().min(1).max(200),
	url: z.string().url().max(2000),
	description: z.string().max(500).nullish(),
	icon: z.string().max(2000).nullish(),
	categoryId: z.number().int().nullish(),
	sort: z.number().int().optional(),
	isPinned: z.boolean().optional(),
	visibility: z.enum(["public", "private"]).optional(),
	status: z.enum(["active", "dead"]).optional(),
	tags: z.array(z.string().min(1).max(30)).max(20).optional(),
});

// JSON backup structure from buildBackupPayload; permissive fields support older backups.
// Zod strips unknown keys; restoration skips invalid rows.
// Backup payload type shared with the frontend import hook.
export type BackupImportPayload = z.input<typeof backupImportSchema>;

const backupImportSchema = z.object({
	categories: z
		.array(
			z.object({
				id: z.number().int(),
				name: z.string().min(1).max(50),
				icon: z.string().max(200).nullish(),
				parentId: z.number().int().nullish(),
				sort: z.number().int().optional(),
				visibility: z.enum(["public", "private"]).optional(),
			}),
		)
		.max(1000),
	bookmarks: z
		.array(
			z.object({
				id: z.number().int(),
				title: z.string().min(1).max(200),
				url: z.string().max(2000),
				description: z.string().max(500).nullish(),
				icon: z.string().max(2000).nullish(),
				categoryId: z.number().int().nullish(),
				sort: z.number().int().optional(),
				isPinned: z.boolean().optional(),
				visibility: z.enum(["public", "private"]).optional(),
				status: z.enum(["active", "dead"]).optional(),
				createdAt: z.union([z.number(), z.string()]).optional(),
			}),
		)
		.max(10_000),
	tags: z
		.array(z.object({ id: z.number().int(), name: z.string().min(1).max(30) }))
		.max(1000),
	bookmarkTags: z
		.array(z.object({ bookmarkId: z.number().int(), tagId: z.number().int() }))
		.max(10_000),
	// Support settings as a current key/value object or a legacy array of {key,value} rows.
	settings: z
		.union([
			z.record(z.string(), z.string()),
			z.array(z.object({ key: z.string(), value: z.string() })),
		])
		.optional(),
});

// Normalize backup timestamps from Unix seconds or ISO strings to Date.
function toBackupDate(v: number | string | undefined | null): Date | null {
	if (typeof v === "number") return new Date(v * 1000);
	if (typeof v === "string") {
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return null;
}

// Synchronize tags by upserting names, rebuilding associations, and deleting unused tags.
async function syncTags(db: Db, bookmarkId: number, names: string[]) {
	await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmarkId));
	const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
	if (unique.length > 0) {
		await db.insert(tags).values(unique.map((name) => ({ name }))).onConflictDoNothing();
		const rows = await db.select().from(tags).where(inArray(tags.name, unique));
		await db
			.insert(bookmarkTags)
			.values(rows.map((t) => ({ bookmarkId, tagId: t.id })));
	}
	// Remove orphaned tags after unlinking to prevent buildup from repeated edits.
	await db
		.delete(tags)
		.where(
			sql`NOT EXISTS (SELECT 1 FROM ${bookmarkTags} WHERE ${bookmarkTags.tagId} = ${tags.id})`,
		);
}

// Shared URL checking is implemented in lib/check-url.ts for admin and scheduled tasks.

// Only the page head is needed for title and metadata; avoid downloading the full response.
const MAX_METADATA_BYTES = 200_000;

// Limit the response body size instead of buffering all of it with res.text().
// Unexpectedly large pages could otherwise exceed the Worker memory limit.
async function readBodyCapped(res: Response, limit: number): Promise<string> {
	if (!res.body) return "";
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	let finished = false;
	while (total < limit) {
		const { done, value } = await reader.read();
		if (done) {
			finished = true;
			break;
		}
		chunks.push(value);
		total += value.byteLength;
	}
	// Cancel the remaining stream after reading enough to release the connection.
	if (!finished) await reader.cancel().catch(() => {});
	const buf = new Uint8Array(Math.min(total, limit));
	let offset = 0;
	for (const chunk of chunks) {
		if (offset >= buf.byteLength) break;
		buf.set(chunk.subarray(0, buf.byteLength - offset), offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(buf);
}

// Fetch page metadata to prefill bookmark forms.
async function fetchMetadata(url: string) {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(8000),
		headers: { "User-Agent": "Mozilla/5.0 (compatible; NavBot/1.0)" },
		redirect: "follow",
	});
	const html = await readBodyCapped(res, MAX_METADATA_BYTES);
	const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null;
	const decode = (s: string | null) =>
		s
			?.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'") ?? null;
	const title =
		pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
		pick(/<title[^>]*>([^<]+)<\/title>/i);
	const description =
		pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
		pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
	return { title: decode(title), description: decode(description) };
}

export const adminRoutes = new Hono<AppEnv>()
	.use(requireAuth)
	// ---------- Categories ----------
	.get("/categories", async (c) => {
		const db = createDb(c.env.DB);
		const rows = await db
			.select()
			.from(categories)
			.orderBy(asc(categories.sort), asc(categories.id));
		return c.json({ categories: rows });
	})
	.post("/categories", zValidator("json", categoryInput), async (c) => {
		const db = createDb(c.env.DB);
		const data = c.req.valid("json");
		if (data.parentId != null) {
			const all = await db
				.select({ id: categories.id, parentId: categories.parentId })
				.from(categories);
			const err = validateCategoryNesting(all, data.parentId);
			if (err) return c.json({ error: err }, 400);
		}
		const [row] = await db.insert(categories).values(data).returning();
		return c.json({ category: row });
	})
	.put(
		"/categories/reorder",
		zValidator("json", reorderSchema),
		async (c) => {
			const db = createDb(c.env.DB);
			const { ids } = c.req.valid("json");
			for (const [i, id] of ids.entries()) {
				await db.update(categories).set({ sort: i }).where(eq(categories.id, id));
			}
			return c.json({ ok: true });
		},
	)
	.put("/categories/:id", idParam, zValidator("json", categoryInput.partial()), async (c) => {
		const db = createDb(c.env.DB);
		const id = c.req.valid("param").id;
		const data = c.req.valid("json");
		// Prevent cycles and enforce three levels, including descendants when moving a category.
		if (data.parentId != null) {
			const all = await db
				.select({ id: categories.id, parentId: categories.parentId })
				.from(categories);
			const err = validateCategoryNesting(all, data.parentId, id);
			if (err) return c.json({ error: err }, 400);
		}
		const [row] = await db
			.update(categories)
			.set(data)
			.where(eq(categories.id, id))
			.returning();
		if (!row) return c.json({ error: "Not found" }, 404);
		return c.json({ category: row });
	})
	// Delete child categories and uncategorize bookmarks through foreign keys; batch IDs within D1 binding limits.
	.post(
		"/categories/batch-delete",
		zValidator("json", z.object({ ids: z.array(z.number().int()).min(1).max(1000) })),
		async (c) => {
			const db = createDb(c.env.DB);
			const { ids } = c.req.valid("json");
			for (let i = 0; i < ids.length; i += 90) {
				await db.delete(categories).where(inArray(categories.id, ids.slice(i, i + 90)));
			}
			return c.json({ ok: true, count: ids.length });
		},
	)
	.delete("/categories/:id", idParam, async (c) => {
		const db = createDb(c.env.DB);
		await db.delete(categories).where(eq(categories.id, c.req.valid("param").id));
		return c.json({ ok: true });
	})
	// ---------- Bookmarks ----------
	.get("/bookmarks", async (c) => {
		const db = createDb(c.env.DB);
		const rows = await db
			.select()
			.from(bookmarks)
			.orderBy(desc(bookmarks.isPinned), asc(bookmarks.sort), asc(bookmarks.id));
		const links = await db
			.select({ bookmarkId: bookmarkTags.bookmarkId, name: tags.name })
			.from(bookmarkTags)
			.innerJoin(tags, eq(bookmarkTags.tagId, tags.id));
		const map = new Map<number, string[]>();
		for (const l of links) {
			map.set(l.bookmarkId, [...(map.get(l.bookmarkId) ?? []), l.name]);
		}
		return c.json({
			bookmarks: rows.map((r) => ({ ...r, tags: map.get(r.id) ?? [] })),
		});
	})
	.post("/bookmarks", zValidator("json", bookmarkInput), async (c) => {
		const db = createDb(c.env.DB);
		const { tags: tagNames, ...data } = c.req.valid("json");
		const [row] = await db.insert(bookmarks).values(data).returning();
		if (tagNames) await syncTags(db, row.id, tagNames);
		return c.json({ bookmark: row });
	})
	.put(
		"/bookmarks/reorder",
		zValidator("json", reorderSchema),
		async (c) => {
			const db = createDb(c.env.DB);
			const { ids } = c.req.valid("json");
			for (const [i, id] of ids.entries()) {
				await db.update(bookmarks).set({ sort: i }).where(eq(bookmarks.id, id));
			}
			return c.json({ ok: true });
		},
	)
	// ---------- Bulk actions: register before /bookmarks/:id and batch within D1 binding limits ----------
	.put(
		"/bookmarks/batch-category",
		zValidator(
			"json",
			z.object({
				ids: z.array(z.number().int()).min(1).max(1000),
				categoryId: z.number().int().nullable(),
			}),
		),
		async (c) => {
			const db = createDb(c.env.DB);
			const { ids, categoryId } = c.req.valid("json");
			if (categoryId !== null) {
				const [cat] = await db
					.select({ id: categories.id })
					.from(categories)
					.where(eq(categories.id, categoryId));
				if (!cat) return c.json({ error: "Category does not exist" }, 400);
			}
			for (let i = 0; i < ids.length; i += 90) {
				await db
					.update(bookmarks)
					.set({ categoryId, updatedAt: new Date() })
					.where(inArray(bookmarks.id, ids.slice(i, i + 90)));
			}
			return c.json({ ok: true, count: ids.length });
		},
	)
	.post(
		"/bookmarks/batch-delete",
		zValidator("json", z.object({ ids: z.array(z.number().int()).min(1).max(1000) })),
		async (c) => {
			const db = createDb(c.env.DB);
			const { ids } = c.req.valid("json");
			for (let i = 0; i < ids.length; i += 90) {
				await db.delete(bookmarks).where(inArray(bookmarks.id, ids.slice(i, i + 90)));
			}
			return c.json({ ok: true, count: ids.length });
		},
	)
	.put("/bookmarks/:id", idParam, zValidator("json", bookmarkInput.partial()), async (c) => {
		const db = createDb(c.env.DB);
		const { tags: tagNames, ...data } = c.req.valid("json");
		const [row] = await db
			.update(bookmarks)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(bookmarks.id, c.req.valid("param").id))
			.returning();
		if (!row) return c.json({ error: "Not found" }, 404);
		if (tagNames) await syncTags(db, row.id, tagNames);
		return c.json({ bookmark: row });
	})
	.delete("/bookmarks/:id", idParam, async (c) => {
		const db = createDb(c.env.DB);
		await db.delete(bookmarks).where(eq(bookmarks.id, c.req.valid("param").id));
		return c.json({ ok: true });
	})
	// ---------- Page metadata ----------
	.post(
		"/metadata",
		zValidator("json", z.object({ url: z.string().url() })),
		async (c) => {
			try {
				return c.json(await fetchMetadata(c.req.valid("json").url));
			} catch {
				return c.json({ error: "Could not fetch the page. Check that the URL is accessible." }, 422);
			}
		},
	)
	// ---------- AI autofill ----------
	.post(
		"/metadata-ai",
		zValidator("json", z.object({ url: z.string().url() })),
		async (c) => {
			const db = createDb(c.env.DB);
			const aiSettings = await loadAISettings(db);
			if (!aiSettings.enabled || !aiSettings.features.autoFill) {
				return c.json({ error: "AI autofill is disabled" }, 400);
			}

			const { url } = c.req.valid("json");
			let meta: { title: string | null; description: string | null };
			try {
				meta = await fetchMetadata(url);
			} catch {
				return c.json({ error: "Could not fetch the page. Check that the URL is accessible." }, 422);
			}

			const pageText = [meta.title, meta.description].filter(Boolean).join("\n");
			const categoryNames = (await db.select({ name: categories.name }).from(categories))
				.map((r) => r.name);
			const system =
				"You are a bookmark organization assistant. Extract or complete bookmark details from the supplied URL and page information. Write generated titles, descriptions, and tags in English. Preserve existing category names exactly.";
			const user = `Generate bookmark details for this page. Return only JSON:
{
  "title": "A short, accurate English title",
  "description": "One English sentence, no more than 80 words",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "The most suitable existing category name, or null if none fits"
}

Available categories (choose only from this list; use null if uncertain):
${categoryNames.length ? categoryNames.join(", ") : "(no categories)"}

URL: ${url}
Page information:
${pageText || "(none)"}`;

			try {
				const raw = await runChat(
					c.env,
					aiSettings,
					[
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
					"autoFill",
					db,
				);
				const parsed = extractJson<{
					title?: string;
					description?: string;
					tags?: string[];

					category?: string | null;
				}>(raw);
				// Map the suggested category name to an existing category ID.
				let categoryId: number | null = null;
				if (parsed.category) {
					const matched = (await db.select().from(categories)).find(
						(c) => c.name === parsed.category,
					);
					categoryId = matched ? matched.id : null;
				}
				return c.json({
					title: parsed.title || meta.title,
					description: parsed.description || meta.description,

					tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean) : [],
					categoryId,
				});
			} catch (err) {
				console.error("AI metadata error:", err);
				return c.json(
					{
						error: "AI analysis failed; using fetched page metadata instead",
						title: meta.title,
						description: meta.description,

						tags: [],
					},
					500,
				);
			}
		},
	)
	// ---------- AI tag suggestions ----------
	.post(
		"/suggest-tags",
		zValidator(
			"json",
			z.object({ title: z.string(), description: z.string().optional(), url: z.string().optional() }),
		),
		async (c) => {
			const db = createDb(c.env.DB);
			const aiSettings = await loadAISettings(db);
			if (!aiSettings.enabled || !aiSettings.features.tagSuggest) {
				return c.json({ error: "AI tag suggestions are disabled" }, 400);
			}
			const { title, description, url } = c.req.valid("json");
			const system =
				"You are a bookmark tagging assistant. Suggest 3-5 short English tags based on the bookmark title, description, and URL.";
			const user = `Return only a JSON array of tags:
["tag1", "tag2", "tag3"]

Title: ${title}
Description: ${description || "(none)"}
URL: ${url || "(none)"}`;

			try {
				const raw = await runChat(
					c.env,
					aiSettings,
					[
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
					"tagSuggest",
					db,
				);
				const parsed = extractJson<{ tags?: string[] } | string[]>(raw);
				const tags = Array.isArray(parsed) ? parsed : parsed.tags ?? [];
				return c.json({ tags: tags.filter(Boolean).slice(0, 5) });
			} catch (err) {
				console.error("AI suggest-tags error:", err);
				return c.json({ error: "AI tag suggestions failed" }, 500);
			}
		},
	)
	// ---------- Netscape Bookmark HTML import/export for Chrome, Edge, Firefox, and Safari ----------
	.post(
		"/import",
		zValidator("json", z.object({ html: z.string().min(1).max(20_000_000) })),
		async (c) => {
			const db = createDb(c.env.DB);
			const tree = parseNetscapeHtml(c.req.valid("json").html);
			// An empty tree likely means the wrong file was uploaded; report an error instead of a zero-item success.
			const countTree = (f: ParsedFolder): number =>
				f.bookmarks.length + f.children.reduce((n, ch) => n + countTree(ch), 0);
			if (countTree(tree) === 0) {
				return c.json(
					{ error: "No bookmarks found. Choose a bookmark HTML file exported by a browser." },
					400,
				);
			}
			// Reuse categories with the same name and parent; skip existing URLs to keep repeated imports clean.
			const existingCats = await db.select().from(categories);
			const catKey = new Map(
				existingCats.map((r) => [`${r.parentId ?? 0}:${r.name}`, r.id]),
			);
			const existingUrls = new Set(
				(await db.select({ url: bookmarks.url }).from(bookmarks)).map((r) => r.url),
			);
			let catCount = 0;
			let bmCount = 0;
			let skipped = 0;

			async function importBookmarks(
				folder: ParsedFolder,
				categoryId: number | null,
			) {
				for (const b of folder.bookmarks) {
					if (existingUrls.has(b.url)) {
						skipped++;
						continue;
					}
					existingUrls.add(b.url);
					await db.insert(bookmarks).values({
						title: b.title.slice(0, 200),
						url: b.url,
						icon: b.icon,
						categoryId,
						...(b.addDate ? { createdAt: new Date(b.addDate * 1000) } : {}),
					});
					bmCount++;
				}
				for (const child of folder.children) {
					const key = `${categoryId ?? 0}:${child.name}`;
					let id = catKey.get(key);
					if (id === undefined) {
						const [row] = await db
							.insert(categories)
							.values({ name: child.name.slice(0, 50), parentId: categoryId })
							.returning({ id: categories.id });
						id = row.id;
						catKey.set(key, id);
						catCount++;
					}
					await importBookmarks(child, id);
				}
			}

			await importBookmarks(tree, null);
			return c.json({ categories: catCount, bookmarks: bmCount, skipped });
		},
	)
	.get("/export", async (c) => {
		const db = createDb(c.env.DB);
		const cats = await db
			.select()
			.from(categories)
			.orderBy(asc(categories.sort), asc(categories.id));
		const bms = await db
			.select()
			.from(bookmarks)
			.orderBy(asc(bookmarks.sort), asc(bookmarks.id));
		const toEntry = (b: (typeof bms)[number]) => ({
			title: b.title,
			url: b.url,
			icon: b.icon,
			addDate: Math.floor(b.createdAt.getTime() / 1000),
		});
		// Rebuild the folder tree by parentId, preserving arbitrary nesting.
		const folderById = new Map<number, ExportFolder>(
			cats.map((cat) => [
				cat.id,
				{
					name: cat.name,
					addDate: Math.floor(cat.createdAt.getTime() / 1000),
					children: [],
					bookmarks: [],
				},
			]),
		);
		const rootFolders: ExportFolder[] = [];
		for (const cat of cats) {
			const node = folderById.get(cat.id)!;
			const parent = cat.parentId !== null ? folderById.get(cat.parentId) : undefined;
			if (parent) parent.children.push(node);
			else rootFolders.push(node);
		}
		const rootBookmarks = [];
		for (const b of bms) {
			const folder = b.categoryId !== null ? folderById.get(b.categoryId) : undefined;
			if (folder) folder.bookmarks.push(toEntry(b));
			else rootBookmarks.push(toEntry(b));
		}
		const html = buildNetscapeHtml(rootBookmarks, rootFolders);
		const date = new Date().toISOString().slice(0, 10);
		return c.body(html, 200, {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Disposition": `attachment; filename="bookmarks-${date}.html"`,
		});
	})
	// ---------- Manual link checks in frontend batches ----------
	.post(
		"/check-links",
		zValidator("json", z.object({ ids: z.array(z.number().int()).min(1).max(10) })),
		async (c) => {
			const db = createDb(c.env.DB);
			const rows = await db
				.select({ id: bookmarks.id, url: bookmarks.url })
				.from(bookmarks)
				.where(inArray(bookmarks.id, c.req.valid("json").ids));
			const results = await Promise.all(
				rows.map(async (r) => ({
					id: r.id,
					status: (await checkUrl(r.url)) ? ("active" as const) : ("dead" as const),
				})),
			);
			for (const r of results) {
				await db
					.update(bookmarks)
					.set({ status: r.status })
					.where(eq(bookmarks.id, r.id));
			}
			return c.json({ results });
		},
	)
	// ---------- AI category suggestions ----------
	.post(
		"/suggest-category",
		zValidator(
			"json",
			z.object({ title: z.string(), description: z.string().optional(), url: z.string().optional() }),
		),
		async (c) => {
			const db = createDb(c.env.DB);
			const aiSettings = await loadAISettings(db);
			if (!aiSettings.enabled || !aiSettings.features.autoCategorize) {
				return c.json({ error: "AI auto-categorization is disabled" }, 400);
			}
			const { title, description, url } = c.req.valid("json");
			const cats = await db.select().from(categories);
			const catList = cats.map((c) => c.name).join(", ");
			const system =
				"You are a bookmark categorization assistant. Choose the best category from the supplied list, preserving its exact name, or return new to suggest creating one. Write the reason in English.";
			const user = `Return only JSON:
{ "category": "An existing category name or new", "reason": "A one-sentence English explanation" }

Available categories: ${catList || "(no categories)"}
Title: ${title}
Description: ${description || "(none)"}
URL: ${url || "(none)"}`;

			try {
				const raw = await runChat(
					c.env,
					aiSettings,
					[
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
					"autoCategorize",
					db,
				);
				const parsed = extractJson<{ category?: string; reason?: string }>(raw);
				const name = (parsed.category ?? "").trim();
				const matched = cats.find((c) => c.name === name);
				return c.json({
					categoryId: matched ? matched.id : null,
					categoryName: matched ? matched.name : name === "new" ? null : name || null,
					isNew: name === "new" || !matched,
					reason: parsed.reason ?? "",
				});
			} catch (err) {
				console.error("AI suggest-category error:", err);
				return c.json({ error: "AI category suggestions failed" }, 500);
			}
		},
	)
	// ---------- AI broken link repair ----------
	.post(
		"/repair-link",
		zValidator("json", z.object({ title: z.string(), url: z.string().url() })),
		async (c) => {
			const db = createDb(c.env.DB);
			const aiSettings = await loadAISettings(db);
			if (!aiSettings.enabled || !aiSettings.features.deadLinkRepair) {
				return c.json({ error: "AI broken link repair is disabled" }, 400);
			}
			const { title, url } = c.req.valid("json");
			const system =
				"You are a broken link repair assistant. Suggest the most likely working alternative URL for the supplied broken bookmark. Write the explanation in English.";
			const user = `Return only JSON:
{
  "alternative": "The suggested replacement URL, or null",
  "wayback": "An archive URL at https://web.archive.org/web/2024/ followed by the original URL",
  "reason": "A one-sentence English explanation"
}

Title: ${title}
Original URL: ${url}`;

			try {
				const raw = await runChat(
					c.env,
					aiSettings,
					[
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
					"deadLinkRepair",
					db,
				);
				const parsed = extractJson<{ alternative?: string | null; wayback?: string; reason?: string }>(raw);
				return c.json({
					alternative: parsed.alternative ?? null,
					wayback: parsed.wayback ?? `https://web.archive.org/web/2024/${url}`,
					reason: parsed.reason ?? "",
				});
			} catch (err) {
				console.error("AI repair-link error:", err);
				return c.json({ error: "AI broken link repair failed" }, 500);
			}
		},
	)
	// ---------- AI content summaries ----------
	.post(
		"/summarize",
		zValidator(
			"json",
			z.object({
				title: z.string(),
				description: z.string().optional(),
				url: z.string().optional(),
			}),
		),
		async (c) => {
			const db = createDb(c.env.DB);
			const aiSettings = await loadAISettings(db);
			if (!aiSettings.enabled || !aiSettings.features.summary) {
				return c.json({ error: "AI content summaries are disabled" }, 400);
			}
			const { title, description, url } = c.req.valid("json");
			const system =
				"You are a bookmark summary assistant. Summarize the key content in one English sentence of no more than 40 words.";
			const user = `Return only the summary text, without quotes or additional content.

Title: ${title}
Description: ${description || "(none)"}
URL: ${url || "(none)"}`;

			try {
				const raw = await runChat(
					c.env,
					aiSettings,
					[
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
					"summary",
					db,
				);
				const summary = raw.trim().replace(/^["'「]|["'」]$/g, "").trim();
				return c.json({ summary });
			} catch (err) {
				console.error("AI summarize error:", err);
				return c.json({ error: "AI summary generation failed" }, 500);
			}
		},
	)
	// ---------- Tags ----------
	.get("/tags", async (c) => {
		const db = createDb(c.env.DB);
		return c.json({ tags: await db.select().from(tags).orderBy(asc(tags.name)) });
	})
	// ---------- Site settings ----------
	.get("/settings", async (c) => {
		const db = createDb(c.env.DB);
		const rows = await db.select().from(settings);
		// Fill missing settings with defaults so admin controls show the initial compact mode and icon service values.
		return c.json(mergeDefaultSettings(rows));
	})
	.put(
		"/settings",
		zValidator("json", z.record(z.string(), z.string())),
		async (c) => {
			const db = createDb(c.env.DB);
			for (const [key, value] of Object.entries(c.req.valid("json"))) {
				await db
					.insert(settings)
					.values({ key, value })
					.onConflictDoUpdate({ target: settings.key, set: { value } });
			}
			return c.json({ ok: true });
		},
	)
	// ---------- On-demand R2 backup ----------
	.post("/backup", async (c) => {
		const db = createDb(c.env.DB);
		const key = await backupToR2(c.env, db);
		if (!key) {
			return c.json(
				{ error: "R2 bucket is not configured. Create a bucket and check the BACKUP binding in wrangler.json." },
				400,
			);
		}
		return c.json({ key });
	})
	// ---------- Download a JSON snapshot using the R2 backup structure ----------
	.get("/backup", async (c) => {
		const payload = await buildBackupPayload(createDb(c.env.DB));
		const date = new Date().toISOString().slice(0, 10);
		return c.body(payload, 200, {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Disposition": `attachment; filename="bookmark-nav-backup-${date}.json"`,
		});
	})
	// ---------- Merge JSON backups, skip duplicates, and fill missing settings ----------
	.post(
		"/import-json",
		zValidator("json", backupImportSchema),
		async (c) => {
			const db = createDb(c.env.DB);
			const payload = c.req.valid("json");

			// 1) Reuse categories by parent and name, or create them; insert parents before children.
			const existingCats = await db.select().from(categories);
			const catKey = new Map(
				existingCats.map((r) => [`${r.parentId ?? 0}:${r.name}`, r.id]),
			);
			const catIdMap = new Map<number, number>();
			let catCount = 0;
			const pending = [...payload.categories];
			let progress = true;
			while (pending.length > 0 && progress) {
				progress = false;
				for (let i = pending.length - 1; i >= 0; i--) {
					const cat = pending[i];
					const parentMapped =
						cat.parentId == null ? true : catIdMap.has(cat.parentId);
					if (!parentMapped) continue;
					const newParentId =
						cat.parentId == null ? null : catIdMap.get(cat.parentId)!;
					const key = `${newParentId ?? 0}:${cat.name}`;
					let id = catKey.get(key);
					if (id === undefined) {
						const [row] = await db
							.insert(categories)
							.values({
								name: cat.name.slice(0, 50),
								icon: cat.icon ?? null,
								parentId: newParentId,
								sort: cat.sort ?? 0,
								visibility: cat.visibility ?? "public",
							})
							.returning({ id: categories.id });
						id = row.id;
						catKey.set(key, id);
						catCount++;
					}
					catIdMap.set(cat.id, id);
					pending.splice(i, 1);
					progress = true;
				}
			}
			// Attach categories with missing parents to the root to avoid data loss.
			for (const cat of pending) {
				const key = `0:${cat.name}`;
				let id = catKey.get(key);
				if (id === undefined) {
					const [row] = await db
						.insert(categories)
						.values({
							name: cat.name.slice(0, 50),
							icon: cat.icon ?? null,
							parentId: null,
							sort: cat.sort ?? 0,
							visibility: cat.visibility ?? "public",
						})
						.returning({ id: categories.id });
					id = row.id;
					catKey.set(key, id);
					catCount++;
				}
				catIdMap.set(cat.id, id);
			}

			// 2) Skip existing URLs; restore timestamps, pinned status, visibility, and link status.
			const existingUrls = new Set(
				(await db.select({ url: bookmarks.url }).from(bookmarks)).map((r) => r.url),
			);
			const bmIdMap = new Map<number, number>();
			let bmCount = 0;
			let skipped = 0;
			for (const b of payload.bookmarks) {
				let url = b.url;
				try {
					url = new URL(b.url).href;
				} catch {
					continue; // Skip invalid URLs.
				}
				if (existingUrls.has(url)) {
					skipped++;
					continue;
				}
				existingUrls.add(url);
				const created = toBackupDate(b.createdAt);
				const [row] = await db
					.insert(bookmarks)
					.values({
						title: b.title.slice(0, 200),
						url,
						description: b.description ?? null,
						icon: b.icon ?? null,
						categoryId: b.categoryId != null ? (catIdMap.get(b.categoryId) ?? null) : null,
						sort: b.sort ?? 0,
						isPinned: b.isPinned ?? false,
						visibility: b.visibility ?? "public",
						status: b.status ?? "active",
						...(created ? { createdAt: created, updatedAt: created } : {}),
					})
					.returning({ id: bookmarks.id });
				bmIdMap.set(b.id, row.id);
				bmCount++;
			}

			// 3) Reuse tags by name and create associations only for newly imported bookmarks.
			const existingTags = await db.select().from(tags);
			const tagNameMap = new Map(existingTags.map((r) => [r.name, r.id]));
			const tagIdMap = new Map<number, number>();
			for (const t of payload.tags) {
				let id = tagNameMap.get(t.name);
				if (id === undefined) {
					const [row] = await db
						.insert(tags)
						.values({ name: t.name.slice(0, 30) })
						.returning({ id: tags.id });
					id = row.id;
					tagNameMap.set(t.name, id);
				}
				tagIdMap.set(t.id, id);
			}
			let linkCount = 0;
			for (const link of payload.bookmarkTags) {
				const newBmId = bmIdMap.get(link.bookmarkId);
				const newTagId = tagIdMap.get(link.tagId);
				if (newBmId === undefined || newTagId === undefined) continue;
				const exists = await db
					.select({ bookmarkId: bookmarkTags.bookmarkId })
					.from(bookmarkTags)
					.where(
						sql`${bookmarkTags.bookmarkId} = ${newBmId} AND ${bookmarkTags.tagId} = ${newTagId}`,
					)
					.limit(1);
				if (exists.length > 0) continue;
				await db
					.insert(bookmarkTags)
					.values({ bookmarkId: newBmId, tagId: newTagId });
				linkCount++;
			}

			// 4) Fill only missing site settings; never overwrite existing configuration.
			let settingsFilled = 0;
			if (payload.settings) {
				// Normalize legacy row-array settings to an object first.
				const backupSettings = Array.isArray(payload.settings)
					? Object.fromEntries(payload.settings.map((r) => [r.key, r.value]))
					: payload.settings;
				const current = new Map(
					(await db.select().from(settings)).map((r) => [r.key, r.value]),
				);
				for (const [key, value] of Object.entries(backupSettings)) {
					if (current.has(key)) continue;
					await db.insert(settings).values({ key, value });
					settingsFilled++;
				}
			}

			return c.json({
				categories: catCount,
				bookmarks: bmCount,
				skipped,
				tags: tagIdMap.size,
				links: linkCount,
				settingsFilled,
			});
		},
	)
	// ---------- Full manual link check, independent of switches and schedules ----------
	.post("/maintenance/check-links", async (c) => {
		const result = await checkAllLinks(createDb(c.env.DB));
		return c.json(result);
	})
	// ---------- Test AI using temporary form values ----------
	.post("/ai-test", async (c) => {
		try {
			const body = await c.req.json<{
				provider: "builtin" | "custom";
				apiEndpoint?: string;
				apiKey?: string;
				model: string;
			}>();
			if (body.provider !== "builtin" && body.provider !== "custom") {
				return c.json({ ok: false, error: "Invalid provider" }, 400);
			}
			const result = await testModel(c.env, body);
			if (result.ok) return c.json({ ok: true });
			return c.json({ ok: false, error: result.error }, 400);
		} catch (err) {
			return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
		}
	})
	// ---------- AI usage overview ----------
	.get("/ai-usage", async (c) => {
		const db = createDb(c.env.DB);
		// created_at stores integer Unix seconds and must be compared directly.
		// SQLite unixepoch(created_at) interprets bare integers as Julian dates and returns NULL, breaking the filter.
		const sinceToday = gt(aiUsage.createdAt, new Date(Date.now() - 86_400_000));
		// Total, successful, and failed requests today.
		const [todayAgg] = await db
			.select({
				total: sql<number>`count(*)`,
				success: sql<number>`sum(success)`,
				avgDuration: sql<number>`avg(duration_ms)`,
			})
			.from(aiUsage)
			.where(sinceToday);
		// Requests today by feature.
		const byFeature = await db
			.select({
				feature: aiUsage.feature,
				total: sql<number>`count(*)`,
				success: sql<number>`sum(success)`,
			})
			.from(aiUsage)
			.where(sinceToday)
			.groupBy(aiUsage.feature);
		// Requests today by provider.
		const byProvider = await db
			.select({
				provider: aiUsage.provider,
				total: sql<number>`count(*)`,
			})
			.from(aiUsage)
			.where(sinceToday)
			.groupBy(aiUsage.provider);
		// Recent failures with details for diagnosing rate limits and invalid keys.
		const recentErrors = await db
			.select({
				feature: aiUsage.feature,
				provider: aiUsage.provider,
				error: aiUsage.error,
				createdAt: aiUsage.createdAt,
			})
			.from(aiUsage)
			.where(and(sinceToday, eq(aiUsage.success, 0)))
			.orderBy(desc(aiUsage.createdAt))
			.limit(20);

		const success = Number(todayAgg?.success ?? 0);
		const total = Number(todayAgg?.total ?? 0);
		return c.json({
			today: {
				total,
				success,
				failed: total - success,
				successRate: total > 0 ? Math.round((success / total) * 100) : 100,
				avgDurationMs: todayAgg?.avgDuration ? Math.round(Number(todayAgg.avgDuration)) : 0,
			},
			byFeature: byFeature.map((r) => ({
				feature: r.feature,
				total: Number(r.total),
				success: Number(r.success),
			})),
			byProvider: byProvider.map((r) => ({
				provider: r.provider,
				total: Number(r.total),
			})),
			recentErrors: recentErrors.map((r) => ({
				feature: r.feature,
				provider: r.provider,
				error: r.error,
				createdAt: r.createdAt.getTime(),
			})),
		});
	})
	// Return token status with only its last four characters and creation time, never plaintext.
	.get("/token", async (c) => {
		const db = createDb(c.env.DB);
		const [row] = await db
			.select({
				hint: users.apiTokenHint,
				createdAt: users.apiTokenCreatedAt,
			})
			.from(users)
			.where(eq(users.id, c.get("user")!.id))
			.limit(1);
		return c.json({
			exists: !!row?.hint,
			hint: row?.hint ?? null,
			createdAt: row?.createdAt?.getTime() ?? null,
		});
	})
	// Generate or rotate the token: return plaintext once and invalidate the old token.
	.post("/token", async (c) => {
		const db = createDb(c.env.DB);
		const token = generateApiToken();
		await db
			.update(users)
			.set({
				apiTokenHash: await hashApiToken(token),
				apiTokenHint: tokenHint(token),
				apiTokenCreatedAt: new Date(),
			})
			.where(eq(users.id, c.get("user")!.id));
		return c.json({ token, hint: tokenHint(token) });
	})
	// Revoke immediately; the next extension request receives 401.
	.delete("/token", async (c) => {
		const db = createDb(c.env.DB);
		await db
			.update(users)
			.set({ apiTokenHash: null, apiTokenHint: null, apiTokenCreatedAt: null })
			.where(eq(users.id, c.get("user")!.id));
		return c.json({ ok: true });
	});
