// Local extension settings (chrome.storage.local): site URL and access token.
// Avoid storage.sync: the token grants administrator access and must not sync to the browser account cloud.
export type ExtConfig = {
	siteUrl: string;
	token: string;
};

const KEY = "config";

export async function loadConfig(): Promise<ExtConfig | null> {
	const stored = (await chrome.storage.local.get(KEY)) as Record<string, unknown>;
	const cfg = stored[KEY] as Partial<ExtConfig> | undefined;
	if (!cfg?.siteUrl || !cfg?.token) return null;
	return cfg as ExtConfig;
}

export async function saveConfig(cfg: ExtConfig): Promise<void> {
	await chrome.storage.local.set({ [KEY]: cfg });
}

// Normalize the site URL by removing trailing slashes and validating the protocol for requests and permissions.
export function normalizeSiteUrl(input: string): string | null {
	const url = new URL(input.trim());
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	return url.origin;
}

// Request optional site access: cross-origin fetch from MV3 extension pages requires host_permissions.
export async function ensureHostPermission(siteUrl: string): Promise<boolean> {
	const pattern = `${siteUrl}/*`;
	const granted = await chrome.permissions.contains({ origins: [pattern] });
	if (granted) return true;
	return chrome.permissions.request({ origins: [pattern] });
}
