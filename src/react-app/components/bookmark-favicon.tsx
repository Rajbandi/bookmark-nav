import { useMemo, useState } from "react";
import { bookmarkIconCandidates, type Bookmark } from "@/lib/api";

// 首字母回退的底色调色板(oklch):按域名 hash 取色,保证同一站点颜色稳定且分布均匀
const PALETTE_HUES = [260, 300, 330, 10, 40, 90, 140, 175, 205, 235];

function hashHostname(hostname: string): number {
	let h = 0;
	for (let i = 0; i < hostname.length; i++) {
		h = (h * 31 + hostname.charCodeAt(i)) >>> 0;
	}
	return h;
}

// 图标加载全部失败时的首字母占位:取主域名首字符 + 稳定底色,比灰色地球更有辨识度
function LetterTile({ bookmark }: { bookmark: Bookmark }) {
	const info = useMemo(() => {
		let host = "bookmark-nav";
		try {
			host = new URL(bookmark.url).hostname.replace(/^www\./, "");
		} catch {
			// 非法 URL 沿用默认名
		}
		const letter = (Array.from(host)[0] ?? "?").toUpperCase();
		const hue = PALETTE_HUES[hashHostname(host) % PALETTE_HUES.length];
		return { letter, background: `oklch(0.65 0.13 ${hue})` };
	}, [bookmark.url]);
	return (
		<span
			aria-hidden
			className="flex h-full w-full items-center justify-center font-semibold text-white"
			style={{ backgroundColor: info.background }}
		>
			{info.letter}
		</span>
	);
}

// 书签图标:自定义 icon → 图标服务 → 全部失败时回退为「首字母 + 稳定底色」占位
export function BookmarkFavicon({
	bookmark,
	iconService,
	className,
}: {
	bookmark: Bookmark;
	iconService?: string;
	className?: string;
}) {
	const sources = useMemo(
		() => bookmarkIconCandidates(bookmark, iconService),
		[bookmark, iconService],
	);
	const [index, setIndex] = useState(0);
	const [lastKey, setLastKey] = useState({ bookmark, iconService });
	// 书签或图标服务变化时重置候选下标(渲染期间调整 state)
	if (lastKey.bookmark !== bookmark || lastKey.iconService !== iconService) {
		setLastKey({ bookmark, iconService });
		setIndex(0);
	}
	const src = sources[index];
	if (!src) return <LetterTile bookmark={bookmark} />;
	return (
		<img
			key={src}
			src={src}
			alt=""
			className={className}
			loading="lazy"
			onError={() => setIndex((i) => i + 1)}
		/>
	);
}
