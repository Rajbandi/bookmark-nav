import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Extension build configuration: src/extension is alongside worker and react-app.
export default defineConfig({
	srcDir: "src/extension",
	// WXT defaults to copying the repository public directory, which contains website-only assets.
	// Use the extension public directory to keep those assets out of the extension package.
	publicDir: "src/extension/public",
	modules: ["@wxt-dev/module-react"],
	// Only @app aliases the main frontend so the extension can reuse shadcn/ui components.
	// WXT fixes @ to the extension srcDir, so shared component imports cannot override it.
	// Imports of @/lib/utils therefore resolve to the forwarding shim at src/extension/lib/utils.ts.
	alias: {
		"@app": path.resolve(process.cwd(), "src/react-app"),
	},
	manifest: ({ browser }) => ({
		name: "Bookmark Nav Assistant",
		version: "0.1.0",
		description: "Save web pages to your Bookmark Nav site with one click",
		// Minimal permissions: request site access dynamically in settings instead of requesting <all_urls>.
		permissions: ["storage", "activeTab", "contextMenus"],
		optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
		action: {},
		// Extension ID required for Firefox publishing; ignored by Chrome.
		...(browser === "firefox"
			? { browser_specific_settings: { gecko: { id: "bookmark-nav-ext@deer.dev" } } }
			: {}),
	}),
	// Release packaging configuration.
	zip: {
		// Include only source needed to rebuild the Firefox extension, excluding main-site build output.
		excludeSources: ["dist/**"],
	},
	vite: () => ({
		plugins: [tailwindcss()],
	}),
});
