import { Droplets, Monitor, Moon, Square, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAdminSettings, useSaveSettings } from "@/lib/admin-queries";

export default function AdminAppearance() {
	const { theme, setTheme } = useTheme();
	const { data: settings } = useAdminSettings();
	const save = useSaveSettings();
	const compact = settings?.["appearance.compact"] === "1";
	const anchorNav = settings?.["appearance.anchorNav"] === "1";
	const showGithubLink = settings?.["showGithubLink"] === "1";
	// Store the visual style in the database for all visitors; light/dark preferences remain browser-local.
	const style = settings?.["appearance.style"] === "glass" ? "glass" : "classic";
	const themeOptions = [
		{ value: "system", label: "System", icon: Monitor },
		{ value: "light", label: "Light", icon: Sun },
		{ value: "dark", label: "Dark", icon: Moon },
	] as const;
	const styleOptions = [
		{ value: "classic", label: "Classic", icon: Square },
		{ value: "glass", label: "Liquid glass", icon: Droplets },
	] as const;

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Appearance</CardTitle>
					<CardDescription>Choose a light or dark theme for the site and admin. Defaults to your system preference.</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap gap-2">
						{themeOptions.map(({ value, label, icon: Icon }) => (
							<Button
								key={value}
								type="button"
								variant="outline"
								size="sm"
								className={cn(
									"gap-2",
									theme === value && "border-primary bg-primary/10 text-primary",
								)}
								onClick={() => setTheme(value)}
							>
								<Icon className="size-4" />
								{label}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Visual style</CardTitle>
					<CardDescription>The visual style of the public page. Refresh the public page after saving.</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap gap-2">
						{styleOptions.map(({ value, label, icon: Icon }) => (
							<Button
								key={value}
								type="button"
								variant="outline"
								size="sm"
								className={cn(
									"gap-2",
									style === value && "border-primary bg-primary/10 text-primary",
								)}
								onClick={() => save.mutate({ "appearance.style": value })}
								disabled={save.isPending}
							>
								<Icon className="size-4" />
								{label}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Public page display</CardTitle>
					<CardDescription>Choose how densely bookmarks appear on the public page</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div className="flex items-center justify-between gap-4">
							<div className="space-y-0.5">
								<p className="text-sm font-medium">Compact mode</p>
								<p className="text-sm text-muted-foreground">
									Smaller cards hide descriptions and tags to show more bookmarks per page
								</p>
							</div>
							<Switch
								checked={compact}
								onCheckedChange={(v) => save.mutate({ "appearance.compact": v ? "1" : "0" })}
								disabled={save.isPending}
								aria-label="Compact mode"
							/>
						</div>
						<div className="flex items-center justify-between gap-4 border-t pt-4">
							<div className="space-y-0.5">
								<p className="text-sm font-medium">Category navigation</p>
								<p className="text-sm text-muted-foreground">
									Show category shortcuts below search. Hidden automatically when fewer than three categories are visible.
								</p>
							</div>
							<Switch
								checked={anchorNav}
								onCheckedChange={(v) => save.mutate({ "appearance.anchorNav": v ? "1" : "0" })}
								disabled={save.isPending}
								aria-label="Category navigation"
							/>
						</div>
						<div className="flex items-center justify-between gap-4 border-t pt-4">
							<div className="space-y-0.5">
								<p className="text-sm font-medium">GitHub link</p>
								<p className="text-sm text-muted-foreground">
									Show the project repository link in the top-right corner
								</p>
							</div>
							<Switch
								checked={showGithubLink}
								onCheckedChange={(v) => save.mutate({ "showGithubLink": v ? "1" : "0" })}
								disabled={save.isPending}
								aria-label="GitHub link"
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}