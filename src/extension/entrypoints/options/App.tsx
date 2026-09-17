import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { normalizeSiteUrl, saveConfig, ensureHostPermission, loadConfig } from "../../lib/config";
import { verifyConfig } from "../../lib/api";

export default function App() {
	const [siteInput, setSiteInput] = useState("");
	const [token, setToken] = useState("");
	const [checking, setChecking] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Populate saved settings, including the token for editing; this page renders locally.
	useEffect(() => {
		loadConfig().then((cfg) => {
			if (cfg?.siteUrl) setSiteInput(cfg.siteUrl);
			if (cfg?.token) setToken(cfg.token);
		});
	}, []);

	async function handleSave(e: FormEvent) {
		e.preventDefault();
		setError(null);
		const siteUrl = normalizeSiteUrl(siteInput);
		if (!siteUrl) {
			setError("Invalid site URL. It must start with http:// or https://.");
			return;
		}
		if (!/^bnav_[a-f0-9]{64}$/.test(token.trim())) {
			setError("Invalid token format. Use the token starting with bnav_ from the admin Security page.");
			return;
		}
		setChecking(true);
		try {
			// Request site access first: MV3 blocks cross-origin fetch without permission.
			// Then verify connectivity and the token so the browser does not block validation.
			const granted = await ensureHostPermission(siteUrl);
			if (!granted) {
				setError("Site access was denied. The extension needs this permission to work.");
				return;
			}
			const problem = await verifyConfig(siteUrl, token.trim());
			if (problem) {
				setError(problem);
				return;
			}
			await saveConfig({ siteUrl, token: token.trim() });
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch {
			setError("Could not save. Please try again.");
		} finally {
			setChecking(false);
		}
	}

	return (
		<div className="w-[420px] p-5">
			<h1 className="mb-1 text-sm font-semibold">Bookmark Nav Extension Settings</h1>
			<p className="mb-4 text-xs text-muted-foreground">
				Generate a token on the admin Security page. It grants administrator access, so keep it secure.
			</p>
			<form onSubmit={handleSave} className="space-y-4">
				<div className="space-y-1.5">
					<Label htmlFor="site-url">Site URL</Label>
					<Input
						id="site-url"
						value={siteInput}
						onChange={(e) => setSiteInput(e.target.value)}
						placeholder="https://your-bookmark-site.example"
						required
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="ext-token">Access token</Label>
					<Input
						id="ext-token"
						type="password"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder="bnav_…"
						className="font-mono text-xs"
						required
					/>
				</div>
				{error && <p className="text-xs text-destructive">{error}</p>}
				<Button className="w-full" disabled={checking}>
					{checking ? "Verifying…" : saved ? "✅ Saved" : "Save and verify"}
				</Button>
			</form>
		</div>
	);
}
