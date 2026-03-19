import type { DryScoreData } from "#lib/score-import/framework/common/types";

import { log as globalLog, type KtLogger } from "#lib/log/log.js";
import { CreateScoreCalcData } from "#lib/score-import/framework/calculated-data/score";
import { CreateSessionCalcData } from "#lib/score-import/framework/calculated-data/session";
import { UpdateChartRanking } from "#lib/score-import/framework/pb/create-pb-doc";
import { CreateFullScoreData } from "#lib/score-import/framework/score-importing/derivers";
import { CreateScoreID } from "#lib/score-import/framework/score-importing/score-id";
import { GetGPTString, type GPTString, type ScoreDocument } from "tachi-common";
/* eslint-disable no-await-in-loop */
import MONGODB_KILL from "#services/mongo/db";
import { UpdateAllPBs } from "#utils/calculations/recalc-scores";
import { FormatUserDoc, GetUserWithID } from "#utils/user";

type NewScore =
	| ({ scoreData: DryScoreData<GPTString> } & Omit<ScoreDocument, "scoreData">)
	| ScoreDocument;

/**
 * Updates a score from oldScore to newScore, applying all necessary state
 * changes on the way.
 *
 * @param dangerouslySkipUpdatingRefs - Skip updating session/import pointers to this
 * scoreID.
 *
 * @note You don't need to recalc the scoreID for newScore, it's done for you.
 */
export default async function UpdateScore(
	oldScore: ScoreDocument,
	newScore: NewScore,
	updateOldChart = true,
	skipUpdatingPBs = false,
	dangerouslySkipUpdatingRefs = false,
) {
	const userID = oldScore.userID;
	const user = await GetUserWithID(userID);

	if (!user) {
		globalLog.error(
			`User ${userID} does not exist, yet a score update was called for them? Panicking.`,
		);
		throw new Error(
			`User ${userID} does not exist, yet a score update was called for them? Panicking.`,
		);
	}

	const chartID = newScore.chartID;

	const chart = await MONGODB_KILL.anyCharts[oldScore.game].findOne({
		chartID,
	});

	if (!chart) {
		globalLog.error(
			`Chart ${chartID} does not exist, yet a score update was called for it? Panicking.`,
		);
		throw new Error(
			`Chart ${chartID} does not exist, yet a score update was called for it? Panicking.`,
		);
	}

	// In the event that the new chart isn't under the same song as the previous one, the songID
	// needs to update.
	newScore.songID = chart.songID;

	const oldScoreID = oldScore.scoreID;

	const newScoreID = CreateScoreID(
		GetGPTString(newScore.game, newScore.playtype),
		newScore.userID,
		newScore,
		newScore.chartID,
	);

	// We need to change *so* many references to score IDs, and recalculate *so*
	// much stored state. Obviously, changing a scoreID is an exceptional circumstance
	// brought on by a bug.
	// So hopefully, we wont have to use this much.

	newScore.scoreID = newScoreID;

	const log = globalLog.child({
		context: ["Update Score", oldScore.scoreID, newScore.scoreID, FormatUserDoc(user)],
	}) as KtLogger;

	log.debug("Received Update Score request.");

	const gpt = GetGPTString(newScore.game, newScore.playtype);

	// rehydrate this scoredata, incase we got passed a new score thats dry
	newScore.scoreData = CreateFullScoreData(gpt, newScore.scoreData, chart, log);

	newScore.calculatedData = CreateScoreCalcData(newScore.game, newScore.scoreData, chart);

	try {
		// Having _id defined will cause this to throw, causing it to not apply
		// the update.
		// @ts-expect-error this shouldn't happen according to types.
		if (newScore._id) {
			log.warn(
				`Passed a score with _id to UpdateScore. This property should not be set. Deleting this property and continuing anyway.`,
			);

			// @ts-expect-error this shouldn't happen according to types.
			delete newScore._id;
		}

		await MONGODB_KILL.scores.update(
			{
				scoreID: oldScoreID,
			},
			{ $set: newScore as ScoreDocument },
		);
	} catch (err) {
		log.error(err);
		log.warn(
			`Score ID ${newScoreID} already existed -- this update caused a collision. Removing old score and updating old references anyway.`,
		);
		await MONGODB_KILL.scores.remove({
			scoreID: oldScoreID,
		});
	}

	if (oldScoreID === newScoreID) {
		log.debug(`Done updating score.`);
		return;
	}

	if (dangerouslySkipUpdatingRefs) {
		log.debug(`Done updating score.`);
		return;
	}

	const sessions = await MONGODB_KILL.sessions.find({
		scoreIDs: oldScoreID,
	});

	// another session already has the new score? (i.e. migrating to an already
	// existing score?)
	const existsElsewhere = await MONGODB_KILL.sessions.findOne({
		scoreIDs: newScoreID,
	});

	log.debug(`Updating ${sessions.length} sessions.`);

	// For every session that interacts with this score ID (there should only ever be one)
	for (const session of sessions) {
		const newScoreIDs = [];

		// Go over all the scoreIDs and alter the ones that involve this scoreID.
		for (const scoreID of session.scoreIDs) {
			if (scoreID === oldScoreID) {
				if (existsElsewhere) {
					// skip this, as this score already belongs to another session.
					continue;
				}

				if (newScore.timeAchieved === null) {
					// this shouldn't be in a session anymore.
					continue;
				}

				newScoreIDs.push(newScoreID);
			} else {
				newScoreIDs.push(scoreID);
			}
		}

		const scores = await MONGODB_KILL.scores.find({
			scoreID: { $in: newScoreIDs },
		});

		// update calculated data too.
		const newCalcData = CreateSessionCalcData(
			GetGPTString(session.game, session.playtype),
			scores,
		);

		await MONGODB_KILL.sessions.update(
			{
				sessionID: session.sessionID,
			},
			{
				$set: { scoreIDs: newScoreIDs, calculatedData: newCalcData },
			},
		);
	}

	if (!skipUpdatingPBs) {
		log.debug(`Updating PBs.`);

		// Update the PBs to reference properly.
		// We run updateAllPbs on just the modified chart -- the reason
		// for this is to update ranking info incase that might fall out of
		// sync as a result.
		await UpdateAllPBs([userID], {
			chartID: newScore.chartID,
		});

		await UpdateChartRanking(newScore.game, newScore.playtype, newScore.chartID);

		if (updateOldChart) {
			await UpdateAllPBs([userID], {
				chartID: oldScore.chartID,
			});
			await UpdateChartRanking(oldScore.game, oldScore.playtype, oldScore.chartID);
		}
	}

	const imports = await MONGODB_KILL.imports.find({
		scoreIDs: oldScoreID,
	});

	log.debug(`Updating ${imports.length} imports.`);

	for (const importDoc of imports) {
		await MONGODB_KILL.imports.update(
			{
				importID: importDoc.importID,
			},
			{
				$set: {
					scoreIDs: importDoc.scoreIDs.map((e) => (e === oldScoreID ? newScoreID : e)),
				},
			},
		);
	}

	log.debug(`Done updating score.`);
}
