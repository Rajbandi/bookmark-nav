import {
	lazy,
	Suspense,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Link } from "react-router-dom";
import {
	Inbox,
	Loader2,
	Lock,
	Moon,
	Pin,
	Search,
	SearchX,
	Settings,
	LogOut,
	Sun,
	User,
	Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	client,
	flattenCategoryTree,
	type Bookmark,
	type Category,
} from "@/lib/api";
import { BookmarkFavicon } from "@/components/bookmark-favicon";
import { useAuthStatus, useLogout, useNavData, useSiteSettings, useAISearchConfig } from "@/lib/queries";

function sectionId(category: Category | null) {
	return `cat-${category?.id ?? "uncategorized"}`;
}

const subscribeNoop = () => () => {};

// Project repository URL; visibility is controlled by the admin GitHub link setting.
const GITHUB_REPO_URL = "https://github.com/deerwan/bookmark-nav";

// Lazy-load footer Markdown only when footer content is configured.
const FooterContent = lazy(() => import("@/components/footer-content"));

// Inline the official GitHub octicon because lucide no longer includes brand icons.
function GithubIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
			<path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
		</svg>
	);
}

// Wait for hydration before rendering the theme icon to prevent an initial theme mismatch.
function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const mounted = useSyncExternalStore(
		subscribeNoop,
		() => true,
		() => false,
	);
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label="Toggle theme"
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
		>
			{mounted && resolvedTheme === "dark" ? (
				<Sun className="size-4.5" />
			) : (
				<Moon className="size-4.5" />
			)}
		</Button>
	);
}

function BookmarkCard({
	bookmark,
	compact = false,
	iconService,
}: {
	bookmark: Bookmark;
	compact?: boolean;
	iconService?: string;
}) {

	return (
		<a
			href={bookmark.url}
			target="_blank"
			rel="noreferrer"
			title={bookmark.title}
			onClick={() => {
				// Report the click without blocking navigation.
				void client.api.public.bookmarks[":id"].click.$post({
					param: { id: String(bookmark.id) },
				});
			}}
			className={
				compact
					? "group flex items-center gap-2 rounded-lg border bg-card p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
					: "group flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
			}
		>
			<div
				className={
					compact
						? "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-icon-tile text-xs"
						: "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-icon-tile text-base"
				}
			>
				<BookmarkFavicon
					bookmark={bookmark}
					iconService={iconService}
					className={
						compact ? "size-4.5 text-muted-foreground" : "size-6 text-muted-foreground"
					}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span
						className={
							compact
								? "truncate text-sm font-medium group-hover:text-primary"
								: "truncate font-medium group-hover:text-primary"
						}
					>
						{bookmark.title}
					</span>
					{bookmark.isPinned && <Pin className="size-3.5 shrink-0 text-amber-500" />}
					{bookmark.visibility === "private" && (
						<Lock className="size-3.5 shrink-0 text-muted-foreground" />
					)}
				</div>
				{!compact && bookmark.description && (
					<p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
						{bookmark.description}
					</p>
				)}
				{!compact && bookmark.tags.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1">
						{bookmark.tags.map((t) => (
							<Badge key={t} variant="secondary" className="px-1.5 py-0 text-xs">
								{t}
							</Badge>
						))}
					</div>
				)}
			</div>
		</a>
	);
}

