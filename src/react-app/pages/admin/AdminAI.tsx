import { useState, type FormEvent } from "react";
import { Sparkles, Eye, EyeOff, FlaskConical, Zap, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminSettings, useSaveSettings, useAIUsage, useTestAI } from "@/lib/admin-queries";

// Daily usage soft limit: display a warning near the free allowance without blocking requests.
const DAILY_SOFT_LIMIT = 1000;

// Default Workers AI model, used as a placeholder; other model IDs are supported.
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// Cloudflare Workers AI model catalog for finding available model IDs.
const WORKERS_AI_MODELS_URL = "https://developers.cloudflare.com/workers-ai/models/";

// Map analytics feature names to readable labels.
const FEATURE_LABELS: Record<string, string> = {
	autoFill: "Autofill",
	tagSuggest: "Tag suggestions",
	semanticSearch: "Semantic search",
	summary: "Content summaries",
	autoCategorize: "Auto-categorization",
	deadLinkRepair: "Broken link repair",
};

// Model input shared by built-in and custom providers.
function ModelField({
	model,
	onModelChange,
	placeholder,
	disabled,
}: {
	model: string;
	onModelChange: (v: string) => void;
	placeholder: string;
	disabled: boolean;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor="ai-model">Model name</Label>
			<Input
				id="ai-model"
				value={model}
				onChange={(e) => onModelChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
			/>
		</div>
	);
}

const FEATURES = [
	{
		key: "ai.features.autoFill",
		label: "Autofill bookmark details",
		description: "Fetch and complete the title, description, and icon when you enter a URL",
	},
	{
		key: "ai.features.tagSuggest",
		label: "AI tag suggestions",
		description: "Suggest tags based on bookmark content after saving",
	},
	{
		key: "ai.features.semanticSearch",
		label: "Semantic search",
		description: "Search bookmarks using natural language, such as find CSS tools",
	},
	{
		key: "ai.features.summary",
		label: "Content summaries",
		description: "Generate a one-sentence English summary for each bookmark",
	},
	{
		key: "ai.features.autoCategorize",
		label: "Auto-categorization",
		description: "Suggest the most suitable category when adding a bookmark",
	},
	{
		key: "ai.features.deadLinkRepair",
		label: "Broken link repair",
		description: "Suggest alternative URLs or archives for broken links",
	},
];

export default function AdminAI() {
	const { data, isLoading } = useAdminSettings();
	const save = useSaveSettings();
	const { data: usage, isLoading: usageLoading } = useAIUsage();
	const testAI = useTestAI();

	const [showKey, setShowKey] = useState(false);
	// Use saved settings as the baseline and keep only edited fields in the draft, avoiding effect-based state resets.
	const [draft, setDraft] = useState<Record<string, string>>({});
	const [draftFeatures, setDraftFeatures] = useState<Record<string, boolean>>({});
	const pick = (key: string, fallback = "") => draft[key] ?? data?.[key] ?? fallback;
	const setField = (key: string, value: string) =>
		setDraft((prev) => ({ ...prev, [key]: value }));

	const enabled = pick("ai.enabled") === "true";
	const provider = pick("ai.provider", "builtin") as "builtin" | "custom";
	const apiEndpoint = pick("ai.apiEndpoint");
	const apiKey = pick("ai.apiKey");
	const model = pick("ai.model");
	const features: Record<string, boolean> = {};
	for (const feat of FEATURES) {
		features[feat.key] = draftFeatures[feat.key] ?? data?.[feat.key] === "true";
	}

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		const payload: Record<string, string> = {
			"ai.enabled": String(enabled),
			"ai.provider": provider,
			"ai.apiEndpoint": apiEndpoint,
			"ai.apiKey": apiKey,
			"ai.model": model,
		};
		for (const feat of FEATURES) {
			payload[feat.key] = String(features[feat.key] ?? false);
		}
		save.mutate(payload);
	}

	const handleTest = async () => {
		const cfg = {
			provider,
			apiEndpoint: apiEndpoint || undefined,
			apiKey: apiKey || undefined,
			model,
		};
		try {
			await testAI.mutateAsync(cfg);
			toast.success("Connected successfully. The model is available.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Check failed");
		}
	};

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			{/* AI usage overview for monitoring allowance and custom API abuse. */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<BarChart3 className="size-5 text-orange-500" />
						<CardTitle>Usage overview</CardTitle>
					</div>
					<CardDescription>AI requests over the last 24 hours</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					{usageLoading ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : (
						<>
							{/* Key metrics for today. */}
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								<Metric label="Requests today" value={usage?.today.total ?? 0} />
								<Metric
									label="Success rate"
									value={`${usage?.today.successRate ?? 100}%`}
								/>
								<Metric label="Failed" value={usage?.today.failed ?? 0} />
								<Metric
									label="Average duration"
									value={`${usage?.today.avgDurationMs ?? 0}ms`}
								/>
							</div>

							{/* Free allowance soft-limit warning for the built-in provider. */}
							{usage && provider === "builtin" && usage.today.total > 0 && (
								<SoftLimitBar total={usage.today.total} />
							)}

							{/* Usage by feature. */}
							<div className="space-y-2">
								<p className="text-xs font-medium text-muted-foreground">
									Requests by feature
								</p>
								{usage && usage.byFeature.length > 0 ? (
									usage.byFeature.map((f) => (
										<div key={f.feature} className="space-y-1">
											<div className="flex items-center justify-between text-xs">
												<span>
													{FEATURE_LABELS[f.feature] ?? f.feature}
												</span>
												<span className="text-muted-foreground">
													{f.total} requests{f.success < f.total ? ` · ${f.total - f.success} failed` : ""}
												</span>
											</div>
											<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full bg-orange-500"
													style={{
														width: `${Math.min(
															100,
															(f.total /
																(usage.today.total || 1)) *
																100,
														)}%`,
													}}
												/>
											</div>
										</div>
									))
								) : (
									<p className="text-xs text-muted-foreground">
										No AI requests today
									</p>
								)}
							</div>

							{/* Usage by provider. */}
							{usage && usage.byProvider.length > 0 && (
								<div className="space-y-1 text-xs text-muted-foreground">
									{usage.byProvider.map((p) => (
										<div
											key={p.provider}
											className="flex items-center justify-between"
										>
											<span>
												{p.provider === "builtin"
													? "Built-in Workers AI"
													: "Custom API"}
											</span>
											<span>{p.total} requests</span>
										</div>
									))}
								</div>
							)}

							{/* Recent errors. */}
							{usage && usage.recentErrors.length > 0 && (
								<div className="space-y-1.5">
									<p className="text-xs font-medium text-muted-foreground">
										Recent failures
									</p>
									{usage.recentErrors.slice(0, 8).map((e, i) => (
										<div
											key={i}
											className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs"
										>
											<span className="font-medium text-destructive">
												{FEATURE_LABELS[e.feature] ?? e.feature}
											</span>
											<span className="text-muted-foreground">
												{" "}
												· {new Date(e.createdAt).toLocaleTimeString("en-US")}
											</span>
											<p className="mt-0.5 break-all text-muted-foreground">
												{e.error}
											</p>
										</div>
									))}
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>

			{/* Master switch. */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Sparkles className="size-5 text-orange-500" />
						<CardTitle>AI features</CardTitle>
					</div>
					<CardDescription>
						Enable AI-assisted bookmark management. AI requests may incur a small cost. Disabled by default.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center justify-between">
					<Label htmlFor="ai-enabled" className="text-sm text-muted-foreground">
						{enabled ? "Enabled" : "Disabled"}
					</Label>
					<Switch
						id="ai-enabled"
						checked={enabled}
						onCheckedChange={(v) => setField("ai.enabled", String(v))}
						disabled={isLoading}
					/>
				</CardContent>
			</Card>

			{/* Provider configuration. */}
			<Card>
				<CardHeader>
					<CardTitle>AI provider</CardTitle>
					<CardDescription>Choose how to access AI</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-3">
						<Button
							type="button"
							size="sm"
							variant={provider === "builtin" ? "default" : "outline"}
							onClick={() => setField("ai.provider", "builtin")}
							className="flex items-center gap-1.5"
						>
							<Zap className="size-3.5" />
							Built-in
						</Button>
						<Button
							type="button"
							size="sm"
							variant={provider === "custom" ? "default" : "outline"}
							onClick={() => setField("ai.provider", "custom")}
							className="flex items-center gap-1.5"
						>
							<FlaskConical className="size-3.5" />
							Custom API
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						{provider === "builtin"
							? "Use Cloudflare Workers AI at no cost within the free allowance."
							: "Connect to third-party model services through an OpenAI-compatible API."}
					</p>

					{provider === "custom" && (
						<form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
							<div className="space-y-2">
								<Label htmlFor="ai-endpoint">API Endpoint</Label>
								<Input
									id="ai-endpoint"
									value={apiEndpoint}
									onChange={(e) => setField("ai.apiEndpoint", e.target.value)}
									placeholder="https://api.openai.com/v1"
									disabled={isLoading}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="ai-key">API Key</Label>
								<div className="flex gap-2">
									<Input
										id="ai-key"
										type={showKey ? "text" : "password"}
										value={apiKey}
										onChange={(e) => setField("ai.apiKey", e.target.value)}
										placeholder="sk-••••••••"
										disabled={isLoading}
										className="flex-1"
									/>
									<Button
										type="button"
										size="icon"
										variant="outline"
										onClick={() => setShowKey((v) => !v)}
										disabled={isLoading}
										aria-label={showKey ? "Hide API key" : "Show API key"}
									>
										{showKey ? (
											<EyeOff className="size-4" />
										) : (
											<Eye className="size-4" />
										)}
									</Button>
								</div>
							</div>
							<ModelField
								model={model}
								onModelChange={(v) => setField("ai.model", v)}
								placeholder="gpt-4o-mini"
								disabled={isLoading}
							/>
						</form>
					)}

					{provider === "builtin" && (
						<form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
							<ModelField
								model={model}
								onModelChange={(v) => setField("ai.model", v)}
								placeholder={DEFAULT_MODEL}
								disabled={isLoading}
							/>
							<p className="text-xs text-muted-foreground">
								Leave blank to use the default model{" "}
								<code className="rounded bg-muted px-1 py-0.5">
									{DEFAULT_MODEL}
								</code>
								. Browse the{" "}
								<a
									href={WORKERS_AI_MODELS_URL}
									target="_blank"
									rel="noreferrer"
									className="text-blue-500 hover:underline"
								>
									Cloudflare Workers AI model catalog
								</a>{" "}
								for other available model IDs.
							</p>
						</form>
					)}

					<div className="pt-1">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={handleTest}
							disabled={isLoading || testAI.isPending}
							className="flex items-center gap-1.5"
						>
							<FlaskConical className="size-3.5" />
							{testAI.isPending ? "Checking…" : "Test connection"}
						</Button>
						<p className="mt-1.5 text-xs text-muted-foreground">
							Test the current form configuration to check model availability without saving settings.
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Feature switches. */}
			<Card>
				<CardHeader>
					<CardTitle>Feature controls</CardTitle>
					<CardDescription>Enable or disable individual AI features</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{FEATURES.map((feat) => (
						<div
							key={feat.key}
							className="flex items-center justify-between gap-4"
						>
							<div className="space-y-0.5">
								<Label htmlFor={feat.key} className="text-sm">
									{feat.label}
								</Label>
								<p className="text-xs text-muted-foreground">
									{feat.description}
								</p>
							</div>
							<Switch
								id={feat.key}
								checked={features[feat.key] ?? false}
								onCheckedChange={(v) =>
									setDraftFeatures((prev) => ({ ...prev, [feat.key]: v }))
								}
								disabled={isLoading || !enabled}
							/>
						</div>
					))}
				</CardContent>
			</Card>

			{/* Privacy information and save action. */}
			<Card>
				<CardHeader>
					<CardTitle>Privacy information</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
						<li>Bookmark titles and URLs are sent to the selected AI provider for analysis</li>
						<li>Data is used for inference, not model training</li>
						<li>You can disable AI at any time; existing analysis results are retained</li>
					</ul>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={save.isPending || isLoading}
					>
						{save.isPending ? "Saving…" : "Save settings"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="rounded-lg border bg-muted/30 p-3 text-center">
			<div className="text-lg font-semibold tabular-nums">{value}</div>
			<div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
		</div>
	);
}

function SoftLimitBar({ total }: { total: number }) {
	const ratio = Math.min(1, total / DAILY_SOFT_LIMIT);
	const near = ratio >= 0.8 && ratio < 1;
	const over = ratio >= 1;
	const color = over
		? "bg-destructive"
		: near
			? "bg-yellow-500"
			: "bg-orange-500";
	const text = over
		? `Today’s free allowance is nearly used up (${total}/${DAILY_SOFT_LIMIT}). Requests may be rate-limited.`
		: near
			? `High usage of today’s free allowance (${total}/${DAILY_SOFT_LIMIT}). Keep an eye on usage.`
			: `Today’s free allowance usage:  ${total}/${DAILY_SOFT_LIMIT}`;
	return (
		<div className="space-y-1.5">
			<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
				<div className={`h-full ${color}`} style={{ width: `${ratio * 100}%` }} />
			</div>
			<p className="text-xs text-muted-foreground">{text}</p>
		</div>
	);
}
