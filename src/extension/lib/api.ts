// 插件侧 API 客户端:全部走 Bearer 令牌(跨域 fetch 不携带 SameSite cookie)。
// 不复用主前端 hono/client:插件配置的域名运行时才知道,hc 无法提前静态创建
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

// 把分类树按深度优先拍平,带层级深度与完整路径(与主前端同名函数一致,
// 本地实现是为了不把 worker 的类型依赖拉进插件构建/类型检查)
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
	if (!cfg) throw new ApiError(0, "插件未配置,请先在选项页填写站点地址与令牌");
	const res = await fetch(`${cfg.siteUrl}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${cfg.token}`,
			...(init?.body ? { "Content-Type": "application/json" } : {}),
		},
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		// 401 统一引导到重新配置令牌,而不是笼统的"请求失败"
		const message = res.status === 401 ? "令牌已失效,请在后台重新生成并在选项页更新" : body?.error ?? `请求失败(${res.status})`;
		throw new ApiError(res.status, message);
	}
	return res.json() as Promise<T>;
}

// 分类列表(登录态:含私密分类),按现有排序返回
export function fetchCategories() {
	return request<{ categories: Category[] }>("/api/admin/categories").then(
		(r) => r.categories,
	);
}

// 全量书签(用于 URL 查重);数据量大时仍是可接受的单次拉取
export function fetchBookmarks() {
	return request<{ bookmarks: Bookmark[] }>("/api/admin/bookmarks");
}

export function createBookmark(data: BookmarkPayload) {
	return request<{ bookmark: { id: number } }>("/api/admin/bookmarks", {
		method: "POST",
		body: JSON.stringify(data),
	});
}

// AI 可用性(公开接口):决定 popup 是否显示"AI 智能填充"入口
export function fetchAIConfig() {
	return request<{ aiEnabled: boolean; semanticSearch: boolean }>(
		"/api/public/ai-config",
	);
}

// AI 智能填充:返回 AI 生成的标题/描述/标签,以及映射到现有分类的 categoryId
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

// 校验站点可达 + 令牌有效(options 页保存前用)
export async function verifyConfig(siteUrl: string, token: string): Promise<string | null> {
	try {
		const site = await fetch(`${siteUrl}/api/public/site`);
		if (!site.ok) return `站点无响应(HTTP ${site.status})`;
	} catch {
		return "无法连接站点,请检查地址";
	}
	try {
		const res = await fetch(`${siteUrl}/api/admin/token`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (res.status === 401) return "令牌无效,请在后台「安全」页重新生成";
		if (!res.ok) return `令牌校验失败(HTTP ${res.status})`;
	} catch {
		return "无法连接站点,请检查地址";
	}
	return null;
}
