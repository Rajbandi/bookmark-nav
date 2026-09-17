import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStatus } from "@/lib/queries";
import {
	useChangePassword,
	useChangeUsername,
	useCreateApiToken,
	useApiToken,
	useRevokeApiToken,
} from "@/lib/admin-queries";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";

// Browser extension token card: generate a token (shown once) or revoke it.
function ApiTokenCard() {
	const { data: status } = useApiToken();
	const createToken = useCreateApiToken();
	const revokeToken = useRevokeApiToken();
	const [confirm, setConfirm] = useState<ConfirmState | null>(null);
	// Display the newly generated plaintext token only in this session; it cannot be viewed after closing.
	const [freshToken, setFreshToken] = useState<string | null>(null);

	function handleCreate() {
		createToken.mutate(undefined, {
			onSuccess: (data) => setFreshToken(data?.token ?? null),
		});
	}

	function askRotate() {
		setConfirm({
			title: "Regenerate token?",
			description: "The old token will stop working immediately. Update configured browser extensions with the new token.",
			confirmText: "Regenerate",
			onConfirm: handleCreate,
		});
	}

	function askRevoke() {
		setConfirm({
			title: "Revoke token?",
			description: "All browser extensions using this token will immediately lose access.",
			confirmText: "Revoke",
			onConfirm: () => {
				setFreshToken(null);
				revokeToken.mutate();
			},
		});
	}

	function handleCopy() {
		if (!freshToken) return;
		navigator.clipboard
			.writeText(freshToken)
			.then(() => toast.success("Copied to clipboard"))
			.catch(() => toast.error("Could not copy. Select and copy the text manually."));
	}

	const createdAt = status?.createdAt ? new Date(status.createdAt).toLocaleString("en-US") : null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Browser extension token</CardTitle>
				<CardDescription>
					Generate an access token for the browser extension. It grants administrator access, so keep it secure. The token is shown only once and is intended for extension configuration.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{freshToken ? (
					<div className="space-y-2">
						<Label htmlFor="api-token">Token (shown once; unavailable after closing)</Label>
						<div className="flex gap-2">
							<Input id="api-token" readOnly value={freshToken} className="font-mono text-xs" />
							<Button type="button" variant="outline" onClick={handleCopy}>
								Copy
							</Button>
							<Button type="button" variant="ghost" onClick={() => setFreshToken(null)}>
								I have saved it
							</Button>
						</div>
					</div>
				) : (
					<div className="flex items-center justify-between gap-4">
						<div className="text-sm text-muted-foreground">
							{status?.exists
								? `Enabled · ending in …${status.hint}${createdAt ? ` · created  ${createdAt}` : ""}`
								: "Disabled"}
						</div>
						<div className="flex gap-2">
							<Button type="button" variant="outline" onClick={status?.exists ? askRotate : handleCreate}>
								{status?.exists ? "Regenerate" : "Generate token"}
							</Button>
							{status?.exists && (
								<Button type="button" variant="destructive" onClick={askRevoke}>
									Revoke
								</Button>
							)}
						</div>
					</div>
				)}
				<ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
			</CardContent>
		</Card>
	);
}

export default function AdminSecurity() {
	const changePassword = useChangePassword();
	const [oldPassword, setOldPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	function handleChangePassword(e: FormEvent) {
		e.preventDefault();
		if (newPassword !== confirmPassword) {
			toast.error("The new passwords do not match.");
			return;
		}
		changePassword.mutate(
			{ oldPassword, newPassword },
			{
				onSuccess: () => {
					setOldPassword("");
					setNewPassword("");
					setConfirmPassword("");
				},
			},
		);
	}

	const { data: auth } = useAuthStatus();
	const changeUsername = useChangeUsername();
	// Use the server username as the baseline and store unsaved edits in the draft, avoiding effect-based state resets.
	const [usernameDraft, setUsernameDraft] = useState<string | null>(null);
	const [usernamePassword, setUsernamePassword] = useState("");
	const username = usernameDraft ?? auth?.user?.username ?? "";

	function handleChangeUsername(e: FormEvent) {
		e.preventDefault();
		changeUsername.mutate(
			{ username, password: usernamePassword },
			{ onSuccess: () => setUsernamePassword("") },
		);
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<ApiTokenCard />
			<Card>
				<CardHeader>
					<CardTitle>Change username</CardTitle>
					<CardDescription>Change the sign-in username for the current administrator account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleChangeUsername} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">Username</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsernameDraft(e.target.value)}
								maxLength={50}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="username-password">Current password</Label>
							<Input
								id="username-password"
								type="password"
								value={usernamePassword}
								onChange={(e) => setUsernamePassword(e.target.value)}
								autoComplete="current-password"
								placeholder="Required to verify your identity"
								required
							/>
						</div>
						<Button type="submit" disabled={changeUsername.isPending}>
							{changeUsername.isPending ? "Updating…" : "Change username"}
						</Button>
					</form>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Change password</CardTitle>
					<CardDescription>Change the password for the current administrator account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleChangePassword} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="old-password">Current password</Label>
							<Input
								id="old-password"
								type="password"
								value={oldPassword}
								onChange={(e) => setOldPassword(e.target.value)}
								autoComplete="current-password"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="new-password">New password</Label>
							<Input
								id="new-password"
								type="password"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								autoComplete="new-password"
								minLength={6}
								placeholder="At least 6 characters"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirm-password">Confirm new password</Label>
							<Input
								id="confirm-password"
								type="password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								autoComplete="new-password"
								minLength={6}
								required
							/>
						</div>
						<Button type="submit" disabled={changePassword.isPending}>
							{changePassword.isPending ? "Updating…" : "Change password"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
