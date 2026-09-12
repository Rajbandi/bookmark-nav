import { useEffect } from "react";
import { useSiteSettings } from "@/lib/queries";

// 浏览器标签页标题跟随后台「站点名称」设置,未配置时用默认名
export function TitleSync() {
	const { data: site } = useSiteSettings();
	useEffect(() => {
		document.title = site?.siteName || "书签导航";
	}, [site?.siteName]);
	return null;
}
