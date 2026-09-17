import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Centralize database access here so migrating from D1 to local SQLite/libSQL only changes this file.
export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
