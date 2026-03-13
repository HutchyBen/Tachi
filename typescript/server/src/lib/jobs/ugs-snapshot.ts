import { log } from "#lib/log/log.js";
import db from "#services/mongo/db";
import { GetMillisecondsSince } from "#utils/misc";
import { GetAllRankings } from "#utils/user";

import type { UserGameStats, UserGameStatsSnapshotDocument } from "tachi-common";

// get the time of this midnight. it's possible this script eclipses itself when weird timezone
// nonsense happens. we'll have to see.
const currentTime = new Date().setUTCHours(0, 0, 0, 0);

let batchWrite: Array<UserGameStatsSnapshotDocument> = [];

// This code is intentionally *very* robust, and handles a lot of unanticipated failures
// because if it breaks, we brick the database.
export async function UGSSnapshot() {
	const timeStart = process.hrtime.bigint();

	const alreadyExists = await db["game-stats-snapshots"].findOne({ timestamp: currentTime });

	if (alreadyExists) {
		log.warn(
			`There already exists snapshots at this time. Has this script been ran twice on one day? Ignoring request.`,
		);

		throw new Error(
			`There already exists snapshots at this time. Has this script been ran twice on one day? Ignoring request.`,
		);
	}

	log.info(`Snapshotting UserGameStats.`);

	try {
		await db["game-stats"]
			.find({})

			// @ts-expect-error faulty TS types
			.each(async (ugs: UserGameStats, { pause, resume }) => {
				pause();

				log.debug(`Snapshotting ${ugs.userID} ${ugs.playtype} ${ugs.game}.`);

				const [playcount, rankings] = await Promise.all([
					db.scores.count({ userID: ugs.userID, playtype: ugs.playtype, game: ugs.game }),
					GetAllRankings(ugs),
				]);

				const ugsSnapshot: UserGameStatsSnapshotDocument = {
					...ugs,
					playcount,
					rankings,
					timestamp: currentTime,
				};

				batchWrite.push(ugsSnapshot);

				if (batchWrite.length >= 500) {
					log.debug(`Flushed batch.`);
					await db["game-stats-snapshots"].insert(batchWrite);

					batchWrite = [];
				}

				resume();
			});

		if (batchWrite.length) {
			await db["game-stats-snapshots"].insert(batchWrite);
		}

		log.info(
			`Successfully snapshotted all data as of ${new Date(
				currentTime,
			).toString()}. Took ${GetMillisecondsSince(timeStart)} ms.`,
		);
	} catch (err) {
		// if we panic, we need to revert whatever we did.
		log.error(
			{
				err,
			},
			`FATAL IN UGS-SNAPSHOT - Possibly failed midway through snapshotting.`,
		);

		log.info(`Removing all snapshots at this timestamp (${currentTime}).`);

		await db["game-stats-snapshots"].remove({ timestamp: currentTime });

		log.info(`Removed.`);

		throw err;
	}
}

if (require.main === module) {
	UGSSnapshot()
		.then(() => {
			process.exit(0);
		})
		.catch((err: unknown) => {
			// This is a severe error, not an error. Running the UGS snapshot every day is necessary.
			log.error({ err }, `Failed to snapshot user game stats.`);

			setTimeout(() => {
				process.exit(1);
			}, 1000);
		});
}
