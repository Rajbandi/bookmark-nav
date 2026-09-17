// Inject Workers Builds environment variables into wrangler.json before deployment.
//   - D1_DATABASE_ID → d1_databases[0].database_id
//   - JWT_SECRET     → vars.JWT_SECRET
// Build variables are used because deployments through the GitHub integration (Workers Builds)
// clear secrets and variables set manually in the dashboard (see cloudflare/workers-sdk#8871).
// Build variables are stored separately and injected into every deployment.
// Leave unset variables unchanged; local .dev.vars and manual deployment secrets are unaffected.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../wrangler.json", import.meta.url);
const config = JSON.parse(readFileSync(path, "utf8"));
let changed = false;

const dbId = process.env.D1_DATABASE_ID;
if (dbId) {
	config.d1_databases[0].database_id = dbId;
	changed = true;
	console.log(`[prepare-deploy-config] Injected database_id: ${dbId}`);
} else {
	console.log("[prepare-deploy-config] D1_DATABASE_ID is not set; skipping");
}

const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret) {
	config.vars = { ...config.vars, JWT_SECRET: jwtSecret };
	changed = true;
	console.log("[prepare-deploy-config] Injected JWT_SECRET (length  " + jwtSecret.length + ")");
} else {
	console.log("[prepare-deploy-config] JWT_SECRET is not set; skipping");
}

// R2 backups are optional: inject the r2_buckets binding only when R2_BUCKET is set.
// Otherwise remove the binding so deployment succeeds without a bucket. Create the bucket separately.
if (process.env.R2_BUCKET) {
	config.r2_buckets = [{ binding: "BACKUP", bucket_name: process.env.R2_BUCKET }];
	changed = true;
	console.log(`[prepare-deploy-config] Injected R2 bucket: ${process.env.R2_BUCKET}`);
} else if (Array.isArray(config.r2_buckets)) {
	delete config.r2_buckets;
	console.log("[prepare-deploy-config] R2_BUCKET is not set; removed R2 binding (automatic backups disabled)");
}

if (changed) {
	writeFileSync(path, JSON.stringify(config, null, "\t") + "\n");
}
