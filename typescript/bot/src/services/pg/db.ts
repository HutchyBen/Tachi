import type { Database } from "tachi-db";

import { Env } from "#config";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const pool = new Pool({ connectionString: Env.POSTGRES_URL });

const db = new Kysely<Database>({
	dialect: new PostgresDialect({ pool }),
});

export async function ClosePgConnection() {
	await db.destroy();
}

export default db;
