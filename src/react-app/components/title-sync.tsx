import { useEffect } from "react";
import { useSiteSettings } from "@/lib/queries";

// Use the configured site name for the browser tab title, falling back to the default.
export function TitleSync() {
	const { data: site } = useSiteSettings();
	useEffect(() => {
		document.title = site?.siteName || "Bookmark Nav";
	}, [site?.siteName]);
	return null;
}
