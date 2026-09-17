import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "./api";
import type { BackupImportPayload } from "../../worker/routes/admin";

export type BookmarkPayload = {
	title: string;
	url: string;
	description?: string | null;
	icon?: string | null;
	categoryId?: number | null;
	isPinned?: boolean;
	visibility?: "public" | "private";
	tags?: string[];
};

export type CategoryPayload = {
	name: string;
	icon?: string | null;
	parentId?: number | null;
	visibility?: "public" | "private";
};

// Invalidate both public and admin lists after successful changes.
function useInvalidate() {
	const qc = useQueryClient();
	return () =>
		Promise.all([
			qc.invalidateQueries({ queryKey: ["admin-bookmarks"] }),
			qc.invalidateQueries({ queryKey: ["admin-categories"] }),
			qc.invalidateQueries({ queryKey: ["nav-bookmarks"] }),
		]);
}

export function useAdminBookmarks() {
	return useQuery({
		queryKey: ["admin-bookmarks"],
		queryFn: async () => {
			const res = await client.api.admin.bookmarks.$get();
			if (!res.ok) throw new Error("Could not load bookmarks");
			return res.json();
		},
	});
}

export function useAdminCategories() {
	return useQuery({
		queryKey: ["admin-categories"],
		queryFn: async () => {
			const res = await client.api.admin.categories.$get();
			if (!res.ok) throw new Error("Could not load categories");
			return res.json();
		},
	});
}

export function useSaveBookmark() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async ({ id, data }: { id?: number; data: BookmarkPayload }) => {
			const res = id
				? await client.api.admin.bookmarks[":id"].$put({
						param: { id: String(id) },
						json: data,
					})
				: await client.api.admin.bookmarks.$post({ json: data });
			if (!res.ok) throw new Error("Could not save");
			return res.json();
		},
		onSuccess: async () => {
			await invalidate();
			toast.success("Saved");
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useDeleteBookmark() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async (id: number) => {
			const res = await client.api.admin.bookmarks[":id"].$delete({
				param: { id: String(id) },
			});
			if (!res.ok) throw new Error("Could not delete");
		},
		onSuccess: async () => {
			await invalidate();
			toast.success("Deleted");
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useReorderBookmarks() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async (ids: number[]) => {
			const res = await client.api.admin.bookmarks.reorder.$put({ json: { ids } });
			if (!res.ok) throw new Error("Could not save order");
		},
		onSuccess: () => invalidate(),
		onError: (e) => toast.error(e.message),
	});
}

export function useSaveCategory() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async ({ id, data }: { id?: number; data: CategoryPayload }) => {
			const res = id
				? await client.api.admin.categories[":id"].$put({
						param: { id: String(id) },
						json: data,
					})
				: await client.api.admin.categories.$post({ json: data });
			if (!res.ok) {
				// Show specific backend errors, such as depth limits or circular nesting.
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Could not save");
			}
			return res.json();
		},
		onSuccess: async () => {
			await invalidate();
			toast.success("Saved");
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useDeleteCategory() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async (id: number) => {
			const res = await client.api.admin.categories[":id"].$delete({
				param: { id: String(id) },
			});
			if (!res.ok) throw new Error("Could not delete");
		},
		onSuccess: async () => {
			await invalidate();
			toast.success("Deleted");
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useReorderCategories() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async (ids: number[]) => {
			const res = await client.api.admin.categories.reorder.$put({ json: { ids } });
			if (!res.ok) throw new Error("Could not save order");
		},
		onSuccess: () => invalidate(),
		onError: (e) => toast.error(e.message),
	});
}

