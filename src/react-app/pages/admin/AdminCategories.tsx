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
import { GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { flattenCategoryTree, type Category, type FlatCategory } from "@/lib/api";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import {
	useAdminCategories,
	useBatchDeleteCategories,
	useDeleteCategory,
	useReorderCategories,
	useSaveCategory,
	type CategoryPayload,
} from "@/lib/admin-queries";

function CategoryDialog({
	category,
	flatCategories,
	open,
	onOpenChange,
}: {
	category: Category | null;
	flatCategories: FlatCategory[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const save = useSaveCategory();
	const [form, setForm] = useState<CategoryPayload>({ name: "" });

	// Exclude the category and its descendants as parents, and enforce three levels including the moved subtree.
	const parentOptions = (() => {
		// Height of the edited category subtree (1 for a new category).
		let subtreeHeight = 1;
		const excluded = new Set<number>();
		if (category) {
			excluded.add(category.id);
			const idx = flatCategories.findIndex(({ category: c }) => c.id === category.id);
			const base = idx >= 0 ? flatCategories[idx].depth : 0;
			for (let i = idx + 1; i >= 0 && i < flatCategories.length; i++) {
				if (flatCategories[i].depth <= base) break;
				excluded.add(flatCategories[i].category.id);
				subtreeHeight = Math.max(subtreeHeight, flatCategories[i].depth - base + 1);
			}
		}
		return flatCategories.filter(
			({ category: c, depth }) =>
				!excluded.has(c.id) && depth + 1 + subtreeHeight <= 3,
		);
	})();

	// Initialize the form when the parent opens the dialog; onOpenChange is not called for this.
	// Derive state during render to avoid an extra render and the lint restriction on effect-based updates.
	const [resetToken, setResetToken] = useState({ open, category });
	if (resetToken.open !== open || resetToken.category !== category) {
		setResetToken({ open, category });
		if (open) {
			setForm(
				category
					? {
							name: category.name,
							icon: category.icon,
							parentId: category.parentId,
							visibility: category.visibility,
						}
					: { name: "", parentId: null, visibility: "public" },
			);
		}
	}

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		try {
			await save.mutateAsync({ id: category?.id, data: form });
			onOpenChange(false);
		} catch {
			// Keep the dialog open on failure; the mutation onError displays the error.
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>{category ? "Edit category" : "Add category"}</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="cat-name">Name</Label>
						<Input
							id="cat-name"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label>Parent category</Label>
						<Select
							value={form.parentId != null ? String(form.parentId) : "none"}
							onValueChange={(v) =>
								setForm({ ...form, parentId: v === "none" ? null : Number(v) })
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Top-level category</SelectItem>
								{parentOptions.map(({ category: c, path }) => (
									<SelectItem key={c.id} value={String(c.id)}>
										{path}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="cat-icon">Icon (emoji or blank)</Label>
						<Input
							id="cat-icon"
							value={form.icon ?? ""}
							onChange={(e) => setForm({ ...form, icon: e.target.value || null })}
							placeholder="🛠"
						/>
					</div>
					<label className="flex items-center gap-2 text-sm">
						<Switch
							checked={form.visibility === "private"}
							onCheckedChange={(v) =>
								setForm({ ...form, visibility: v ? "private" : "public" })
							}
						/>
						Private category (visible only when signed in)
					</label>
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

function SortableCategoryRow({
	category,
	depth,
	selected,
	onToggleSelect,
	onEdit,
	onDelete,
}: {
	category: Category;
	depth: number;
	selected: boolean;
	onToggleSelect: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: category.id });
	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				paddingLeft: `${16 + depth * 24}px`,
			}}
			className={`flex items-center gap-3 border-b py-3 pr-4 last:border-b-0 ${
				isDragging ? "relative z-10 bg-muted" : "bg-background"
			}`}
		>
			<Checkbox
				checked={selected}
				onCheckedChange={onToggleSelect}
				aria-label="Select"
			/>
			<span className="cursor-grab" {...attributes} {...listeners}>
				<GripVertical className="size-4 text-muted-foreground" />
			</span>
			{category.icon && <span>{category.icon}</span>}
			<span className="font-medium">{category.name}</span>
			{category.visibility === "private" && (
				<Lock className="size-3.5 text-muted-foreground" />
			)}
			<div className="ml-auto flex gap-1">
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
		</div>
	);
}

export default function AdminCategories() {
	const { data, isLoading } = useAdminCategories();
	const del = useDeleteCategory();
	const batchDel = useBatchDeleteCategories();
	const reorder = useReorderCategories();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<Category | null>(null);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

	const categories: Category[] = useMemo(
		() => (data?.categories ?? []) as Category[],
		[data],
	);
	// Flatten the tree with indentation; dragging changes the relative order within a level.
	const flat = useMemo(() => flattenCategoryTree(categories), [categories]);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	function handleDragEnd(e: DragEndEvent) {
		const { active, over } = e;
		if (!over || active.id === over.id) return;
		const ordered = flat.map((f) => f.category);
		const oldIndex = ordered.findIndex((c) => c.id === active.id);
		const newIndex = ordered.findIndex((c) => c.id === over.id);
		reorder.mutate(arrayMove(ordered, oldIndex, newIndex).map((c) => c.id));
	}

	const allSelected = flat.length > 0 && flat.every(({ category: c }) => selected.has(c.id));

	function toggleSelect(id: number) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleSelectAll() {
		setSelected(allSelected ? new Set() : new Set(flat.map((f) => f.category.id)));
	}

	function handleBatchDelete() {
		setConfirmState({
			title: `Delete the selected ${selected.size} categories?`,
			description: "Child categories will also be deleted. Their bookmarks will become uncategorized.",
			onConfirm: () =>
				batchDel.mutate([...selected], { onSuccess: () => setSelected(new Set()) }),
		});
	}

	return (
		<div className="mx-auto max-w-2xl">
			{/* Action toolbar. */}
			<div className="mb-4 flex items-center justify-end">
				<Button
					onClick={() => {
						setEditing(null);
						setDialogOpen(true);
					}}
				>
					<Plus className="size-4" /> Add category
				</Button>
			</div>

			{/* Bulk actions. */}
			{selected.size > 0 && (
				<div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/50 px-4 py-2">
					<span className="text-sm font-medium">{selected.size} selected</span>
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

			<div className="overflow-hidden rounded-xl border">
				{/* Select all. */}
				{flat.length > 0 && (
					<label className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
						<Checkbox
							checked={
								allSelected ? true : selected.size > 0 ? "indeterminate" : false
							}
							onCheckedChange={toggleSelectAll}
							aria-label="Select all"
						/>
						Select all
					</label>
				)}
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={flat.map((f) => f.category.id)}
						strategy={verticalListSortingStrategy}
					>
						{flat.map(({ category: c, depth }) => (
							<SortableCategoryRow
								key={c.id}
								category={c}
								depth={depth}
								selected={selected.has(c.id)}
								onToggleSelect={() => toggleSelect(c.id)}
								onEdit={() => {
									setEditing(c);
									setDialogOpen(true);
								}}
								onDelete={() => {
									setConfirmState({
										title: `Delete category “${c.name}”?`,
										description: "Child categories will also be deleted. Their bookmarks will become uncategorized.",
										onConfirm: () => del.mutate(c.id),
									});
								}}
							/>
						))}
					</SortableContext>
				</DndContext>
				{isLoading && (
					<p className="py-10 text-center text-muted-foreground">Loading…</p>
				)}
				{!isLoading && categories.length === 0 && (
					<p className="py-10 text-center text-muted-foreground">No categories yet</p>
				)}
			</div>

			<CategoryDialog
				category={editing}
				flatCategories={flat}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
			/>
			<ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
		</div>
	);
}
