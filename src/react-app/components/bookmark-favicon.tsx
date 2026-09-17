import { useMemo, useState } from "react";
import { bookmarkIconCandidates, type Bookmark } from "@/lib/api";

// Initial fallback colors (oklch): hash the domain for stable, evenly distributed colors.
const PALETTE_HUES = [260, 300, 330, 10, 40, 90, 140, 175, 205, 235];

function hashHostname(hostname: string): number {
	let h = 0;
	for (let i = 0; i < hostname.length; i++) {
		h = (h * 31 + hostname.charCodeAt(i)) >>> 0;
	}
	return h;
}

// When all icons fail, use the first domain letter on a stable background for an identifiable placeholder.
function LetterTile({ bookmark }: { bookmark: Bookmark }) {
	const info = useMemo(() => {
		let host = "bookmark-nav";
		try {
			host = new URL(bookmark.url).hostname.replace(/^www\./, "");
		} catch {
			// Use the default name for invalid URLs.
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

// Bookmark icon fallback: custom icon, icon service, then the domain initial on a stable background.
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
	// Reset the candidate index when the bookmark or service changes (adjust state during render).
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