export function useFetchMetadata() {
	return useMutation({
		mutationFn: async (url: string) => {
			const res = await client.api.admin.metadata.$post({ json: { url } });
			if (!res.ok) throw new Error("Could not fetch the page. Check that the URL is accessible.");
			return res.json() as Promise<{
				title: string | null;
				description: string | null;

			}>;
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useFetchMetadataAI() {
	return useMutation({
		mutationFn: async (url: string) => {
			const res = await client.api.admin["metadata-ai"].$post({ json: { url } });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "AI analysis failed");
			}
			return res.json() as Promise<{
				title: string | null;
				description: string | null;

				tags: string[];
				categoryId: number | null;
			}>;
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useSuggestTags() {
	return useMutation({
		mutationFn: async (input: { title: string; description?: string; url?: string }) => {
			const res = await client.api.admin["suggest-tags"].$post({ json: input });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "AI tag suggestions failed");
			}
			return res.json() as Promise<{ tags: string[] }>;
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useSuggestCategory() {
	return useMutation({
		mutationFn: async (input: { title: string; description?: string; url?: string }) => {
			const res = await client.api.admin["suggest-category"].$post({ json: input });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "AI category suggestions failed");
			}
			return res.json() as Promise<{
				categoryId: number | null;
				categoryName: string | null;
				isNew: boolean;
				reason: string;
			}>;
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useRepairLink() {
	return useMutation({
		mutationFn: async (input: { title: string; url: string }) => {
			const res = await client.api.admin["repair-link"].$post({ json: input });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "AI broken link repair failed");
			}
			return res.json() as Promise<{
				alternative: string | null;
				wayback: string;
				reason: string;
			}>;
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useSummarize() {
	return useMutation({
		mutationFn: async (input: { title: string; description?: string; url?: string }) => {
			const res = await client.api.admin.summarize.$post({ json: input });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "AI summary generation failed");
			}
			return res.json() as Promise<{ summary: string }>;
		},
		onError: (e) => toast.error(e.message),
	});
}

// Move selected bookmarks to a category (null means uncategorized).
export function useBatchMoveBookmarks() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async ({ ids, categoryId }: { ids: number[]; categoryId: number | null }) => {
			const res = await client.api.admin.bookmarks["batch-category"].$put({
				json: { ids, categoryId },
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Could not move bookmarks");
			}
			return res.json();
		},
		onSuccess: async (r) => {
			await invalidate();
			toast.success(`Moved ${r.count} bookmarks`);
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useBatchDeleteBookmarks() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async (ids: number[]) => {
			const res = await client.api.admin.bookmarks["batch-delete"].$post({
				json: { ids },
			});
			if (!res.ok) throw new Error("Could not delete selected items");
			return res.json();
		},
		onSuccess: async (r) => {
			await invalidate();
			toast.success(`Deleted ${r.count} bookmarks`);
		},
		onError: (e) => toast.error(e.message),
	});
}

// Delete categories in bulk; cascade to child categories and uncategorize their bookmarks.
export function useBatchDeleteCategories() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async (ids: number[]) => {
			const res = await client.api.admin.categories["batch-delete"].$post({
				json: { ids },
			});
			if (!res.ok) throw new Error("Could not delete selected items");
			return res.json();
		},
		onSuccess: async (r) => {
			await invalidate();
			toast.success(`Deleted ${r.count} categories`);
		},
		onError: (e) => toast.error(e.message),
	});
}

// Check links in batches of 10 concurrent requests and report progress through onProgress.
export function useCheckDeadLinks() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async ({
			ids,
			onProgress,
		}: {
			ids: number[];
			onProgress?: (done: number, total: number) => void;
		}) => {
			let dead = 0;
			for (let i = 0; i < ids.length; i += 10) {
				const chunk = ids.slice(i, i + 10);
				const res = await client.api.admin["check-links"].$post({
					json: { ids: chunk },
				});
				if (!res.ok) throw new Error("Link check request failed");
				const { results } = await res.json();
				dead += results.filter((r) => r.status === "dead").length;
				onProgress?.(Math.min(i + 10, ids.length), ids.length);
			}
			return { total: ids.length, dead };
		},
		onSuccess: async ({ total, dead }) => {
			await invalidate();
			if (dead > 0) toast.warning(`Check complete: ${total} bookmarks, ${dead} broken links`);
			else toast.success(`Check complete: all ${total} bookmarks are accessible`);
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useImportBookmarks() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async (html: string) => {
			const res = await client.api.admin.import.$post({ json: { html } });
			if (!res.ok) throw new Error("Import failed. Check that the file is a browser bookmark HTML export.");
			return res.json();
		},
		onSuccess: async (r) => {
			await invalidate();
			toast.success(
				`Import complete: added ${r.bookmarks} bookmarks and ${r.categories} categories` +
					(r.skipped ? `; skipped ${r.skipped} duplicates` : ""),
			);
		},
		onError: (e) => toast.error(e.message),
	});
}

// Restore a JSON backup by merging records, skipping duplicates, and filling missing settings.
export function useImportJson() {
	const invalidate = useInvalidate();
	return useMutation({
		mutationFn: async (payload: BackupImportPayload) => {
			const res = await client.api.admin["import-json"].$post({ json: payload });
			if (!res.ok) throw new Error("Restore failed. Check that the file is a JSON backup exported by this application.");
			return res.json();
		},
		onSuccess: async (r) => {
			await invalidate();
			toast.success(
				`Restore complete: ${r.bookmarks} bookmarks (skipped ${r.skipped}), ${r.categories} categories` +
					(r.settingsFilled ? `; added ${r.settingsFilled} settings` : ""),
			);
		},
		onError: (e) => toast.error(e.message),
	});
}

// Download a JSON backup using fetch + Blob; navigation downloads are intercepted by the SPA fallback.
export function useDownloadBackup() {
	return useMutation({
		mutationFn: async () => {
			const res = await client.api.admin.backup.$get();
			if (!res.ok) throw new Error("Download failed. Please try again.");
			const blob = await res.blob();
			const filename =
				res.headers
					.get("Content-Disposition")
					?.match(/filename="([^"]+)"/)?.[1] ??
				`bookmark-nav-backup-${new Date().toISOString().slice(0, 10)}.json`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			return filename;
		},
		onSuccess: (filename) => toast.success(`Downloaded ${filename}`),
		onError: (e) => toast.error(e.message),
	});
}

export function useExportBookmarks() {
	return useMutation({
		mutationFn: async () => {
			// Use fetch + Blob because navigation downloads (<a href download>) are intercepted by the SPA fallback.
			// Otherwise the downloaded file is the frontend index.html rather than the bookmark export.
			const res = await client.api.admin.export.$get();
			if (!res.ok) throw new Error("Export failed. Please try again.");
			const blob = await res.blob();
			const filename =
				res.headers
					.get("Content-Disposition")
					?.match(/filename="([^"]+)"/)?.[1] ??
				`bookmarks-${new Date().toISOString().slice(0, 10)}.html`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			return filename;
		},
		onSuccess: (filename) => toast.success(`Exported ${filename}`),
		onError: (e) => toast.error(e.message),
	});
}

export function useBackupNow() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const res = await client.api.admin.backup.$post();
			if (!res.ok) throw new Error("Backup failed");
			return res.json();
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["admin-settings"] });
			toast.success("Backed up to R2 storage");
		},
		onError: (e) => toast.error(e.message),
	});
}

