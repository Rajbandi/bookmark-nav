// 新部署未写入任何设置时的开箱默认值。
// 合并规则:显式保存过的值始终优先(包括空字符串,如清空图标服务即表示关闭),
// 只对缺失的 key 补默认,管理员随时可以在后台覆盖。
export const DEFAULT_SETTINGS: Record<string, string> = {
	// 紧凑模式默认开启:导航站以快速定位为主,小卡片信息密度更高
	"appearance.compact": "1",
	// 分类锚点导航默认关闭:分类少时是视觉噪音,书签多了由管理员在后台打开
	"appearance.anchorNav": "0",
	// 前台右上角默认显示项目仓库入口,便于访客找到源码;不想要可在后台关闭
	"showGithubLink": "1",
	// 前台界面风格:classic 传统卡片,glass 液态玻璃(半透明表面 + 渐变背景)
	"appearance.style": "classic",
	// 图标服务默认走 favicon.im,部署后无需配置即可显示网站图标
	"icon.service": "https://favicon.im/{domain}",
};

export function mergeDefaultSettings(rows: { key: string; value: string }[]) {
	const map = new Map(rows.map((r) => [r.key, r.value]));
	for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
		if (!map.has(key)) map.set(key, value);
	}
	return Object.fromEntries(map);
}
