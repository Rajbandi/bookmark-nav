import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
	Bookmark,
	CalendarClock,
	FolderTree,
	Home,
	LogOut,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Settings,
	Share2,
	Shield,
	Palette,
	Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuthStatus, useLogout } from "@/lib/queries";

const navItems = [
	{ to: "/admin", end: true, icon: Bookmark, label: "Bookmarks" },
	{ to: "/admin/categories", end: false, icon: FolderTree, label: "Categories" },
	{ to: "/admin/import-export", end: false, icon: Share2, label: "Import / Export" },
	{ to: "/admin/maintenance", end: false, icon: CalendarClock, label: "Scheduled tasks" },
	{ to: "/admin/settings", end: false, icon: Settings, label: "Site settings" },
	{ to: "/admin/appearance", end: false, icon: Palette, label: "Appearance" },
	{ to: "/admin/security", end: false, icon: Shield, label: "Security" },
	{ to: "/admin/ai", end: false, icon: Sparkles, label: "AI settings" },
];

// Shared navigation content for the sidebar and mobile drawer.
// collapsed hides labels on desktop; the mobile drawer always passes false.
function NavContent({
	onNavigate,
	collapsed = false,
}: {
	onNavigate?: () => void;
	collapsed?: boolean;
}) {
	const navigate = useNavigate();
	const logout = useLogout();
	return (
		<>
			<nav className="flex flex-1 flex-col gap-1">
				{navItems.map(({ to, end, icon: Icon, label }) => (
					<NavLink
						key={to}
						to={to}
						end={end}
						title={collapsed ? label : undefined}
						onClick={onNavigate}
						className={({ isActive }) =>
							cn(
								"flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
								collapsed && "justify-center px-0",
								isActive
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)
						}
					>
						<Icon className="size-4 shrink-0" />
						{!collapsed && label}
					</NavLink>
				))}
			</nav>
			<div className="flex flex-col gap-1 border-t pt-3">
				<Button
					variant="ghost"
					size="sm"
					className={cn("justify-start", collapsed && "justify-center px-0")}
					asChild
				>
					<Link to="/" onClick={onNavigate} title={collapsed ? "Back to site" : undefined}>
						<Home className="size-4 shrink-0" />
						{!collapsed && "Back to site"}
					</Link>
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"justify-start text-muted-foreground",
						collapsed && "justify-center px-0",
					)}
					title={collapsed ? "Sign out" : undefined}
					onClick={async () => {
						await logout.mutateAsync();
						navigate("/");
					}}
				>
					<LogOut className="size-4 shrink-0" />
					{!collapsed && "Sign out"}
				</Button>
			</div>
		</>
	);
}

export default function AdminLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: auth, isLoading } = useAuthStatus();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(false);

	// Show the current route title in the fixed header.
	const currentTitle =
		navItems.find(({ to, end }) =>
			end ? location.pathname === to : location.pathname.startsWith(to),
		)?.label ?? "Admin";

	// Redirect unauthenticated users to sign-in.
	useEffect(() => {
		if (!isLoading && auth && !auth.authenticated) {
			navigate("/login", { replace: true });
		}
	}, [auth, isLoading, navigate]);

	if (isLoading || !auth?.authenticated) {
		return (
			<div className="flex min-h-screen items-center justify-center text-muted-foreground">
				Loading…
			</div>
		);
	}

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-muted/40 md:flex-row">
			{/* Fixed mobile header with menu button and navigation drawer. */}
			<header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden">
				<Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
					<SheetTrigger asChild>
						<Button variant="ghost" size="icon" aria-label="Open menu">
							<Menu className="size-5" />
						</Button>
					</SheetTrigger>
					<SheetContent side="left" className="flex w-64 flex-col p-4">
						<SheetHeader className="p-0">
							<SheetTitle className="px-2 text-left">Admin</SheetTitle>
						</SheetHeader>
						<NavContent onNavigate={() => setDrawerOpen(false)} />
					</SheetContent>
				</Sheet>
				<span className="font-bold">{currentTitle}</span>
			</header>

			{/* Fixed desktop sidebar with independent scrolling and an icon-only collapsed state. */}
			<aside
				className={cn(
					"hidden shrink-0 flex-col overflow-y-auto border-r bg-background p-4 transition-[width] duration-200 md:flex",
					collapsed ? "w-16" : "w-56",
				)}
			>
				<div
					className={cn(
						"mb-6 flex items-center px-2",
						collapsed ? "justify-center" : "justify-between",
					)}
				>
					{!collapsed && <span className="text-lg font-bold">Admin</span>}
					<Button
						variant="ghost"
						size="icon"
						className="size-8 shrink-0"
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						onClick={() => setCollapsed((v) => !v)}
					>
						{collapsed ? (
							<PanelLeftOpen className="size-4" />
						) : (
							<PanelLeftClose className="size-4" />
						)}
					</Button>
				</div>
				<NavContent collapsed={collapsed} />
			</aside>

			{/* Fixed page title above independently scrolling content; min-h-0 allows the flex child to shrink. */}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<header className="hidden h-14 shrink-0 items-center border-b bg-background px-6 md:flex">
					<h1 className="text-lg font-bold">{currentTitle}</h1>
				</header>
				<main className="flex-1 overflow-y-auto p-4 md:p-6">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