export default function Home() {
	const { data: auth } = useAuthStatus();
	const { data, isLoading, isError } = useNavData();
	const { data: site } = useSiteSettings();
	const { data: aiConfig } = useAISearchConfig();
	const logout = useLogout();
	const [keyword, setKeyword] = useState("");
	const [aiSearch, setAiSearch] = useState(false);
	const [aiResults, setAiResults] = useState<Bookmark[] | null>(null);
	const [aiLoading, setAiLoading] = useState(false);
	const [activeSection, setActiveSection] = useState<string | null>(null);
	const [searchFocused, setSearchFocused] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);

	const siteName = site?.siteName || "Bookmark Nav";
	// Compact mode is stored in the database and applies to all visitors.
	const compact = site?.["appearance.compact"] === "1";
	// Category navigation is off by default and hidden when fewer than three categories are visible.
	const anchorNav = site?.["appearance.anchorNav"] === "1";
	// The admin setting controls the repository link in the top-right corner.
	const showGithubLink = site?.["showGithubLink"] === "1";
	// Visual style: classic cards or liquid glass (the .glass variables in index.css).
	const glassStyle = site?.["appearance.style"] === "glass";
	// Use adaptive columns for compact cards to avoid excess space in small categories.
	const compactGrid = "grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2";
	const normalGrid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
	const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform ?? "");

	// AI semantic search through /api/public/search/semantic.
	async function runAISearch(q: string) {
		if (!q.trim() || !aiConfig?.semanticSearch) return;
		setAiLoading(true);
		try {
			const res = await client.api.public["search"].semantic.$get({ query: { q } });
			if (res.ok) {
				const body = (await res.json()) as { bookmarks: Bookmark[] };
				setAiResults(body.bookmarks);
			} else {
				setAiResults(null);
			}
		} catch {
			setAiResults(null);
		} finally {
			setAiLoading(false);
		}
	}

	// Return to local filtering when AI is disabled or the query is cleared.
	useEffect(() => {
		if (!aiSearch || !keyword.trim()) setAiResults(null);
	}, [aiSearch, keyword]);

	// Global keyboard shortcuts: Cmd+K, Ctrl+K, or / focus the search field.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const typing =
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);
			if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
				e.preventDefault();
				searchRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const aiActive = aiSearch && aiResults !== null;
	// Defer filtering by a frame to keep typing responsive with large bookmark collections.
	const deferredKeyword = useDeferredValue(keyword);

	// Show AI results when available; otherwise filter locally by title, description, URL, and tags.
	const displayBookmarks = useMemo(() => {
		if (aiResults !== null) return aiResults;
		const all = data?.bookmarks ?? [];
		const q = deferredKeyword.trim().toLowerCase();
		if (!q) return all;
		return all.filter((b) =>
			[b.title, b.description ?? "", b.url, ...b.tags]
				.join(" ")
				.toLowerCase()
				.includes(q),
		);
	}, [aiResults, deferredKeyword, data]);

	// Flatten categories depth-first; abbreviate long ancestor paths to an ellipsis and the parent name.
	const grouped = useMemo(() => {
		const flat = flattenCategoryTree(data?.categories ?? []);
		const groups: {
			category: Category | null;
			parentPath: string;
			items: Bookmark[];
		}[] = flat.map(({ category, path }) => {
			const segments = path.split(" / ").slice(0, -1);
			return {
				category,
				parentPath:
					segments.length > 2
						? `… / ${segments[segments.length - 1]}`
						: segments.join(" / "),
				items: [],
			};
		});
		const uncategorized: Bookmark[] = [];
		const byId = new Map(groups.map((g) => [g.category!.id, g]));
		for (const b of displayBookmarks) {
			const g = b.categoryId !== null ? byId.get(b.categoryId) : undefined;
			if (g) g.items.push(b);
			else uncategorized.push(b);
		}
		if (uncategorized.length > 0)
			groups.push({ category: null, parentPath: "", items: uncategorized });
		return groups.filter((g) => g.items.length > 0);
	}, [data, displayBookmarks]);

	// Highlight category navigation while scrolling; subscribe only when the section IDs change.
	const groupedKey = grouped.map((g) => sectionId(g.category)).join("|");
	useEffect(() => {
		const sections = groupedKey
			.split("|")
			.filter(Boolean)
			.map((id) => document.getElementById(id))
			.filter((el): el is HTMLElement => el !== null);
		if (sections.length === 0) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) setActiveSection(entry.target.id);
				}
			},
			// Use the band between 10% and 30% of the viewport height to identify the active section.
			{ rootMargin: "-10% 0px -70% 0px" },
		);
		sections.forEach((s) => observer.observe(s));
		return () => observer.disconnect();
	}, [groupedKey]);

	function scrollToSection(category: Category | null) {
		// Highlight immediately on click, including on short pages that cannot scroll to the target position.
		setActiveSection(sectionId(category));
		document
			.getElementById(sectionId(category))
			?.scrollIntoView({
				behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
					? "auto"
					: "smooth",
				block: "start",
			});
	}

	return (
		<div className={`min-h-screen bg-background${glassStyle ? " glass" : ""}`}>
			<header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-6xl items-center gap-x-3 px-4">
					{/* Sticky command bar: site name, centered search, and icons. Hide the name on small screens to make room. */}
					<Link
						to="/"
						className="hidden min-w-0 flex-1 truncate text-lg font-bold sm:block"
					>
						{siteName}
					</Link>
					<div className="relative w-full max-w-md">
						<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							ref={searchRef}
							value={keyword}
							aria-label="Search bookmarks"
							onChange={(e) => {
								const v = e.target.value;
								setKeyword(v);
								if (aiSearch && v.trim()) void runAISearch(v);
							}}
							onFocus={() => setSearchFocused(true)}
							onBlur={() => setSearchFocused(false)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && aiSearch && keyword.trim())
									void runAISearch(keyword);
								if (e.key === "Escape") e.currentTarget.blur();
							}}
							placeholder={aiSearch ? "Search naturally, e.g. CSS tools…" : "Search bookmarks…"}
							className="h-9 rounded-full pr-12 pl-9"
						/>
						{aiConfig?.semanticSearch ? (
							aiLoading ? (
								<Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
							) : (
								<button
									type="button"
									onClick={() => setAiSearch((v) => !v)}
									aria-label="AI semantic search"
									aria-pressed={aiSearch}
									title="AI semantic search"
									className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-muted"
								>
									<Sparkles
										className={`size-4 ${aiSearch ? "text-orange-500" : "text-muted-foreground"}`}
									/>
								</button>
							)
						) : aiLoading ? (
							<Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
						) : (
							!searchFocused &&
							!keyword && (
								<kbd className="pointer-events-none absolute top-1/2 right-3.5 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:block">
									{isMac ? "⌘K" : "Ctrl K"}
								</kbd>
							)
						)}
					</div>
					<div className="flex flex-1 items-center justify-end gap-1">
						{showGithubLink && (
							<Button variant="ghost" size="icon" asChild aria-label="GitHub repository">
								<a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
									<GithubIcon className="size-4.5" />
								</a>
							</Button>
						)}
						<ThemeToggle />
						{auth?.authenticated ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" aria-label="Account menu">
										<User className="size-4.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild>
										<Link to="/admin">
											<Settings className="size-4" /> Admin
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => logout.mutate()}>
										<LogOut className="size-4" /> Sign out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<Button variant="ghost" size="sm" asChild>
								<Link to="/login">Sign in</Link>
							</Button>
						)}
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-6xl px-4 py-8" aria-busy={isLoading || undefined}>
				{/* Admin-controlled category navigation, hidden when fewer than three categories are visible. */}
				{anchorNav && grouped.length >= 3 && (
					<nav
						aria-label="Category navigation"
						className="mx-auto mb-8 flex max-w-2xl flex-wrap items-center justify-center gap-2"
					>
						{grouped.map(({ category, items }) => {
							const id = sectionId(category);
							return (
								<button
									key={id}
									type="button"
									onClick={() => scrollToSection(category)}
									className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
										activeSection === id
											? "border-primary/30 bg-primary/10 font-medium text-primary"
											: "bg-card text-muted-foreground hover:border-input hover:text-foreground"
									}`}
								>
									{category?.icon && <span>{category.icon}</span>}
									{category?.name ?? "Uncategorized"}
									<span className="text-xs opacity-70">{items.length}</span>
								</button>
							);
						})}
					</nav>
				)}
				{isLoading && (
					<div className="space-y-10" aria-hidden>
						{[0, 1, 2].map((s) => (
							<div key={s}>
								<div className="mb-4 h-5 w-28 animate-pulse rounded bg-muted" />
								<div className={compact ? compactGrid : normalGrid}>
									{Array.from({ length: compact ? 7 : 4 }).map((_, i) => (
										<div
											key={i}
											className={
												compact
													? "h-11 animate-pulse rounded-lg bg-muted"
													: "h-20 animate-pulse rounded-xl bg-muted"
											}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				)}
				{isError && (
					<p className="py-20 text-center text-destructive">Could not load. Refresh and try again.</p>
				)}
				{grouped.map(({ category, parentPath, items }) => (
					<section
						key={category?.id ?? "uncategorized"}
						id={sectionId(category)}
						className={`scroll-mt-20 ${compact ? "mb-6" : "mb-10"}`}
					>
						<h2
							className={
								compact
									? "mb-2 flex items-center gap-2 text-sm font-semibold"
									: "mb-4 flex items-center gap-2 text-base font-semibold"
							}
						>
							{category?.icon && <span>{category.icon}</span>}
							{parentPath && (
								<span className="font-normal text-muted-foreground">
									{parentPath} /
								</span>
							)}
							{category?.name ?? "Uncategorized"}
							{category?.visibility === "private" && (
								<Lock className="size-3.5 text-muted-foreground" />
							)}
							<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
								{items.length}
							</span>
						</h2>
						<div className={compact ? compactGrid : normalGrid}>
							{items.map((b) => (
								<BookmarkCard
									key={b.id}
									bookmark={b}
									compact={compact}
									iconService={site?.["icon.service"]}
								/>
							))}
						</div>
					</section>
				))}
				{!isLoading && !isError && grouped.length === 0 && (
					<div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
						{aiActive || keyword ? (
							<SearchX className="size-10 stroke-[1.5]" />
						) : (
							<Inbox className="size-10 stroke-[1.5]" />
						)}
						<p>
							{aiActive
								? "AI found no relevant bookmarks. Try rephrasing your search."
								: keyword
									? "No matching bookmarks"
									: "No bookmarks yet. Sign in to admin to add some."}
						</p>
					</div>
				)}
			</main>
			{site?.footer && (
				<footer className="border-t py-6 text-center text-sm text-muted-foreground">
					{/* Show plain text while the Markdown chunk loads to avoid content jumps. */}
					<Suspense fallback={site.footer}>
						<FooterContent text={site.footer} />
					</Suspense>
				</footer>
			)}
		</div>
	);
}
