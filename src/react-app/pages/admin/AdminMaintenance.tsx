import { useMemo, useState } from "react";
import { CalendarClock, DatabaseBackup, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { TaskSchedule } from "../../../worker/lib/schedule";
import {
	DEFAULT_BACKUP_SCHEDULE,
	DEFAULT_DEADLINK_SCHEDULE,
	parseSchedule,
} from "../../../worker/lib/schedule";
import {
	useAdminSettings,
	useBackupNow,
	useRunLinkCheck,
	useSaveSettings,
} from "@/lib/admin-queries";

const WEEKDAYS = [
	{ value: 1, label: "周一" },
	{ value: 2, label: "周二" },
	{ value: 3, label: "周三" },
	{ value: 4, label: "周四" },
	{ value: 5, label: "周五" },
	{ value: 6, label: "周六" },
	{ value: 0, label: "周日" },
];

// 运行计划编辑器:频率(每天/每周/每月)+ 北京时间;保存后立即生效,无需重新部署
function ScheduleEditor({
	value,
	onChange,
}: {
	value: TaskSchedule;
	onChange: (v: TaskSchedule) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Select
				value={value.freq}
				onValueChange={(v) => onChange({ ...value, freq: v as TaskSchedule["freq"] })}
			>
				<SelectTrigger className="w-24">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="daily">每天</SelectItem>
					<SelectItem value="weekly">每周</SelectItem>
					<SelectItem value="monthly">每月</SelectItem>
				</SelectContent>
			</Select>
			{value.freq === "weekly" && (
				<Select
					value={String(value.weekday)}
					onValueChange={(v) => onChange({ ...value, weekday: Number(v) })}
				>
					<SelectTrigger className="w-24">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{WEEKDAYS.map(({ value: d, label }) => (
							<SelectItem key={d} value={String(d)}>
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			{value.freq === "monthly" && (
				<Select
					value={String(value.monthday)}
					onValueChange={(v) => onChange({ ...value, monthday: Number(v) })}
				>
					<SelectTrigger className="w-24">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Array.from({ length: 28 }, (_, i) => (
							<SelectItem key={i + 1} value={String(i + 1)}>
								{i + 1} 号
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			<span className="text-sm text-muted-foreground">的</span>
			<Select
				value={String(value.hour)}
				onValueChange={(v) => onChange({ ...value, hour: Number(v) })}
			>
				<SelectTrigger className="w-28">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{Array.from({ length: 24 }, (_, h) => (
						<SelectItem key={h} value={String(h)}>
							{String(h).padStart(2, "0")}:00
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<span className="text-sm text-muted-foreground">(北京时间)</span>
		</div>
	);
}

// 读取某任务的计划:优先本地草稿(避免保存往返期间下拉框弹回),否则解析 settings
// (parseSchedule 对缺 key/坏 JSON 均回退默认计划,编辑器始终可渲染)
function useSchedule(key: string, fallback: TaskSchedule) {
	const { data: settings } = useAdminSettings();
	const [draft, setDraft] = useState<TaskSchedule | null>(null);
	const schedule = useMemo(
		() => draft ?? parseSchedule(settings?.[key], fallback),
		[draft, settings, key, fallback],
	);
	return { schedule, update: setDraft };
}

function formatTime(iso: string | undefined): string {
	return iso ? new Date(iso).toLocaleString("zh-CN") : "尚未运行过";
}

export default function AdminMaintenance() {
	const saveSettings = useSaveSettings();
	const { data: settings } = useAdminSettings();
	const runLinkCheck = useRunLinkCheck();
	const backupNow = useBackupNow();
	const deadLink = useSchedule("deadLink.schedule", DEFAULT_DEADLINK_SCHEDULE);
	const backup = useSchedule("backup.schedule", DEFAULT_BACKUP_SCHEDULE);

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<HeartPulse className="size-4" /> 死链自动检测
					</CardTitle>
					<CardDescription>
						按计划自动检测全部书签的可达性,失效的自动标记为死链、恢复的自动还原;
						结果可在书签管理页筛选查看。计划修改立即生效,无需重新部署。
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<ScheduleEditor
						value={deadLink.schedule}
						onChange={(v) => {
							deadLink.update(v);
							saveSettings.mutate({ "deadLink.schedule": JSON.stringify(v) });
						}}
					/>
					<div className="flex items-center justify-between gap-4">
						<p className="text-xs text-muted-foreground">
							上次运行:{formatTime(settings?.["deadLink.lastRun"])}
							{settings?.["deadLink.dead"] !== undefined &&
								`,发现死链 ${settings["deadLink.dead"]} 个`}
						</p>
						<label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
							启用
							<Switch
								checked={settings?.["maintenance.checkLinks"] !== "0"}
								onCheckedChange={(v) =>
									saveSettings.mutate({ "maintenance.checkLinks": v ? "1" : "0" })
								}
								disabled={saveSettings.isPending}
								aria-label="自动检测死链"
							/>
						</label>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => runLinkCheck.mutate()}
						disabled={runLinkCheck.isPending}
					>
						<HeartPulse className="size-4" />
						{runLinkCheck.isPending ? "检测中…" : "立即检测一次"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DatabaseBackup className="size-4" /> 自动备份
					</CardTitle>
					<CardDescription>
						按计划把全量数据(JSON,含书签/分类/标签/设置)备份到你的 Cloudflare R2
						存储桶(需先创建桶并在部署变量中配置 R2_BUCKET)。每天保留一份,可在
						R2 控制台配置生命周期规则自动清理。计划修改立即生效,无需重新部署。
						如需下载 JSON 备份文件,请到「导入导出」页。
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<ScheduleEditor
						value={backup.schedule}
						onChange={(v) => {
							backup.update(v);
							saveSettings.mutate({ "backup.schedule": JSON.stringify(v) });
						}}
					/>
					<div className="flex items-center justify-between gap-4">
						<p className="text-xs text-muted-foreground">
							上次运行:{formatTime(settings?.["backup.lastRun"])}
						</p>
						<label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
							启用
							<Switch
								checked={settings?.["maintenance.backup"] !== "0"}
								onCheckedChange={(v) =>
									saveSettings.mutate({ "maintenance.backup": v ? "1" : "0" })
								}
								disabled={saveSettings.isPending}
								aria-label="自动备份"
							/>
						</label>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => backupNow.mutate()}
						disabled={backupNow.isPending}
					>
						<DatabaseBackup className="size-4" />
						{backupNow.isPending ? "备份中…" : "立即备份到 R2"}
					</Button>
				</CardContent>
			</Card>

			<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<CalendarClock className="size-3.5" />
				以上任务由每小时整点触发的调度器评估,到点自动运行;关闭启用或修改计划均即时生效。
			</p>
		</div>
	);
}
