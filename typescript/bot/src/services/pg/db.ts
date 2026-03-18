import type { Database } from "tachi-db";

import { Env as Env } from "#config";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const pool = new Pool({ connectionString: Env.POSTGRES_URL });

const pgDb = new Kysely<Database>({
	dialect: new PostgresDialect({ pool }),
});

export async function ClosePgConnection() {
	await pgDb.destroy();
}

export default pgDb;
