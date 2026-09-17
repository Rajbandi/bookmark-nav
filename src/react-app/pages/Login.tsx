import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/lib/api";
import { useAuthStatus } from "@/lib/queries";

// Show administrator setup instead of sign-in when the site has not been initialized.
export default function Login() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const { data: auth, isLoading } = useAuthStatus();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const isSetup = auth ? !auth.initialized : false;

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		try {
			const body = { json: { username, password } };
			const res = isSetup
				? await client.api.auth.setup.$post(body)
				: await client.api.auth.login.$post(body);
			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				toast.error(data.error ?? (isSetup ? "Setup failed" : "Sign-in failed"));
				return;
			}
			await qc.invalidateQueries();
			toast.success(isSetup ? "Administrator account created" : "Signed in");
			navigate("/");
		} catch {
			toast.error("Network error. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>{isSetup ? "Create administrator" : "Sign in"}</CardTitle>
					<CardDescription>
						{isSetup
							? "Create an administrator account to get started."
							: "Sign in to view private bookmarks and manage your site."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">Username</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								autoComplete="username"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete={isSetup ? "new-password" : "current-password"}
								minLength={6}
								required
							/>
						</div>
						<Button type="submit" className="w-full" disabled={submitting || isLoading}>
							{submitting ? "Submitting…" : isSetup ? "Create account and sign in" : "Sign in"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
