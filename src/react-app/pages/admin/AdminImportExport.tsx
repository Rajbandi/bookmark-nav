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
			toast.error("文件过大(超过 20MB)");
			return;
		}
		const text = await file.text();
		// 按文件类型分流:JSON 备份走恢复接口,其余按浏览器书签 HTML 导入
		if (file.name.endsWith(".json") || text.trimStart().startsWith("{")) {
			let payload: BackupImportPayload;
			try {
				payload = JSON.parse(text) as BackupImportPayload;
			} catch {
				toast.error("文件不是有效的 JSON");
				return;
			}
			importJson.mutate(payload);
		} else {
			importBookmarks.mutate(text);
		}
		// 清空 input,允许重复选择同一文件
		if (fileRef.current) fileRef.current.value = "";
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Upload className="size-4" /> 导入书签
					</CardTitle>
					<CardDescription>
						支持 Chrome / Edge / Firefox 导出的书签 HTML,或本项目的 JSON 备份文件
						(「导出书签」「自动任务」页可得,恢复书签、分类、标签,站点设置仅补齐缺失项)。
						文件夹层级完整保留,重复网址自动跳过,可放心重复导入。
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
							? "导入中…"
							: "选择书签 HTML / JSON 备份"}
					</Button>
					<p className="mt-3 text-xs text-muted-foreground">
						浏览器导出入口:Chrome/Edge 书签管理器 → 导出书签;Firefox
						书签管理 → 导入和备份 → 导出书签到 HTML;Safari 文件 → 导出 → 书签。
						导入的书签默认为公开,可在书签管理中调整。
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<FileText className="size-4" /> 导出书签
					</CardTitle>
					<CardDescription>
						两种格式按需选择:HTML 可导入回任意浏览器;JSON
						是全量备份(含标签、私密标记、死链状态、站点设置),回到本页即可导入恢复。
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={() => exportBookmarks.mutate()}
						disabled={exportBookmarks.isPending}
					>
						<FileText className="size-4" />
						{exportBookmarks.isPending ? "导出中…" : "书签 HTML(浏览器兼容)"}
					</Button>
					<Button
						variant="outline"
						onClick={() => downloadBackup.mutate()}
						disabled={downloadBackup.isPending}
					>
						<FileJson className="size-4" />
						{downloadBackup.isPending ? "生成中…" : "完整备份(JSON)"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
