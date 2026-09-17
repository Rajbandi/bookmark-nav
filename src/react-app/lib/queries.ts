import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "./api";

// Include authentication in dependent query keys or invalidate those queries when authentication changes.
export function useAuthStatus() {
	return useQuery({
		queryKey: ["auth-status"],
		queryFn: async () => {
			const res = await client.api.auth.status.$get();
			if (!res.ok) throw new Error("Could not check sign-in status");
			return res.json();
		},
		staleTime: 60_000,
	});
}

export function useLogout() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			await client.api.auth.logout.$post();
		},
		onSuccess: () => qc.invalidateQueries(),
	});
}

export function useNavData() {
	const { data: auth } = useAuthStatus();
	return useQuery({
		// Refetch automatically when authentication changes.
		queryKey: ["nav-bookmarks", auth?.authenticated ?? false],
		queryFn: async () => {
			const res = await client.api.public.bookmarks.$get();
			if (!res.ok) throw new Error("Could not load bookmarks");
			return res.json();
		},
	});
}

export function useSiteSettings() {
	return useQuery({
		queryKey: ["site-settings"],
		queryFn: async () => {
			const res = await client.api.public.site.$get();
			if (!res.ok) throw new Error("Could not load site settings");
			return res.json() as Promise<Record<string, string>>;
		},
		staleTime: 5 * 60_000,
	});
}

export function useAISearchConfig() {
	return useQuery({
		queryKey: ["ai-config"],
		queryFn: async () => {
			const res = await client.api.public["ai-config"].$get();
			if (!res.ok) return { aiEnabled: false, semanticSearch: false };
			return res.json() as Promise<{ aiEnabled: boolean; semanticSearch: boolean }>;
		},
		staleTime: 5 * 60_000,
	});
}
