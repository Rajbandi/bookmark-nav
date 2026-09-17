import { hc } from "hono/client";
import type { AppType } from "../../worker";

// Hono RPC client: infer end-to-end types from the worker AppType export.
export const client = hc<AppType>("/");

export type Visibility = "public" | "private";

export type Category = {
	id: number;
	name: string;
	icon: string | null;
	parentId: number | null;
	sort: number;
	visibility: Visibility;
};

// Flatten categories depth-first, retaining depth and full paths for indented lists and selectors.
export type FlatCategory = { category: Category; depth: number; path: string };

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

export type Bookmark = {
	id: number;
	title: string;
	url: string;
	description: string | null;
	icon: string | null;
	categoryId: number | null;
	sort: number;
	clickCount: number;
	isPinned: boolean;
	visibility: Visibility;
	status: "active" | "dead";
	tags: string[];
};

// Icon candidates: custom icon first, then the configured icon service URL for the domain.
export function bookmarkIconCandidates(
	b: Pick<Bookmark, "icon" | "url">,
	iconService?: string,
): string[] {
	const sources: string[] = [];
	if (b.icon) sources.push(b.icon);
	if (iconService) {
		try {
			const { hostname } = new URL(b.url);
			sources.push(iconService.split("{domain}").join(hostname));
		} catch {
			// Skip the icon service for invalid URLs.
		}
	}
	return [...new Set(sources)];
}

// Primary bookmark icon candidate (kept for backward compatibility).
export function bookmarkIcon(b: Pick<Bookmark, "icon" | "url">, iconService?: string): string {
	return bookmarkIconCandidates(b, iconService)[0] ?? "";
}
