// Background script: bookmark links from the context menu and report results through the badge.
// Read the token and site configuration from storage each time; the service worker can stop at any time.
export default defineBackground(() => {
	chrome.runtime.onInstalled.addListener(() => {
		chrome.contextMenus.create({
			id: "save-link",
			title: "Save to Bookmark Nav",
			contexts: ["link"],
		});
	});

	chrome.contextMenus.onClicked.addListener(async (info) => {
		if (info.menuItemId !== "save-link" || !info.linkUrl) return;
		// Some @types/chrome versions omit linkText, so extend the type here.
		const linkText = (info as chrome.contextMenus.OnClickData & { linkText?: string }).linkText;
		await saveLink(info.linkUrl, linkText ?? info.linkUrl);
	});

	async function saveLink(url: string, title: string) {
		const { loadConfig } = await import("../lib/config");
		const { createBookmark } = await import("../lib/api");
		const cfg = await loadConfig();
		const fail = () => setBadge("!", "#dc2626");
		if (!cfg) return fail();
		try {
			await createBookmark({ title: title.slice(0, 200), url });
			setBadge("✓", "#16a34a");
		} catch (err) {
			console.error("[Bookmark Nav] Failed to save bookmark:", err);
			fail();
		}
	}

	function setBadge(text: string, color: string) {
		chrome.action.setBadgeText({ text });
		chrome.action.setBadgeBackgroundColor({ color });
		setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
	}
});
