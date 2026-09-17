// Defaults for new deployments with no saved settings.
// Explicitly saved values take precedence, including empty strings such as a disabled icon service.
// Fill only missing keys; administrators can override defaults at any time.
export const DEFAULT_SETTINGS: Record<string, string> = {
	// Enable compact mode by default for faster scanning and higher bookmark density.
	"appearance.compact": "1",
	// Category navigation is off by default to avoid clutter with small collections.
	"appearance.anchorNav": "0",
	// Show the repository link by default so visitors can find the source; administrators can disable it.
	"showGithubLink": "1",
	// Public page style: classic cards or liquid glass (translucent surfaces and a gradient background).
	"appearance.style": "classic",
	// Use favicon.im by default so icons work without additional configuration.
	"icon.service": "https://favicon.im/{domain}",
	// Scheduled tasks start disabled; enable them individually in the admin Scheduled tasks page.
	"maintenance.checkLinks": "0",
	"maintenance.backup": "0",
	// UTC+8 schedules use daily, weekly, or monthly frequency, with weekday or monthday when applicable.
	"deadLink.schedule": '{"freq":"daily","hour":4,"weekday":1,"monthday":1}',
	"backup.schedule": '{"freq":"daily","hour":5,"weekday":1,"monthday":1}',
};

export function mergeDefaultSettings(rows: { key: string; value: string }[]) {
	const map = new Map(rows.map((r) => [r.key, r.value]));
	for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
		if (!map.has(key)) map.set(key, value);
	}
	return Object.fromEntries(map);
}
