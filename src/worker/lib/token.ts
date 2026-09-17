// Browser extension access tokens: return plaintext once and store only SHA-256.
// Use the prefix to distinguish Bearer tokens from JWT cookies without unnecessary hashing or database queries.
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

// Last four token characters for identification; no reversible token data.
export function tokenHint(token: string): string {
	return token.slice(-4);
}
