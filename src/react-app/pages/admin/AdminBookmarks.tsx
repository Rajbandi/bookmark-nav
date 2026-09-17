import { useMemo, useState, type FormEvent } from "react";
import {
	DndContext,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, HeartPulse, Lock, Pencil, Pin, Plus, Trash2, Wand2, Globe } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { flattenCategoryTree, type Bookmark, type Category } from "@/lib/api";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { BookmarkFavicon } from "@/components/bookmark-favicon";
import {
	useAdminBookmarks,
	useAdminCategories,
	useAdminSettings,
	useBatchDeleteBookmarks,
	useBatchMoveBookmarks,
	useCheckDeadLinks,
	useDeleteBookmark,
	useFetchMetadata,
	useFetchMetadataAI,
	useReorderBookmarks,
	useRepairLink,
	useSummarize,
	useSaveBookmark,
	type BookmarkPayload,
} from "@/lib/admin-queries";

// Dialog for creating and editing bookmarks.
function BookmarkDialog({
	bookmark,
	categories,
	open,
	onOpenChange,
	aiEnabled,
	aiAutoFill,
}: {
	bookmark: Bookmark | null;
	categories: Category[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	aiEnabled: boolean;
	aiAutoFill: boolean;
}) {
	const save = useSaveBookmark();
	const fetchMeta = useFetchMetadata();
	const fetchMetaAI = useFetchMetadataAI();
	const [form, setForm] = useState<BookmarkPayload>({ title: "", url: "" });
	const flatCats = flattenCategoryTree(categories);

	// Initialize the form when the parent opens the dialog; onOpenChange is not called for this.
	// Derive state during render to avoid an extra render and the lint restriction on effect-based updates.
	const [resetToken, setResetToken] = useState({ open, bookmark });
	if (resetToken.open !== open || resetToken.bookmark !== bookmark) {
		setResetToken({ open, bookmark });
		if (open) {
			setForm(
				bookmark
					? {
							title: bookmark.title,
							url: bookmark.url,
							description: bookmark.description,
							icon: bookmark.icon,
							categoryId: bookmark.categoryId,
							isPinned: bookmark.isPinned,
							visibility: bookmark.visibility,
							tags: bookmark.tags,
						}
					: { title: "", url: "", visibility: "public" },
			);
		}
	}

	async function handleFetchMeta() {
		if (!form.url) return;
		const meta = await fetchMeta.mutateAsync(form.url);
		setForm((f) => ({
			...f,
			title: f.title || meta.title || "",
			description: f.description || meta.description,

		}));
	}

	async function handleFetchMetaAI() {
		if (!form.url) return;
		const meta = await fetchMetaAI.mutateAsync(form.url);
		setForm((f) => ({
			...f,
			title: f.title || meta.title || "",
			description: f.description || meta.description,

			tags: f.tags?.length ? f.tags : meta.tags,
			categoryId: f.categoryId != null ? f.categoryId : (meta.categoryId ?? null),
		}));
	}


	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		try {
			await save.mutateAsync({ id: bookmark?.id, data: form });
			onOpenChange(false);
		} catch {
			// Keep the dialog open on failure; the mutation onError displays the error.
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{bookmark ? "Edit bookmark" : "Add bookmark"}</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="bm-url">URL</Label>
						<div className="flex gap-2">
							<Input
								id="bm-url"
								type="url"
								value={form.url}
								onChange={(e) => setForm({ ...form, url: e.target.value })}
								placeholder="https://…"
								required
							/>
							{aiEnabled && aiAutoFill && (
								<Button
									type="button"
									onClick={handleFetchMetaAI}
									disabled={!form.url || fetchMetaAI.isPending}
									title="Use AI to extract the title, description, tags, and icon"
								>
									<Wand2 className="size-4" />
									{fetchMetaAI.isPending ? "Analyzing with AI…" : "AI autofill"}
								</Button>
							)}
							<Button
								type="button"
								variant="outline"
								onClick={handleFetchMeta}
								disabled={!form.url || fetchMeta.isPending}
								title="Fetch the title, description, and icon automatically"
							>
								<Globe className="size-4" />
								{fetchMeta.isPending ? "Fetching…" : "Fetch"}
							</Button>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="bm-title">Title</Label>
						<Input
							id="bm-title"
							value={form.title}
							onChange={(e) => setForm({ ...form, title: e.target.value })}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="bm-desc">Description</Label>
						<Textarea
							id="bm-desc"
							value={form.description ?? ""}
							onChange={(e) => setForm({ ...form, description: e.target.value })}
							rows={2}
							/>
							</div>
							<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
							<Label>Category</Label>
							<Select
								value={form.categoryId != null ? String(form.categoryId) : "none"}
								onValueChange={(v) =>
									setForm({ ...form, categoryId: v === "none" ? null : Number(v) })
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Uncategorized</SelectItem>
									{flatCats.map(({ category: c, path }) => (
										<SelectItem key={c.id} value={String(c.id)}>
											{path}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							</div>
							<div className="space-y-2">
							<Label htmlFor="bm-tags">Tags (comma-separated)</Label>
							<Input
								id="bm-tags"
								value={(form.tags ?? []).join(", ")}
								onChange={(e) =>
									setForm({
										...form,
										tags: e.target.value
											.split(/[,，]/)
											.map((t) => t.trim())
											.filter(Boolean),
									})
								}
								placeholder="tools, documentation"
							/>
							</div>
							</div>
					<div className="space-y-2">
						<Label htmlFor="bm-icon">Icon URL (leave blank to use Site settings → Icons)</Label>
						<Input
							id="bm-icon"
							value={form.icon ?? ""}
							onChange={(e) => setForm({ ...form, icon: e.target.value || null })}
						/>
					</div>
					<div className="flex items-center gap-6">
						<label className="flex items-center gap-2 text-sm">
							<Switch
								checked={form.visibility === "private"}
								onCheckedChange={(v) =>
									setForm({ ...form, visibility: v ? "private" : "public" })
								}
							/>
							Private (visible only when signed in)
						</label>
						<label className="flex items-center gap-2 text-sm">
							<Switch
								checked={!!form.isPinned}
								onCheckedChange={(v) => setForm({ ...form, isPinned: v })}
							/>
							Pinned
						</label>
					</div>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending}>
							{save.isPending ? "Saving…" : "Save"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Draggable table row.
function SortableRow({
	bookmark,
	categoryName,
	selected,
	onToggleSelect,
	onEdit,
	onDelete,
	onRepair,
	aiDeadLinkRepair,
	repairPending,
	onSummarize,
	aiSummary,
	summarizePending,
	iconService,
}: {
	bookmark: Bookmark;
	categoryName: string;
	selected: boolean;
	onToggleSelect: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onRepair: () => void;
	aiDeadLinkRepair: boolean;
	repairPending: boolean;
	onSummarize: () => void;
	aiSummary: boolean;
	summarizePending: boolean;
	iconService?: string;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: bookmark.id });
	return (
		<TableRow
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={isDragging ? "relative z-10 bg-muted" : undefined}
		>
			<TableCell className="w-8">
				<Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select" />
			</TableCell>
			<TableCell className="w-8 cursor-grab" {...attributes} {...listeners}>
				<GripVertical className="size-4 text-muted-foreground" />
			</TableCell>
			<TableCell>
				<div className="flex items-center gap-2">
					<BookmarkFavicon
						bookmark={bookmark}
						iconService={iconService}
						className="size-4 shrink-0"
					/>
					<span className="max-w-52 truncate font-medium">{bookmark.title}</span>
					{bookmark.status === "dead" && (
						<Badge variant="destructive" className="shrink-0 px-1.5 py-0 text-xs">
							Broken link
						</Badge>
					)}
					{bookmark.isPinned && <Pin className="size-3.5 shrink-0 text-amber-500" />}
					{bookmark.visibility === "private" && (
						<Lock className="size-3.5 shrink-0 text-muted-foreground" />
					)}
				</div>
				<div className="max-w-72 truncate text-xs text-muted-foreground">
					{bookmark.url}
				</div>
			</TableCell>
			<TableCell>{categoryName}</TableCell>
			<TableCell>
				<div className="flex max-w-40 flex-wrap gap-1">
					{bookmark.tags.map((t) => (
						<Badge key={t} variant="secondary" className="px-1.5 py-0 text-xs">
							{t}
						</Badge>
					))}
				</div>
			</TableCell>
			<TableCell className="text-center">{bookmark.clickCount}</TableCell>
			<TableCell>
				<div className="flex justify-end gap-1">
					{aiSummary && (
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onSummarize}
							disabled={summarizePending}
							aria-label="AI summary"
							title="Generate a summary with AI"
						>
							<Wand2 className="size-4 text-sky-500" />
						</Button>
					)}
					{bookmark.status === "dead" && aiDeadLinkRepair && (
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onRepair}
							disabled={repairPending}
							aria-label="AI repair"
							title="Suggest an alternative URL with AI"
						>
							<Wand2 className="size-4 text-orange-500" />
						</Button>
					)}
					<Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit">
						<Pencil className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						className="text-destructive"
						onClick={onDelete}
						aria-label="Delete"
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}

export default function AdminBookmarks() {
	const { data, isLoading } = useAdminBookmarks();
	const { data: catData } = useAdminCategories();
	const { data: settings } = useAdminSettings();
	const del = useDeleteBookmark();
	const reorder = useReorderBookmarks();
	const batchMove = useBatchMoveBookmarks();
	const batchDel = useBatchDeleteBookmarks();
	const checkLinks = useCheckDeadLinks();
	const repairLink = useRepairLink();
	const summarize = useSummarize();
	const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(
		null,
	);
	const [repairResult, setRepairResult] = useState<{
		title: string;
		url: string;
		alternative: string | null;
		wayback: string;
		reason: string;
	} | null>(null);
	const [summaryResult, setSummaryResult] = useState<{
		title: string;
		url: string;
		summary: string;
	} | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<Bookmark | null>(null);
	const [filterCat, setFilterCat] = useState<string>("all");
	const [onlyDead, setOnlyDead] = useState(false);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

	// Keep references stable with useMemo so downstream memoization is not invalidated on every render.
	const categories: Category[] = useMemo(
		() => (catData?.categories ?? []) as Category[],
		[catData],
	);
	// Flatten categories and show full paths in selectors and tables.
	const flatCats = useMemo(() => flattenCategoryTree(categories), [categories]);
	const catName = useMemo(
		() => new Map(flatCats.map(({ category: c, path }) => [c.id, path])),
		[flatCats],
	);

	const bookmarks: Bookmark[] = useMemo(() => {
		let all = (data?.bookmarks ?? []) as Bookmark[];
		if (onlyDead) all = all.filter((b) => b.status === "dead");
		if (filterCat === "all") return all;
		if (filterCat === "none") return all.filter((b) => b.categoryId === null);
		return all.filter((b) => b.categoryId === Number(filterCat));
	}, [data, filterCat, onlyDead]);

	const deadCount = useMemo(
		() => ((data?.bookmarks ?? []) as Bookmark[]).filter((b) => b.status === "dead").length,
		[data],
	);

	// Check all bookmarks in batches and show progress on the button.
	function handleCheckLinks() {
		const ids = ((data?.bookmarks ?? []) as Bookmark[]).map((b) => b.id);
		if (ids.length === 0 || checkLinks.isPending) return;
		setCheckProgress({ done: 0, total: ids.length });
		checkLinks.mutate(
			{ ids, onProgress: (done, total) => setCheckProgress({ done, total }) },
			{ onSettled: () => setCheckProgress(null) },
		);
	}

	async function handleRepair(b: Bookmark) {
		try {
			const r = await repairLink.mutateAsync({ title: b.title, url: b.url });
			setRepairResult({ title: b.title, url: b.url, ...r });
		} catch {
			// The mutation onError already displays the error.
		}
	}

	async function handleSummarize(b: Bookmark) {
		try {
			const r = await summarize.mutateAsync({
				title: b.title,
				description: b.description ?? undefined,
				url: b.url,
			});
			setSummaryResult({ title: b.title, url: b.url, summary: r.summary });
		} catch {
			// The mutation onError already displays the error.
		}
	}

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	// Count selected items in the current results to determine the header checkbox state.
	const selectedInView = bookmarks.filter((b) => selected.has(b.id)).length;

	function toggleSelect(id: number) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	// Select all and clear selection apply only to the current filtered results.
	function toggleSelectAll() {
		setSelected((prev) => {
			const next = new Set(prev);
			if (selectedInView === bookmarks.length) {
				for (const b of bookmarks) next.delete(b.id);
			} else {
				for (const b of bookmarks) next.add(b.id);
			}
			return next;
		});
	}

	function handleBatchMove(v: string) {
		batchMove.mutate(
			{ ids: [...selected], categoryId: v === "none" ? null : Number(v) },
			{ onSuccess: () => setSelected(new Set()) },
		);
	}

	function handleBatchDelete() {
		setConfirmState({
			title: `Delete the selected ${selected.size} bookmarks?`,
			description: "This cannot be undone.",
			onConfirm: () =>
				batchDel.mutate([...selected], { onSuccess: () => setSelected(new Set()) }),
		});
	}

	function handleDragEnd(e: DragEndEvent) {
		const { active, over } = e;
		if (!over || active.id === over.id) return;
		// Reorder using the full list because bookmarks contains only the filtered subset.
		// Writing the subset directly would move it to the front and disrupt other bookmarks.
		const all = (data?.bookmarks ?? []) as Bookmark[];
		const from = all.find((b) => b.id === active.id);
		const to = all.find((b) => b.id === over.id);
		if (!from || !to) return;
		// The backend sorts by pinned status before sort order, so reject dragging between these groups.
		if (from.isPinned !== to.isPinned) {
			toast.warning("Pinned and unpinned bookmarks must be sorted separately.");
			return;
		}
		const oldIndex = all.findIndex((b) => b.id === active.id);
		const newIndex = all.findIndex((b) => b.id === over.id);
		reorder.mutate(arrayMove(all, oldIndex, newIndex).map((b) => b.id));
	}

	return (
		<div className="mx-auto max-w-5xl">
			{/* Action toolbar. */}
			<div className="mb-4 flex flex-wrap items-center justify-end gap-3">
				<div className="flex flex-wrap items-center gap-2">
					{deadCount > 0 && (
						<Button
							variant={onlyDead ? "destructive" : "outline"}
							size="sm"
							onClick={() => setOnlyDead((v) => !v)}
						>
							Broken link {deadCount}
						</Button>
					)}
					<Button
						variant="outline"
						onClick={handleCheckLinks}
						disabled={checkLinks.isPending || isLoading}
					>
						<HeartPulse className="size-4" />
						{checkProgress ? "Checking…" : "Check broken links"}
					</Button>
					<Select value={filterCat} onValueChange={setFilterCat}>
						<SelectTrigger className="w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All categories</SelectItem>
							<SelectItem value="none">Uncategorized</SelectItem>
							{flatCats.map(({ category: c, path }) => (
								<SelectItem key={c.id} value={String(c.id)}>
									{path}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						onClick={() => {
							setEditing(null);
							setDialogOpen(true);
						}}
					>
						<Plus className="size-4" /> Add bookmark
					</Button>
				</div>
			</div>

			{/* Latest scheduled link check result. Configure the initially disabled task on Scheduled tasks. */}
			{settings?.["deadLink.lastRun"] && (
				<div className="mb-2 flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2">
					<p className="text-xs text-muted-foreground">
						Last automatic check:{" "}
						{new Date(settings["deadLink.lastRun"]).toLocaleString("en-US")}
						; broken links found: {settings["deadLink.dead"] ?? 0}
					</p>
				</div>
			)}

			{/* Show bulk actions when items are selected. */}
			{selected.size > 0 && (
				<div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/50 px-4 py-2">
					<span className="text-sm font-medium">{selected.size} selected</span>
					<Select value="" onValueChange={handleBatchMove}>
						<SelectTrigger className="h-8 w-40" disabled={batchMove.isPending}>
							<SelectValue placeholder="Move to category…" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">Uncategorized</SelectItem>
							{flatCats.map(({ category: c, path }) => (
								<SelectItem key={c.id} value={String(c.id)}>
									{path}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						variant="destructive"
						size="sm"
						onClick={handleBatchDelete}
						disabled={batchDel.isPending}
					>
						<Trash2 className="size-4" />
						{batchDel.isPending ? "Deleting…" : "Delete"}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
						Clear selection
					</Button>
				</div>
			)}

			{/* Link check progress. */}
			{checkProgress && (
				<div className="mb-4 flex items-center gap-3 rounded-xl border bg-background px-4 py-3">
					<Progress
						value={(checkProgress.done / checkProgress.total) * 100}
						className="flex-1"
					/>
					<span className="shrink-0 text-sm tabular-nums text-muted-foreground">
						{checkProgress.done}/{checkProgress.total}
					</span>
				</div>
			)}

			<div className="rounded-xl border bg-background">
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8">
									<Checkbox
										checked={
											bookmarks.length > 0 && selectedInView === bookmarks.length
												? true
												: selectedInView > 0
													? "indeterminate"
													: false
										}
										onCheckedChange={toggleSelectAll}
										aria-label="Select all"
									/>
								</TableHead>
								<TableHead className="w-8" />
								<TableHead>Bookmarks</TableHead>
								<TableHead>Category</TableHead>
								<TableHead>Tags</TableHead>
								<TableHead className="text-center">Clicks</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<SortableContext
								items={bookmarks.map((b) => b.id)}
								strategy={verticalListSortingStrategy}
							>
								{bookmarks.map((b) => (
									<SortableRow
										key={b.id}
										bookmark={b}
										selected={selected.has(b.id)}
										onToggleSelect={() => toggleSelect(b.id)}
										categoryName={
											b.categoryId !== null
												? (catName.get(b.categoryId) ?? "-")
												: "Uncategorized"
										}
										onEdit={() => {
											setEditing(b);
											setDialogOpen(true);
										}}
										onDelete={() => {
											setConfirmState({
												title: `Delete “${b.title}”?`,
												description: "This cannot be undone.",
												onConfirm: () => del.mutate(b.id),
											});
										}}
										onRepair={() => handleRepair(b)}
										aiDeadLinkRepair={
											settings?.["ai.enabled"] === "true" &&
											settings?.["ai.features.deadLinkRepair"] === "true"
										}
										repairPending={repairLink.isPending}
										onSummarize={() => handleSummarize(b)}
										aiSummary={
											settings?.["ai.enabled"] === "true" &&
											settings?.["ai.features.summary"] === "true"
										}
summarizePending={summarize.isPending}
									iconService={settings?.["icon.service"]}
								/>
								))}
							</SortableContext>
						</TableBody>
					</Table>
				</DndContext>
				{isLoading && (
					<p className="py-10 text-center text-muted-foreground">Loading…</p>
				)}
				{!isLoading && bookmarks.length === 0 && (
					<p className="py-10 text-center text-muted-foreground">No bookmarks yet</p>
				)}
			</div>

			<BookmarkDialog
				bookmark={editing}
				categories={categories}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				aiEnabled={settings?.["ai.enabled"] === "true"}
				aiAutoFill={settings?.["ai.features.autoFill"] === "true"}
			/>
			<ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />

			<Dialog open={repairResult !== null} onOpenChange={(o) => !o && setRepairResult(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>AI broken link repair suggestions</DialogTitle>
					</DialogHeader>
					{repairResult && (
						<div className="space-y-3 text-sm">
							<div>
								<span className="text-muted-foreground">Title:</span>
								{repairResult.title}
							</div>
							<div>
								<span className="text-muted-foreground">Original URL:</span>
								<span className="break-all">{repairResult.url}</span>
							</div>
							<div>
								<span className="text-muted-foreground">Suggested alternative:</span>
								{repairResult.alternative ? (
									<a
										href={repairResult.alternative}
										target="_blank"
										rel="noreferrer"
										className="break-all text-primary underline"
									>
										{repairResult.alternative}
									</a>
								) : (
									<span className="text-muted-foreground">None found</span>
								)}
							</div>
							<div>
								<span className="text-muted-foreground">Archive URL:</span>
								<a
									href={repairResult.wayback}
									target="_blank"
									rel="noreferrer"
									className="break-all text-primary underline"
								>
									{repairResult.wayback}
								</a>
							</div>
							{repairResult.reason && (
								<p className="text-muted-foreground">{repairResult.reason}</p>
							)}
							<div className="flex justify-end gap-2 pt-1">
								<Button variant="outline" onClick={() => setRepairResult(null)}>
									Close
								</Button>
								{repairResult.alternative && (
									<Button
										onClick={() => {
											navigator.clipboard?.writeText(repairResult.alternative!);
											toast.success("Alternative URL copied");
										}}
									>
										Copy alternative URL
									</Button>
								)}
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>

			<Dialog
				open={summaryResult !== null}
				onOpenChange={(o) => !o && setSummaryResult(null)}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>AI content summary</DialogTitle>
					</DialogHeader>
					{summaryResult && (
						<div className="space-y-3 text-sm">
							<div>
								<span className="text-muted-foreground">Title:</span>
								{summaryResult.title}
							</div>
							<div>
								<span className="text-muted-foreground">URL:</span>
								<span className="break-all">{summaryResult.url}</span>
							</div>
							<div className="rounded-lg border bg-muted/50 p-3">
								{summaryResult.summary}
							</div>
							<div className="flex justify-end gap-2 pt-1">
								<Button variant="outline" onClick={() => setSummaryResult(null)}>
									Close
								</Button>
								<Button
									onClick={() => {
										navigator.clipboard?.writeText(summaryResult.summary);
										toast.success("Summary copied");
									}}
								>
									Copy summary
								</Button>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