// Run a full link check immediately, independent of the schedule and enable switch.
export function useRunLinkCheck() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const res = await client.api.admin.maintenance["check-links"].$post();
			if (!res.ok) throw new Error("Check failed. Please try again.");
			return res.json();
		},
		onSuccess: async (r) => {
			await qc.invalidateQueries({ queryKey: ["admin-bookmarks"] });
			toast.success(
				`Check complete: ${r.total} bookmarks; broken: ${r.dead}` +
					(r.revived ? `; restored: ${r.revived}` : ""),
			);
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useAdminSettings() {
	return useQuery({
		queryKey: ["admin-settings"],
		queryFn: async () => {
			const res = await client.api.admin.settings.$get();
			if (!res.ok) throw new Error("Could not load settings");
			return res.json() as Promise<Record<string, string>>;
		},
	});
}

export function useSaveSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (data: Record<string, string>) => {
			const res = await client.api.admin.settings.$put({ json: data });
			if (!res.ok) throw new Error("Could not save");
		},
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["admin-settings"] }),
				qc.invalidateQueries({ queryKey: ["site-settings"] }),
				// Invalidate public AI settings so returning to the home page shows changes without a manual refresh.
				qc.invalidateQueries({ queryKey: ["ai-config"] }),
			]);
			toast.success("Saved");
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useChangePassword() {
	return useMutation({
		mutationFn: async (data: { oldPassword: string; newPassword: string }) => {
			const res = await client.api.auth["change-password"].$post({ json: data });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Update failed");
			}
		},
		onSuccess: () => toast.success("Password updated"),
		onError: (e) => toast.error(e.message),
	});
}

