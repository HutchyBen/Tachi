import { log } from "#lib/log/log.js";
import { execSync } from "child_process";
import { Command } from "commander";
import monk from "monk";

// anonymise a database so it can be shared around and distributed.

const program = new Command();

program.argument("<url to anonymise>");

program.parse(process.argv);
const args = program.args;

const path = args[0];

if (!path) {
	throw new Error("expected path!");
}

/**
 * Strips all name and private information from the database.
 * For use for things like future tachi-db-dumps?
 *
 * @param to The database to anonymise. DO NOT PASS THE PRODUCTION DATABASE TO THIS!
 */
async function AnonymiseDB(to: string) {
	log.info(`Connecting to ${to}.`);

	const clonedDB = monk(to);

	log.info(`Connected to ${to}.`);

	const r1 = await clonedDB.get("user-private-information").update(
		{},
		[
			{
				$set: {
					// This is "password" encrypted in bcrypt12.
					password: {
						$const: "$2b$12$QRFCAxvFoNI2spszFPgt/e.qLy55GvYWlSHioa0AujRbFpChLwHmu",
					},

					// emails are uniquely indexed. We need to anonymise these in
					// a way that they dont duplicate.
					email: { $concat: [{ $toString: "$userID" }, "@example.com"] },
				},
			},
		],
		{
			multi: true,
		},
	);

	log.info({ r1 }, `Stripped private info.`);

	const r2 = await clonedDB.get("users").update(
		{},
		[
			{
				$set: {
					socialMedia: { $const: {} },
					customBannerLocation: null,
					customPfpLocation: null,
					about: "Example About Me",
					status: null,
					username: { $concat: ["user", { $toString: "$id" }] },
					usernameLowercase: { $concat: ["user", { $toString: "$id" }] },
					isSupporter: { $const: false },
				},
			},
		],
		{
			multi: true,
		},
	);

	log.info({ r2 }, `Stripped username info.`);

	const r3 = await clonedDB.get("sessions").update(
		{},
		[
			{
				$set: {
					name: "Untitled Session",
					desc: null,
				},
			},
		],
		{
			multi: true,
		},
	);

	log.info({ r3 }, `Stripped session info.`);

	const whitelist = [
		"bms-course-lookup",
		"class-achievements",
		"counters",
		"folders",
		"folder-chart-lookup",
		"game-settings",
		"game-stats",
		"game-stats-snapshots",
		"goal-subs",
		"goals",
		"iidx-bpi-data",
		"import-locks",
		"import-timings",
		"import-trackers",
		"imports",
		"migrations",
		"personal-bests",
		"quest-subs",
		"quests",
		"questlines",
		"recent-folder-views",
		"score-blacklist",
		"scores",
		"sessions",
		"tables",
		"user-private-information",
		"user-settings",
		"users",
	];

	const collections = await clonedDB.listCollections();

	for (const coll of collections) {
		if (coll.name.startsWith("charts-") || coll.name.startsWith("songs-")) {
			continue;
		}

		if (!whitelist.includes(coll.name)) {
			await coll.drop();
			log.info(`Removed collection ${coll.name}`);
		}
	}

	log.info(`Done! Closing.`);

	process.exit(0);
}

if (require.main === module) {
	// Don't run any risks -- there's no way we're ever accidentally anonymising the production database.
	// any nsTo argument MUST start with anon-
	if (!path.includes("/anon-")) {
		log.error(
			`Tried to clone to and anonymise ${path}, which is illegal. Anonymised DBs must start with anon-.`,
		);
	} else {
		AnonymiseDB(path)
			.then(() => {
				log.info(`Anonymised database successfully. Saved to ${path}.`);
				process.exit(0);
			})
			.catch((err: unknown) => {
				log.error({ err }, `Failed to anonymise database.`);
			});
	}
}
