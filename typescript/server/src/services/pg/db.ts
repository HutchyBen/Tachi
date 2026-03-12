import type { Database } from "tachi-db";

import { Environment } from "#lib/setup/config";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const pool = new Pool({ connectionString: Environment.postgresUrl });

const pgDb = new Kysely<Database>({
	dialect: new PostgresDialect({ pool }),
});

export async function ClosePgConnection() {
	await pgDb.destroy();
}

export default pgDb;
