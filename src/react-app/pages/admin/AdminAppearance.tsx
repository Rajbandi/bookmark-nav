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
	// 界面风格存数据库(区别于明暗主题的浏览器本地偏好),全站统一生效
	const style = settings?.["appearance.style"] === "glass" ? "glass" : "classic";
	const themeOptions = [
		{ value: "system", label: "跟随系统", icon: Monitor },
		{ value: "light", label: "浅色", icon: Sun },
		{ value: "dark", label: "深色", icon: Moon },
	] as const;
	const styleOptions = [
		{ value: "classic", label: "经典", icon: Square },
		{ value: "glass", label: "液态玻璃", icon: Droplets },
	] as const;

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>外观设置</CardTitle>
					<CardDescription>设置后台及前台的明暗主题，默认跟随系统</CardDescription>
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
					<CardTitle>界面风格</CardTitle>
					<CardDescription>前台导航页的整体视觉风格，保存后刷新前台生效</CardDescription>
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
					<CardTitle>前台显示</CardTitle>
					<CardDescription>前台导航页的展示密度</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div className="flex items-center justify-between gap-4">
							<div className="space-y-0.5">
								<p className="text-sm font-medium">紧凑模式</p>
								<p className="text-sm text-muted-foreground">
									卡片更小、隐藏描述与标签，单页显示更多书签
								</p>
							</div>
							<Switch
								checked={compact}
								onCheckedChange={(v) => save.mutate({ "appearance.compact": v ? "1" : "0" })}
								disabled={save.isPending}
								aria-label="紧凑模式"
							/>
						</div>
						<div className="flex items-center justify-between gap-4 border-t pt-4">
							<div className="space-y-0.5">
								<p className="text-sm font-medium">分类导航</p>
								<p className="text-sm text-muted-foreground">
									搜索框下方显示分类快捷锚点，点击可跳转；分类少于 3 个时自动隐藏
								</p>
							</div>
							<Switch
								checked={anchorNav}
								onCheckedChange={(v) => save.mutate({ "appearance.anchorNav": v ? "1" : "0" })}
								disabled={save.isPending}
								aria-label="分类导航"
							/>
						</div>
						<div className="flex items-center justify-between gap-4 border-t pt-4">
							<div className="space-y-0.5">
								<p className="text-sm font-medium">GitHub 链接</p>
								<p className="text-sm text-muted-foreground">
									在页面右上角显示项目仓库入口
								</p>
							</div>
							<Switch
								checked={showGithubLink}
								onCheckedChange={(v) => save.mutate({ "showGithubLink": v ? "1" : "0" })}
								disabled={save.isPending}
								aria-label="GitHub 链接"
							/>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}