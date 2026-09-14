// 浏览器插件访问令牌(PAT):明文仅生成时返回一次,库里只存 SHA-256。
// 前缀用于快速区分 Bearer 令牌与 JWT cookie,避免无谓的哈希与查库
const TOKEN_PREFIX = "bnav_";

export function generateApiToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	return `${TOKEN_PREFIX}${hex}`;
}

export function isApiToken(token: string): boolean {
	return token.startsWith(TOKEN_PREFIX) && token.length === TOKEN_PREFIX.length + 64;
}

export async function hashApiToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

// 令牌末 4 位,后台展示用于辨认,不含任何可逆信息
export function tokenHint(token: string): string {
	return token.slice(-4);
}
