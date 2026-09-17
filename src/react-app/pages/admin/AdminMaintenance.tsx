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
	{ value: 1, label: "Monday" },
	{ value: 2, label: "Tuesday" },
	{ value: 3, label: "Wednesday" },
	{ value: 4, label: "Thursday" },
	{ value: 5, label: "Friday" },
	{ value: 6, label: "Saturday" },
	{ value: 0, label: "Sunday" },
];

// Schedule editor: daily, weekly, or monthly in UTC+8. Saved changes apply without redeployment.
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
				<SelectTrigger className="w-32">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="daily">Daily</SelectItem>
					<SelectItem value="weekly">Weekly</SelectItem>
					<SelectItem value="monthly">Monthly</SelectItem>
				</SelectContent>
			</Select>
			{value.freq === "weekly" && (
				<Select
					value={String(value.weekday)}
					onValueChange={(v) => onChange({ ...value, weekday: Number(v) })}
				>
					<SelectTrigger className="w-32">
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
					<SelectTrigger className="w-32">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Array.from({ length: 28 }, (_, i) => (
							<SelectItem key={i + 1} value={String(i + 1)}>
								Day {i + 1}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			<span className="text-sm text-muted-foreground">at</span>
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
			<span className="text-sm text-muted-foreground">(UTC+8)</span>
		</div>
	);
}

// Prefer the local schedule draft during saves to prevent the selector from jumping back; otherwise parse settings.
// parseSchedule falls back for missing or invalid values so the editor can always render.
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
	return iso ? new Date(iso).toLocaleString("en-US") : "Never run";
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
						<HeartPulse className="size-4" /> Automatic broken link checks
					</CardTitle>
					<CardDescription>
						Check all bookmarks on a schedule, marking broken links and restoring recovered ones. Filter results on the Bookmarks page. Schedule changes take effect immediately without redeployment.
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
							Last run: {formatTime(settings?.["deadLink.lastRun"])}
							{settings?.["deadLink.dead"] !== undefined &&
								`; broken links found: ${settings["deadLink.dead"]}`}
						</p>
						<label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
							Enable
							<Switch
								checked={settings?.["maintenance.checkLinks"] !== "0"}
								onCheckedChange={(v) =>
									saveSettings.mutate({ "maintenance.checkLinks": v ? "1" : "0" })
								}
								disabled={saveSettings.isPending}
								aria-label="Automatic broken link checks"
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
						{runLinkCheck.isPending ? "Checking…" : "Run check now"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DatabaseBackup className="size-4" /> Automatic backups
					</CardTitle>
					<CardDescription>
						Back up all data (bookmarks, categories, tags, and settings) as JSON to your Cloudflare R2 bucket on a schedule. Create a bucket and set the R2_BUCKET build variable first. One backup is kept per day; configure R2 lifecycle rules for automatic cleanup. Schedule changes apply immediately. To download a JSON backup, use Import / Export.
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
							Last run: {formatTime(settings?.["backup.lastRun"])}
						</p>
						<label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
							Enable
							<Switch
								checked={settings?.["maintenance.backup"] !== "0"}
								onCheckedChange={(v) =>
									saveSettings.mutate({ "maintenance.backup": v ? "1" : "0" })
								}
								disabled={saveSettings.isPending}
								aria-label="Automatic backups"
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
						{backupNow.isPending ? "Backing up…" : "Back up to R2 now"}
					</Button>
				</CardContent>
			</Card>

			<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<CalendarClock className="size-3.5" />
				The scheduler checks these tasks at the start of each hour and runs those that are due. Changes to schedules and enable switches apply immediately.
			</p>
		</div>
	);
}
