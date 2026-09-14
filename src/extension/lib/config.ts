// 插件本地配置(chrome.storage.local):站点地址 + 访问令牌
// 不用 storage.sync:令牌等同管理员凭证,同步到浏览器账号云端有泄露风险
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

// 规范化站点地址:去尾部斜杠,校验协议,供请求拼接与权限申请使用
export function normalizeSiteUrl(input: string): string | null {
	const url = new URL(input.trim());
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	return url.origin;
}

// 申请站点访问权限(可选权限):MV3 下插件页面跨域 fetch 依赖 host_permissions
export async function ensureHostPermission(siteUrl: string): Promise<boolean> {
	const pattern = `${siteUrl}/*`;
	const granted = await chrome.permissions.contains({ origins: [pattern] });
	if (granted) return true;
	return chrome.permissions.request({ origins: [pattern] });
}
