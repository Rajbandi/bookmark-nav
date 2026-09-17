import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminSettings, useSaveSettings } from "@/lib/admin-queries";

// Icon service presets with a {domain} placeholder.
// DuckDuckGo and FaviconExtractor return 404 for unknown domains, triggering the initial fallback.
// favicon.im returns a placeholder for unknown domains and is directly accessible in China.
const iconServicePresets = [
	{ label: "DuckDuckGo", value: "https://icons.duckduckgo.com/ip3/{domain}.ico" },
	{ label: "favicon.im", value: "https://favicon.im/{domain}" },
	{ label: "FaviconExtractor", value: "https://www.faviconextractor.com/favicon/{domain}" },
] as const;

export default function AdminSettings() {
	const { data, isLoading } = useAdminSettings();
	const save = useSaveSettings();
	// Use saved settings as the baseline and keep only edited fields in the draft, avoiding effect-based state resets.
	const [draft, setDraft] = useState<Record<string, string>>({});
	const siteName = draft.siteName ?? data?.siteName ?? "";
	const footer = draft.footer ?? data?.footer ?? "";
	const iconService = draft["icon.service"] ?? data?.["icon.service"] ?? "";
	const setField = (key: string, value: string) =>
		setDraft((prev) => ({ ...prev, [key]: value }));

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		save.mutate({ siteName, footer });
	}

	function handleIconSubmit(e: FormEvent) {
		e.preventDefault();
		save.mutate({ "icon.service": iconService });
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Basic information</CardTitle>
					<CardDescription>Site settings for the public page</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="site-name">Site name</Label>
							<Input
								id="site-name"
								value={siteName}
								onChange={(e) => setField("siteName", e.target.value)}
								placeholder="Bookmark Nav"
								disabled={isLoading}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="site-footer">Footer text</Label>
							<Textarea
								id="site-footer"
								value={footer}
								onChange={(e) => setField("footer", e.target.value)}
								rows={2}
								disabled={isLoading}
							/>
							<p className="text-xs text-muted-foreground">
								Supports Markdown: links{" "}
								<code className="rounded bg-muted px-1">[text](URL)</code>,{" "}
								<code className="rounded bg-muted px-1">**bold**</code>,{" "}
								<code className="rounded bg-muted px-1">*italic*</code>
								. Plain URLs appear as text; line breaks are preserved.
							</p>
						</div>
						<Button type="submit" disabled={save.isPending || isLoading}>
							{save.isPending ? "Saving…" : "Save"}
						</Button>
					</form>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Icons</CardTitle>
					<CardDescription>
						Set a favicon service URL template using {`{domain}`} for the bookmark domain. Leave blank to disable automatic icons.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleIconSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="icon-service">Service URL template</Label>
							<Input
								id="icon-service"
								value={iconService}
								onChange={(e) => setField("icon.service", e.target.value)}
								placeholder="https://favicon.im/{domain}"
								disabled={isLoading}
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							{iconServicePresets.map(({ label, value }) => (
								<Button
									key={value}
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setField("icon.service", value)}
								>
									{label}
								</Button>
							))}
						</div>
						<Button type="submit" disabled={save.isPending || isLoading}>
							{save.isPending ? "Saving…" : "Save"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}