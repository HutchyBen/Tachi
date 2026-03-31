import type http from "http";

import { AddNewUser } from "#lib/auth/auth";
import { LoadDefaultClients } from "#lib/builtin-clients/builtin-clients";
import { VERSION_PRETTY } from "#lib/constants/version";
import { HandleSIGTERMGracefully } from "#lib/handlers/sigterm";
import { log } from "#lib/log/log";
import { Env, ServerConfig, TachiConfig } from "#lib/setup/config";
import server from "#server/server";
import { monkDB } from "#services/mongo/db";
import { UpdateIndexes } from "#services/mongo/indexes";
import DB from "#services/pg/db";
import fetch from "#utils/fetch";
import { GetUserWithID } from "#utils/user";
import { spawn } from "child_process";
import fs from "fs";
import https from "https";
import path from "path";
import { applyMigrations } from "tachi-db-migration-engine";

log.info(
	{
		bootInfo: true,
	},
	`Booting ${TachiConfig.NAME} - ${VERSION_PRETTY} [ENV: ${Env.NODE_ENV}]`,
);
log.info({ bootInfo: true }, `Log level is set to ${Env.LOG_LEVEL}.`);

log.info({ bootInfo: true }, `Loading sequence documents...`);

async function RunOnInit() {
	await UpdateIndexes(monkDB, false);

	await applyMigrations(Env.POSTGRES_URL, Env.MIGRATIONS_DIR);

	if (Env.NODE_ENV === "dev") {
		const exists = await GetUserWithID(1);

		if (!exists) {
			log.info("First time setup in LOCAL DEV: Creating an admin user for you.");

			await DB.transaction().execute(async (txn) => {
				await AddNewUser(txn, "admin", "password", "admin@example.com");

				await txn
					.updateTable("account")
					.set({ auth_level: "admin" })
					.where("id", "=", 1)
					.execute();
			});

			log.info("Done! You have an admin user with password 'password'");
		}
	}

	await LoadDefaultClients();

	try {
		await fetch("https://example.com");
	} catch (err) {
		if (ServerConfig.ALLOW_RUNNING_OFFLINE === true) {
			log.warn(
				`This instance of tachi-server cannot access the internet, however, ALLOW_RUNNING_OFFLINE was set. Allowing it anyway, but some things will not work.`,
			);
		} else {
			log.fatal(
				{ err },
				`Cannot send HTTPS request to https://example.com. This instance of tachi-server cannot access the internet?`,
			);
		}
	}
}

void RunOnInit();

let instance: http.Server | https.Server;

if (ServerConfig.ENABLE_SERVER_HTTPS === true) {
	if (Env.NODE_ENV === "production") {
		log.warn(
			{ bootInfo: true },
			"HTTPS Mode is enabled. This should not be used in production, and you should instead run behind a reverse proxy.",
		);
	}

	const privateKey = fs.readFileSync("./cert/key.pem");
	const certificate = fs.readFileSync("./cert/cert.pem");

	const httpsServer = https.createServer({ key: privateKey, cert: certificate }, server);

	instance = httpsServer.listen(Env.PORT);
	log.info({ bootInfo: true }, `HTTPS Listening on port ${Env.PORT}`);
} else {
	instance = server.listen(Env.PORT);
	log.info({ bootInfo: true }, `HTTP Listening on port ${Env.PORT}`);
}

process.on("SIGTERM", () => {
	void HandleSIGTERMGracefully(instance);
});

if (process.env.INVOKE_JOB_RUNNER) {
	log.info({ bootInfo: true }, `Spawning a tachi-server job runner inline.`);

	if (Env.NODE_ENV === "production") {
		log.warn(
			{ bootInfo: true },
			`Spawning inline tachi-server job runner in production. This is bad for performance.`,
		);
	}

	// Spawn as a separate process to avoid hogging the main thread.
	const jobProcess = spawn(
		"ts-node",
		[
			// Note: Can't use -r tsconfig-paths/register here
			// because that is rejected by some library called
			// arg.
			// I'm not sure why.
			"--require=tsconfig-paths/register",
			path.join(__dirname, "../src/lib/jobs/job-runner.ts"),
		],
		{
			stdio: "inherit",
		},
	);

	jobProcess.on("error", (err) => {
		log.fatal({ err }, `Failed to spawn job runner. Terminating process.`);
	});

	process.on("beforeExit", () => {
		log.info(`Killing Job Runner.`);
		jobProcess.kill();
	});
}
