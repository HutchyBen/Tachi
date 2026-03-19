import type { Database } from "tachi-db";

import { Env } from "#lib/setup/config";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const pool = new Pool({ connectionString: Env.POSTGRES_URL });

const DB = new Kysely<Database>({
	dialect: new PostgresDialect({ pool }),
});

export async function ClosePgConnection() {
	await DB.destroy();
}

export default DB;
