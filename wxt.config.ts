import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// 浏览器插件构建配置:源码在 src/extension,与 worker/react-app 平级
export default defineConfig({
	srcDir: "src/extension",
	// WXT 默认把仓库根目录的 public/ 当插件静态资源拷进包里(带入了 _headers 等),
	// 指到插件自己的空目录,避免混入网站专属文件
	publicDir: "src/extension/public",
	modules: ["@wxt-dev/module-react"],
	// 别名:仅 @app 指向主前端 src/react-app(供插件复用 shadcn/ui 组件)。
	// 注意 WXT 会把 "@" 固定映射到插件 srcDir(无法覆盖),因此 shadcn 组件内部
	// 的 `import ... from "@/lib/utils"` 会落到 src/extension/lib/utils.ts 这个转发 shim 上
	alias: {
		"@app": path.resolve(process.cwd(), "src/react-app"),
	},
	manifest: ({ browser }) => ({
		name: "Bookmark Nav 收藏助手",
		version: "0.1.0",
		description: "一键收藏网页到你的 Bookmark Nav 导航站",
		// 最小权限集:不申请 <all_urls>,站点权限由用户在 options 配置时动态授予
		permissions: ["storage", "activeTab", "contextMenus"],
		optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
		action: {},
		// Firefox 发布必须的扩展 ID,Chrome 会忽略
		...(browser === "firefox"
			? { browser_specific_settings: { gecko: { id: "bookmark-nav-ext@deer.dev" } } }
			: {}),
	}),
	vite: () => ({
		plugins: [tailwindcss()],
	}),
});
