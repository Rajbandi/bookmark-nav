import { useEffect, useMemo, useState } from "react";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { Switch } from "@app/components/ui/switch";
import {
	ApiError,
	aiAutoFill,
	createBookmark,
	flattenCategoryTree,
	fetchAIConfig,
	fetchBookmarks,
	fetchCategories,
	type Bookmark,
	type Category,
} from "../../lib/api";
import { loadConfig } from "../../lib/config";

type Status = "loading" | "unconfigured" | "ready" | "saved";

export default function App() {
	const [status, setStatus] = useState<Status>("loading");
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [siteUrl, setSiteUrl] = useState("");
	const [tab, setTab] = useState<{ url: string; title: string } | null>(null);
	const [flatCategories, setFlatCategories] = useState<ReturnType<typeof flattenCategoryTree>>([]);
	const [existing, setExisting] = useState<Bookmark[]>([]);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [tags, setTags] = useState("");
	const [categoryId, setCategoryId] = useState<string>("none");
	const [isPrivate, setIsPrivate] = useState(false);
	const [saving, setSaving] = useState(false);
	// Show AI autofill only when AI is enabled on the site (aiEnabled).
	const [aiEnabled, setAiEnabled] = useState(false);
	const [aiLoading, setAiLoading] = useState(false);
	const [aiError, setAiError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			const cfg = await loadConfig();
			if (!cfg) {
				setStatus("unconfigured");
				return;
			}
			setSiteUrl(cfg.siteUrl);
			try {
				const [tabs, categories, bookmarkRes, aiCfg] = await Promise.all([
					chrome.tabs.query({ active: true, currentWindow: true }),
					fetchCategories(),
					fetchBookmarks(),
					// Handle AI availability separately so a failure does not prevent bookmarking.
					fetchAIConfig().catch(() => ({ aiEnabled: false })),
				]);
				const url = tabs[0]?.url;
				if (!url || !/^https?:/.test(url)) {
					setErrorMsg("This page cannot be bookmarked because it is not a standard web page.");
					return;
				}
				const tabInfo = { url, title: tabs[0]?.title ?? url };
				setTab(tabInfo);
				setFlatCategories(flattenCategoryTree(categories as Category[]));
				setAiEnabled(!!aiCfg.aiEnabled);
				setExisting(bookmarkRes.bookmarks as Bookmark[]);
				// Prefill the title, removing common site-name suffixes from browser titles.
				setTitle(tabInfo.title.replace(/ [-–—|] [^|]*$/, "").trim());
				setStatus("ready");
			} catch (err) {
				setErrorMsg(err instanceof Error ? err.message : "Could not load");
			}
		})();
	}, []);

	const duplicate = useMemo(
		() => (tab ? existing.find((b) => b.url === tab.url) : undefined),
		[existing, tab],
	);

	async function handleSave() {
		if (!tab) return;
		setSaving(true);
		try {
			await createBookmark({
				title: title.trim() || tab.url,
				url: tab.url,
				description: description.trim() || null,
				categoryId: categoryId === "none" ? null : Number(categoryId),
				visibility: isPrivate ? "private" : "public",
				tags: tags
					.split(/[,，]/)
					.map((t) => t.trim())
					.filter(Boolean),
			});
			setStatus("saved");
		} catch (err) {
			setErrorMsg(err instanceof ApiError ? err.message : "Could not save bookmark. Please try again.");
		} finally {
			setSaving(false);
		}
	}

	// Fetch the title, description, tags, and category in one AI request.
	async function handleAIFill() {
		if (!tab) return;
		setAiLoading(true);
		setAiError(null);
		try {
			const res = await aiAutoFill(tab.url);
			if (res.title) setTitle(res.title);
			if (res.description) setDescription(res.description);
			if (Array.isArray(res.tags) && res.tags.length) setTags(res.tags.join(", "));
			if (res.categoryId != null) setCategoryId(String(res.categoryId));
		} catch (err) {
			setAiError(err instanceof ApiError ? err.message : "AI analysis failed. Please try again later.");
		} finally {
			setAiLoading(false);
		}
	}

	function openAdmin() {
		chrome.tabs.create({ url: `${siteUrl}/admin` });
	}

	if (status === "loading") return <Shell>Loading…</Shell>;

	if (errorMsg) {
		return (
			<Shell>
				<p className="text-sm text-destructive">{errorMsg}</p>
				<Button variant="outline" className="mt-3 w-full" onClick={() => openAdmin()}>
					Open admin to check
				</Button>
			</Shell>
		);
	}

	if (status === "unconfigured") {
		return (
			<Shell>
				<p className="text-sm text-muted-foreground">Set your site URL and access token before using the extension.</p>
				<Button className="mt-3 w-full" onClick={() => chrome.runtime.openOptionsPage()}>
					Open settings
				</Button>
			</Shell>
		);
	}

	if (status === "saved") {
		return (
			<Shell>
				<div className="flex flex-col items-center gap-2 py-6">
					<span className="text-3xl">✅</span>
					<p className="text-sm font-medium">Saved to Bookmark Nav</p>
					{duplicate && <p className="text-xs text-muted-foreground">(This URL was already bookmarked.)</p>}
				</div>
				<div className="flex gap-2">
					<Button className="flex-1" onClick={() => window.close()}>
						Done
					</Button>
					<Button variant="outline" className="flex-1" onClick={openAdmin}>
						Open admin
					</Button>
				</div>
			</Shell>
		);
	}

	return (
		<Shell>
			{duplicate && (
				<div className="mb-3 rounded-md bg-amber-100 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
					⚠️ This URL is already bookmarked. Saving again will create a duplicate.
				</div>
			)}
			{aiEnabled && (
				<div className="mb-3">
					<Button
						type="button"
						variant="outline"
						className="w-full"
						disabled={aiLoading}
						onClick={() => void handleAIFill()}
					>
						{aiLoading ? "Analyzing with AI…" : "✨ AI autofill"}
					</Button>
					{aiError && <p className="mt-1.5 text-xs text-destructive">{aiError}</p>}
				</div>
			)}
			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor="ext-title">Title</Label>
					<Input
						id="ext-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						maxLength={200}
					/>
					<p className="truncate text-xs text-muted-foreground">{tab?.url}</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ext-category">Category</Label>
					{/* Use a native select because Radix positioning is unreliable in the constrained extension popup. */}
					<select
						id="ext-category"
						value={categoryId}
						onChange={(e) => setCategoryId(e.target.value)}
						className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
					>
						<option value="none">Uncategorized</option>
						{flatCategories.map(({ category, path, depth }) => (
							<option key={category.id} value={String(category.id)}>
								{"　".repeat(depth)}
								{path}
								{category.visibility === "private" ? " 🔒" : ""}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ext-tags">Tags (comma-separated, optional)</Label>
					<Input
						id="ext-tags"
						value={tags}
						onChange={(e) => setTags(e.target.value)}
						placeholder="tools, documentation"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ext-desc">Description (optional)</Label>
					<Input
						id="ext-desc"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						maxLength={500}
					/>
				</div>
				<div className="flex items-center justify-between rounded-lg border px-3 py-2">
					<div>
						<Label>Private bookmark</Label>
						<p className="text-xs text-muted-foreground">Visible only when signed in</p>
					</div>
					<Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
				</div>
				<Button className="w-full" disabled={saving || !title.trim()} onClick={handleSave}>
					{saving ? "Saving…" : duplicate ? "Save anyway" : "Save bookmark"}
				</Button>
			</div>
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="w-[360px] p-4">
			<div className="mb-3 flex items-center justify-between">
				<h1 className="text-sm font-semibold">Bookmark Nav</h1>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs text-muted-foreground"
					onClick={() => chrome.runtime.openOptionsPage()}
				>
					Settings
				</Button>
			</div>
			{children}
		</div>
	);
}


