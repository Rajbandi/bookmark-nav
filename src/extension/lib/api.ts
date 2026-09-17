// Extension API client: use Bearer tokens because cross-origin fetch does not send SameSite cookies.
// The site URL is configured at runtime, so the main frontend hono/client cannot be initialized statically.
import { loadConfig } from "./config";

export type Category = {
	id: number;
	name: string;
	parentId: number | null;
	visibility: "public" | "private";
};

export type Bookmark = {
	id: number;
	title: string;
	url: string;
	categoryId: number | null;
	visibility: "public" | "private";
};

export type FlatCategory = { category: Category; depth: number; path: string };

// Flatten the category tree depth-first, including depth and full paths, as in the main frontend.
// Keep this implementation local to avoid worker type dependencies in extension builds and type checks.
export function flattenCategoryTree(cats: Category[]): FlatCategory[] {
	const byParent = new Map<number | null, Category[]>();
	for (const cat of cats) {
		const key = cat.parentId ?? null;
		const list = byParent.get(key) ?? [];
		list.push(cat);
		byParent.set(key, list);
	}
	const result: FlatCategory[] = [];
	function walk(parentId: number | null, depth: number, prefix: string) {
		for (const cat of byParent.get(parentId) ?? []) {
			const path = prefix ? `${prefix} / ${cat.name}` : cat.name;
			result.push({ category: cat, depth, path });
			walk(cat.id, depth + 1, path);
		}
	}
	walk(null, 0, "");
	return result;
}

export type BookmarkPayload = {
	title: string;
	url: string;
	description?: string | null;
	categoryId?: number | null;
	visibility?: "public" | "private";
	tags?: string[];
};

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const cfg = await loadConfig();
	if (!cfg) throw new ApiError(0, "Configure the site URL and token on the extension settings page first.");
	const res = await fetch(`${cfg.siteUrl}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${cfg.token}`,
			...(init?.body ? { "Content-Type": "application/json" } : {}),
		},
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		// For 401 responses, direct users to update their token instead of showing a generic error.
		const message = res.status === 401 ? "Your token has expired or been revoked. Generate a new one in admin and update the extension settings." : body?.error ?? `Request failed (${res.status})`;
		throw new ApiError(res.status, message);
	}
	return res.json() as Promise<T>;
}

// Return categories in their saved order, including private categories for authenticated users.
export function fetchCategories() {
	return request<{ categories: Category[] }>("/api/admin/categories").then(
		(r) => r.categories,
	);
}

// Fetch all bookmarks once to check for duplicate URLs.
export function fetchBookmarks() {
	return request<{ bookmarks: Bookmark[] }>("/api/admin/bookmarks");
}

export function createBookmark(data: BookmarkPayload) {
	return request<{ bookmark: { id: number } }>("/api/admin/bookmarks", {
		method: "POST",
		body: JSON.stringify(data),
	});
}

// Public AI availability determines whether the popup shows AI autofill.
export function fetchAIConfig() {
	return request<{ aiEnabled: boolean; semanticSearch: boolean }>(
		"/api/public/ai-config",
	);
}

// AI autofill returns generated metadata and a categoryId mapped to an existing category.
export function aiAutoFill(url: string) {
	return request<{
		title: string | null;
		description: string | null;
		tags: string[];
		categoryId: number | null;
	}>("/api/admin/metadata-ai", {
		method: "POST",
		body: JSON.stringify({ url }),
	});
}

// Verify site connectivity and token validity before saving extension settings.
export async function verifyConfig(siteUrl: string, token: string): Promise<string | null> {
	try {
		const site = await fetch(`${siteUrl}/api/public/site`);
		if (!site.ok) return `Site did not respond (HTTP  ${site.status})`;
	} catch {
		return "Cannot connect to the site. Check the URL.";
	}
	try {
		const res = await fetch(`${siteUrl}/api/admin/token`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (res.status === 401) return "Invalid token. Generate a new one on the admin Security page.";
		if (!res.ok) return `Token verification failed (HTTP  ${res.status})`;
	} catch {
		return "Cannot connect to the site. Check the URL.";
	}
	return null;
}
