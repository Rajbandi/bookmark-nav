// PBKDF2 password hashing through Web Crypto because Workers cannot use bcrypt.
const ITERATIONS = 100_000;

function toHex(buf: Uint8Array): string {
	return Array.from(buf)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function fromHex(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ITERATIONS },
		key,
		256,
	);
	return new Uint8Array(bits);
}

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

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derive(password, salt);
	return `${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const [saltHex, hashHex] = stored.split(":");
	if (!saltHex || !hashHex) return false;
	const hash = await derive(password, fromHex(saltHex));
	const expected = fromHex(hashHex);
	if (hash.length !== expected.length) return false;
	// Use constant-time comparison to avoid timing side channels.
	let diff = 0;
	for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
	return diff === 0;
}