export function useChangeUsername() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (data: { username: string; password: string }) => {
			const res = await client.api.auth["change-username"].$post({ json: data });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Update failed");
			}
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["auth-status"] });
			toast.success("Username updated");
		},
		onError: (e) => toast.error(e.message),
	});
}

export type AIUsageFeatureStat = {
	feature: string;
	total: number;
	success: number;
};
export type AIUsageProviderStat = { provider: string; total: number };
export type AIUsageError = {
	feature: string;
	provider: string;
	error: string | null;
	createdAt: number;
};
export type AIUsage = {
	today: {
		total: number;
		success: number;
		failed: number;
		successRate: number;
		avgDurationMs: number;
	};
	byFeature: AIUsageFeatureStat[];
	byProvider: AIUsageProviderStat[];
	recentErrors: AIUsageError[];
};

export function useAIUsage() {
	return useQuery<AIUsage>({
		queryKey: ["admin-ai-usage"],
		queryFn: async () => {
			const res = await client.api.admin["ai-usage"].$get();
			if (!res.ok) throw new Error("Could not load AI usage");
			return res.json();
		},
		refetchInterval: 30_000,
	});
}

export type AITestConfig = {
	provider: "builtin" | "custom";
	apiEndpoint?: string;
	apiKey?: string;
	model: string;
};

// Browser extension access token
export type ApiTokenStatus = {
	exists: boolean;
	hint: string | null;
	createdAt: number | null;
};
export type ApiTokenCreated = {
	token: string;
	hint: string;
};

export function useApiToken() {
	return useQuery({
		queryKey: ["admin-api-token"],
		queryFn: async () => {
			const res = await client.api.admin.token.$get();
			if (!res.ok) throw new Error("Could not load token status");
			return res.json();
		},
	});
}

export function useCreateApiToken() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const res = await client.api.admin.token.$post();
			if (!res.ok) throw new Error("Could not generate token");
			return res.json();
		},
		onSuccess: async (data) => {
			await qc.invalidateQueries({ queryKey: ["admin-api-token"] });
			toast.success("Token generated. Copy and save it now.");
			return data;
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useRevokeApiToken() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const res = await client.api.admin.token.$delete();
			if (!res.ok) throw new Error("Could not revoke token");
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["admin-api-token"] });
			toast.success("Token revoked");
		},
		onError: (e) => toast.error(e.message),
	});
}

export function useTestAI() {
	return useMutation({
		mutationFn: async (cfg: AITestConfig) => {
			const res = await client.api.admin["ai-test"].$post({ json: cfg });
			const body = (await res.json().catch(() => null)) as
				| { ok: true }
				| { ok: false; error?: string }
				| null;
			if (!res.ok || !body?.ok) {
				throw new Error(body && "error" in body && body.error ? body.error : "Check failed");
			}
			return body;
		},
	});
}
