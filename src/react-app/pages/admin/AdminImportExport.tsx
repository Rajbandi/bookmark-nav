import { useRef } from "react";
import { FileJson, FileText, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	useDownloadBackup,
	useExportBookmarks,
	useImportBookmarks,
	useImportJson,
} from "@/lib/admin-queries";
import type { BackupImportPayload } from "../../../worker/routes/admin";

export default function AdminImportExport() {
	const fileRef = useRef<HTMLInputElement>(null);
	const importBookmarks = useImportBookmarks();
	const importJson = useImportJson();
	const exportBookmarks = useExportBookmarks();
	const downloadBackup = useDownloadBackup();

	async function handleFile(file: File | undefined) {
		if (!file) return;
		if (file.size > 20 * 1024 * 1024) {
			toast.error("File is too large (over 20 MB).");
			return;
		}
		const text = await file.text();
		// Route JSON backups to restore; import other files as browser bookmark HTML.
		if (file.name.endsWith(".json") || text.trimStart().startsWith("{")) {
			let payload: BackupImportPayload;
			try {
				payload = JSON.parse(text) as BackupImportPayload;
			} catch {
				toast.error("The file is not valid JSON.");
				return;
			}
			importJson.mutate(payload);
		} else {
			importBookmarks.mutate(text);
		}
		// Clear the input so the same file can be selected again.
		if (fileRef.current) fileRef.current.value = "";
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Upload className="size-4" /> Import bookmarks
					</CardTitle>
					<CardDescription>
						Import bookmark HTML exported by Chrome, Edge, or Firefox, or a JSON backup from this application. JSON restores bookmarks, categories, and tags, and fills in missing site settings. Folder nesting is preserved and duplicate URLs are skipped, so files can be imported again safely.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<input
						ref={fileRef}
						type="file"
						accept=".html,.htm,.json,text/html,application/json"
						className="hidden"
						onChange={(e) => handleFile(e.target.files?.[0])}
					/>
					<Button
						onClick={() => fileRef.current?.click()}
						disabled={importBookmarks.isPending || importJson.isPending}
					>
						<FileUp className="size-4" />
						{importBookmarks.isPending || importJson.isPending
							? "Importing…"
							: "Choose bookmark HTML / JSON backup"}
					</Button>
					<p className="mt-3 text-xs text-muted-foreground">
						Export from Chrome/Edge: Bookmark manager → Export bookmarks. Firefox: Manage bookmarks → Import and Backup → Export Bookmarks to HTML. Safari: File → Export → Bookmarks. Imported bookmarks are public by default; you can change this in Bookmarks.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<FileText className="size-4" /> Export bookmarks
					</CardTitle>
					<CardDescription>
						Choose HTML to import into a browser, or JSON for a full backup including tags, privacy flags, broken link status, and site settings. Restore a JSON backup by importing it on this page.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={() => exportBookmarks.mutate()}
						disabled={exportBookmarks.isPending}
					>
						<FileText className="size-4" />
						{exportBookmarks.isPending ? "Exporting…" : "Bookmark HTML (browser-compatible)"}
					</Button>
					<Button
						variant="outline"
						onClick={() => downloadBackup.mutate()}
						disabled={downloadBackup.isPending}
					>
						<FileJson className="size-4" />
						{downloadBackup.isPending ? "Generating…" : "Full backup (JSON)"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
