import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TitleSync } from "@/components/title-sync";
import "./index.css";
import Home from "./pages/Home";
import Login from "./pages/Login";

// Lazy-load admin routes to keep the public page initial load small.
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminBookmarks = lazy(() => import("./pages/admin/AdminBookmarks"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminAppearance = lazy(() => import("./pages/admin/AdminAppearance"));
const AdminSecurity = lazy(() => import("./pages/admin/AdminSecurity"));
const AdminImportExport = lazy(() => import("./pages/admin/AdminImportExport"));
const AdminMaintenance = lazy(() => import("./pages/admin/AdminMaintenance"));
const AdminAI = lazy(() => import("./pages/admin/AdminAI"));

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: 1, refetchOnWindowFocus: false },
	},
});

// Apply the saved dark-mode preference before React mounts to avoid flashing; next-themes takes over afterward.
const stored = localStorage.getItem("theme");
if (
	stored === "dark" ||
	((!stored || stored === "system") &&
		window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
	document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
				<QueryClientProvider client={queryClient}>
					<TitleSync />
					<BrowserRouter>
					<Suspense
						fallback={
							<div className="flex min-h-screen items-center justify-center text-muted-foreground">
								Loading…
							</div>
						}
					>
						<Routes>
							<Route path="/" element={<Home />} />
							<Route path="/login" element={<Login />} />
							<Route path="/admin" element={<AdminLayout />}>
								<Route index element={<AdminBookmarks />} />
								<Route path="categories" element={<AdminCategories />} />
								<Route path="import-export" element={<AdminImportExport />} />
								<Route path="maintenance" element={<AdminMaintenance />} />
								<Route path="settings" element={<AdminSettings />} />
								<Route path="appearance" element={<AdminAppearance />} />
								<Route path="security" element={<AdminSecurity />} />
								<Route path="ai" element={<AdminAI />} />
								</Route>
						</Routes>
					</Suspense>
				</BrowserRouter>
				<Toaster position="top-center" />
			</QueryClientProvider>
		</ThemeProvider>
	</StrictMode>,
);
