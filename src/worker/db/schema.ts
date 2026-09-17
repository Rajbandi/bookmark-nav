import { sql } from "drizzle-orm";
import {
	integer,
	primaryKey,
	sqliteTable,
	text,
	type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// Administrator accounts (currently single-user, with a table for future expansion).
export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	// Increment on password changes to invalidate previously issued JWTs immediately.
	tokenVersion: integer("token_version").notNull().default(0),
	// Long-lived external client token: store only SHA-256 and return plaintext once; null means disabled.
	apiTokenHash: text("api_token_hash"),
	// Last four token characters for identification in admin.
	apiTokenHint: text("api_token_hint"),
	apiTokenCreatedAt: integer("api_token_created_at", { mode: "timestamp" }),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// Categories support arbitrary nesting; null parentId denotes a top-level category.
export const categories = sqliteTable("categories", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	icon: text("icon"),
	parentId: integer("parent_id").references((): AnySQLiteColumn => categories.id, {
		onDelete: "cascade",
	}),
	sort: integer("sort").notNull().default(0),
	// public: visible to everyone; private: visible only when signed in.
	visibility: text("visibility", { enum: ["public", "private"] })
		.notNull()
		.default("public"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// Bookmarks
export const bookmarks = sqliteTable("bookmarks", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	title: text("title").notNull(),
	url: text("url").notNull(),
	description: text("description"),
	icon: text("icon"),
	categoryId: integer("category_id").references(() => categories.id, {
		onDelete: "set null",
	}),
	sort: integer("sort").notNull().default(0),
	clickCount: integer("click_count").notNull().default(0),
	isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
	// public: visible to everyone; private: visible only when signed in.
	visibility: text("visibility", { enum: ["public", "private"] })
		.notNull()
		.default("public"),
	// active: accessible; dead: marked as broken by a link check.
	status: text("status", { enum: ["active", "dead"] })
		.notNull()
		.default("active"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// Tags
export const tags = sqliteTable("tags", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull().unique(),
});

// Many-to-many bookmark/tag association.
export const bookmarkTags = sqliteTable(
	"bookmark_tags",
	{
		bookmarkId: integer("bookmark_id")
			.notNull()
			.references(() => bookmarks.id, { onDelete: "cascade" }),
		tagId: integer("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.bookmarkId, t.tagId] })],
);

// Site settings (key-value).
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
});

// Fixed-window counters for login brute-force protection and anonymous AI rate limits.
export const rateLimits = sqliteTable("rate_limits", {
	key: text("key").primaryKey(),
	count: integer("count").notNull().default(0),
	windowStart: integer("window_start", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// AI usage records for monitoring free allowance and custom API abuse.
export const aiUsage = sqliteTable("ai_usage", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	feature: text("feature").notNull(),
	provider: text("provider").notNull(),
	success: integer("success").notNull(),
	durationMs: integer("duration_ms"),
	error: text("error"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});
