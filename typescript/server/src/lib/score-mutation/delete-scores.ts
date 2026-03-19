import type { GameGroup, Playtype, ScoreDocument } from "tachi-common";

import { log } from "#lib/log/log.js";
import { GetAndUpdateUsersGoals } from "#lib/score-import/framework/goals/goals";
import { UpdateChartRanking } from "#lib/score-import/framework/pb/create-pb-doc";
import { ProcessPBs } from "#lib/score-import/framework/pb/process-pbs";
import { UpdateUsersQuests } from "#lib/score-import/framework/quests/quests";
import { UpdateUsersGamePlaytypeStats } from "#lib/score-import/framework/ugpt-stats/update-ugpt-stats";
/* eslint-disable no-await-in-loop */
import MONGODB_KILL from "#services/mongo/db";
import { RecalcSessions } from "#utils/calculations/recalc-sessions";

/**
 * Deletes the provided score. This needs a dedicated helper method due to
 * needing to unset things like sessions and recalcs.
 */
export async function DeleteScore(
	score: ScoreDocument,
	blacklist = false,
	attemptPBReprocess = true,
) {
	await MONGODB_KILL.scores.remove({
		scoreID: score.scoreID,
	});

	const sessions = await MONGODB_KILL.sessions.find({
		scoreIDs: score.scoreID,
	});

	for (const session of sessions) {
		// If a session only has one score, then pulling it should kill
		// the session.
		if (session.scoreIDs.length === 1) {
			await MONGODB_KILL.sessions.remove({
				sessionID: session.sessionID,
			});
		}
	}

	await MONGODB_KILL.sessions.update(
		{
			sessionID: { $in: sessions.map((e) => e.sessionID) },
		},
		{
			$pull: {
				scoreIDs: score.scoreID,
			},
		},
		{
			multi: true,
		},
	);

	await RecalcSessions({ sessionID: { $in: sessions.map((e) => e.sessionID) } });

	const importDoc = await MONGODB_KILL.imports.findOne({
		scoreIDs: score.scoreID,
	});

	if (importDoc) {
		if (importDoc.scoreIDs.length === 1) {
			await MONGODB_KILL.imports.remove({
				importID: importDoc.importID,
			});
		} else {
			await MONGODB_KILL.imports.update(
				{
					importID: importDoc.importID,
				},
				{
					$pull: {
						scoreIDs: score.scoreID,
					},
				},
				{
					multi: true,
				},
			);
		}
	}

	const userHasOtherScores = await MONGODB_KILL.scores.findOne({
		userID: score.userID,
		chartID: score.chartID,
	});

	if (userHasOtherScores && attemptPBReprocess) {
		await ProcessPBs(score.game, score.playtype, score.userID, new Set([score.chartID]), log);
	} else {
		await MONGODB_KILL["personal-bests"].remove({
			userID: score.userID,
			chartID: score.chartID,
		});

		await UpdateChartRanking(score.game, score.playtype, score.chartID);
	}

	await UpdateUsersGamePlaytypeStats(score.game, score.playtype, score.userID, null, log);

	if (blacklist) {
		const alreadyBlacklisted = await MONGODB_KILL["score-blacklist"].findOne({
			userID: score.userID,
			scoreID: score.scoreID,
		});

		if (!alreadyBlacklisted) {
			log.info(`Blacklisted ${score.scoreID}.`);
			await MONGODB_KILL["score-blacklist"].insert({
				userID: score.userID,
				scoreID: score.scoreID,
				score,
			});
		}
	}
}

export async function DeleteMultipleScores(scores: Array<ScoreDocument>, blacklist = false) {
	log.info(`Received request to delete ${scores.length} score(s) (Blacklist: ${blacklist}).`);

	const scoreIDs = scores.map((e) => e.scoreID);
	const chartIDs = scores.map((e) => e.chartID);

	await MONGODB_KILL.scores.remove({
		scoreID: { $in: scoreIDs },
	});

	const sessions = await MONGODB_KILL.sessions.find({
		scoreIDs: { $in: scoreIDs },
	});

	for (const session of sessions) {
		// If a session only has one score, then pulling it should kill
		// the session.
		if (session.scoreIDs.length === 1) {
			await MONGODB_KILL.sessions.remove({
				sessionID: session.sessionID,
			});
		}
	}

	await MONGODB_KILL.sessions.update(
		{
			sessionID: { $in: sessions.map((e) => e.sessionID) },
		},
		{
			$pull: {
				scoreIDs: { $in: scoreIDs },
			},
		},
		{
			multi: true,
		},
	);

	// remove all sessions that no longer have scores in them.
	await MONGODB_KILL.sessions.remove({
		sessionID: { $in: sessions.map((e) => e.sessionID) },
		scoreIDs: { $size: 0 },
	});

	await RecalcSessions({ sessionID: { $in: sessions.map((e) => e.sessionID) } });

	const importDoc = await MONGODB_KILL.imports.findOne({
		scoreIDs: { $in: scoreIDs },
	});

	if (importDoc) {
		// pull all scoreIDs from this import.
		await MONGODB_KILL.imports.update(
			{
				importID: importDoc.importID,
			},
			{
				$pull: {
					scoreIDs: { $in: scoreIDs },
				},
			},
			{
				multi: true,
			},
		);

		// remove this import if no scores belong to it anymore.
		await MONGODB_KILL.imports.remove({
			importID: importDoc.importID,
			scoreIDs: { $size: 0 },
		});
	}

	for (const score of scores) {
		const userHasOtherScores = await MONGODB_KILL.scores.findOne({
			userID: score.userID,
			chartID: score.chartID,
		});

		if (userHasOtherScores) {
			await ProcessPBs(
				score.game,
				score.playtype,
				score.userID,
				new Set([score.chartID]),
				log,
			);
		} else {
			await MONGODB_KILL["personal-bests"].remove({
				userID: score.userID,
				chartID: score.chartID,
			});

			await UpdateChartRanking(score.game, score.playtype, score.chartID);
		}

		if (blacklist) {
			const alreadyBlacklisted = await MONGODB_KILL["score-blacklist"].findOne({
				userID: score.userID,
				scoreID: score.scoreID,
			});

			if (!alreadyBlacklisted) {
				log.info(`Blacklisted ${score.scoreID}.`);
				await MONGODB_KILL["score-blacklist"].insert({
					userID: score.userID,
					scoreID: score.scoreID,
					score,
				});
			}
		}
	}

	const ugpts = [...new Set(scores.map((e) => `${e.game}-${e.playtype}-${e.userID}`))];

	for (const ugpt of ugpts) {
		const [game, playtype, strUserID] = ugpt.split("-") as [GameGroup, Playtype, string];

		const userID = Number(strUserID);

		const pertinentChartIDs = scores
			.filter((e) => e.game === game && e.playtype === playtype && e.userID === userID)
			.map((e) => e.chartID);

		// if this user has any scores, update their goals.
		if (pertinentChartIDs.length > 0) {
			const goalInfo = await GetAndUpdateUsersGoals(game, userID, new Set(chartIDs), log);

			await UpdateUsersQuests(goalInfo, game, [playtype], userID, log);
		}

		await UpdateUsersGamePlaytypeStats(game, playtype, userID, null, log);
	}

	log.info(`Finished deleting ${scores.length} scores.`);
}
