import type { Db } from "../db/client";
import { aiUsage, settings } from "../db/schema";

export type AIProvider = "builtin" | "custom";

export type AISettings = {
	enabled: boolean;
	provider: AIProvider;
	apiEndpoint: string;
	apiKey: string;
	model: string;
	features: {
		autoFill: boolean;
		tagSuggest: boolean;
		semanticSearch: boolean;
		summary: boolean;
		autoCategorize: boolean;
		deadLinkRepair: boolean;
	};
};

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// Explicitly time out AI requests so a stalled upstream does not occupy the Worker until termination.
// This is also necessary because anonymous semantic search can invoke runChat.
const AI_TIMEOUT_MS = 30_000;
// Connection tests are short probes and can use a shorter timeout.
const AI_TEST_TIMEOUT_MS = 20_000;

export async function loadAISettings(db: Db): Promise<AISettings> {
	const rows = await db
		.select({ key: settings.key, value: settings.value })
		.from(settings);
	const map = new Map(rows.map((r) => [r.key, r.value]));
	const getBool = (key: string) => map.get(key) === "true";
	const getStr = (key: string, fallback = "") => map.get(key) ?? fallback;

	return {
		enabled: getBool("ai.enabled"),
		provider: (getStr("ai.provider", "builtin") as AIProvider) ?? "builtin",
		apiEndpoint: getStr("ai.apiEndpoint"),
		apiKey: getStr("ai.apiKey"),
		model: getStr("ai.model", DEFAULT_MODEL),
		features: {
			autoFill: getBool("ai.features.autoFill"),
			tagSuggest: getBool("ai.features.tagSuggest"),
			semanticSearch: getBool("ai.features.semanticSearch"),
			summary: getBool("ai.features.summary"),
			autoCategorize: getBool("ai.features.autoCategorize"),
			deadLinkRepair: getBool("ai.features.deadLinkRepair"),
		},
	};
}

export type AIMessage = { role: "system" | "user"; content: string };

// Workers AI types model as a fixed union, but custom model IDs are supported at runtime.
// Centralize the assertion here instead of spreading any casts throughout the code.
type AiModel = Parameters<Ai["run"]>[0];
type AiOptions = Parameters<Ai["run"]>[2];
const asAiModel = (model: string) => model as AiModel;

export async function runChat(
	env: Env,
	settings: AISettings,
	messages: AIMessage[],
	feature: string,
	db?: Db,
): Promise<string> {
	if (!settings.enabled) {
		throw new Error("AI features are disabled");
	}

	const provider = settings.provider;
	const start = Date.now();
	let success = false;
	let errorMsg: string | undefined;

	try {
		if (provider === "custom") {
			if (!settings.apiEndpoint) throw new Error("Custom API endpoint is not configured");
			if (!settings.apiKey) throw new Error("Custom API key is not configured");
			if (!settings.model) throw new Error("Custom model is not configured");

			const res = await fetch(`${settings.apiEndpoint.replace(/\/$/, "")}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${settings.apiKey}`,
				},
				body: JSON.stringify({
					model: settings.model,
					messages,
					temperature: 0.2,
				}),
				signal: AbortSignal.timeout(AI_TIMEOUT_MS),
			});
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(`Custom AI request failed (${res.status}): ${text}`);
			}
			const body = (await res.json()) as {
				choices?: { message?: { content?: string } }[];
			};
			const content = body.choices?.[0]?.message?.content;
			if (!content) throw new Error("Custom AI returned an empty response");
			return content;
		}

		// Built-in Workers AI
		const model = settings.model || DEFAULT_MODEL;
		const result = await env.AI.run(asAiModel(model), { messages }, {
			signal: AbortSignal.timeout(AI_TIMEOUT_MS),
		} as AiOptions);
		const content = (result as { response?: string }).response;
		if (!content) throw new Error("Workers AI returned an empty response");
		return content;
	} catch (err) {
		errorMsg = err instanceof Error ? err.message : String(err);
		throw err;
	} finally {
		success = !errorMsg;
		if (db) {
			await db
				.insert(aiUsage)
				.values({
					feature,
					provider,
					success: success ? 1 : 0,
					durationMs: Date.now() - start,
					error: errorMsg,
				})
				.catch((e) => console.error("Failed to record AI usage:", e));
		}
	}
}

// Test a temporary configuration without saving to verify the provider, endpoint, key, and model.
export async function testModel(env: Env, cfg: {
	provider: AIProvider;
	apiEndpoint?: string;
	apiKey?: string;
	model: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const messages: AIMessage[] = [
		{ role: "system", content: "You are a connection test assistant. Reply only with the two letters ok." },
		{ role: "user", content: "ping" },
	];
	try {
		if (cfg.provider === "custom") {
			if (!cfg.apiEndpoint) return { ok: false, error: "Enter a custom API endpoint" };
			if (!cfg.apiKey) return { ok: false, error: "Enter a custom API key" };
			if (!cfg.model) return { ok: false, error: "Enter a custom model" };
			const res = await fetch(
				`${cfg.apiEndpoint.replace(/\/$/, "")}/chat/completions`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${cfg.apiKey}`,
					},
					body: JSON.stringify({ model: cfg.model, messages, temperature: 0 }),
					signal: AbortSignal.timeout(AI_TEST_TIMEOUT_MS),
				},
			);
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				return { ok: false, error: `Request failed (${res.status}): ${text.slice(0, 300)}` };
			}
			const body = (await res.json()) as {
				choices?: { message?: { content?: string } }[];
			};
			if (!body.choices?.[0]?.message?.content) {
				return { ok: false, error: "The response is empty" };
			}
			return { ok: true };
		}

		// Built-in Workers AI
		const model = cfg.model || DEFAULT_MODEL;
		const result = await env.AI.run(
			asAiModel(model),
			{ messages },
			{ signal: AbortSignal.timeout(AI_TEST_TIMEOUT_MS) } as AiOptions,
		);
		const content = (result as { response?: string }).response;
		if (!content) return { ok: false, error: "Workers AI returned an empty response" };
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

export function extractJson<T>(text: string): T {
	// Try parsing the entire response first.
	try {
		return JSON.parse(text) as T;
	} catch {
		// Try extracting a fenced JSON block or an object.
		const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
		if (codeBlock) {
			try {
				return JSON.parse(codeBlock[1]) as T;
			} catch {
				/* ignore */
			}
		}
		const object = text.match(/\{[\s\S]*\}/);
		if (object) {
			try {
				return JSON.parse(object[0]) as T;
			} catch {
				/* ignore */
			}
		}
	}
	throw new Error("AI returned invalid JSON");
}
