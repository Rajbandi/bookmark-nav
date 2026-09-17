// Try HEAD first, then GET; mark only 404, 410, or network failures as dead to avoid false positives from bot protection.
// Shared by manual admin link checks and scheduled tasks.
export async function checkUrl(url: string): Promise<boolean> {
	const headers = {
		"User-Agent":
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
	};
	try {
		const res = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			headers,
			signal: AbortSignal.timeout(8000),
		});
		if (res.status < 400) return true;
	} catch {
		// Retry with GET as a fallback.
	}
	try {
		const res = await fetch(url, {
			method: "GET",
			redirect: "follow",
			headers,
			signal: AbortSignal.timeout(8000),
		});
		return res.status !== 404 && res.status !== 410;
	} catch {
		return false;
	}
}
