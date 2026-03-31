import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import { log } from "#lib/log/log";
import { CreateSessionCalcData } from "#lib/score-import/framework/calculated-data/session";
import { GetAndUpdateUsersGoals } from "#lib/score-import/framework/goals/goals";
import { ProcessPBs } from "#lib/score-import/framework/pb/process-pbs";
import { UpdateUsersQuests } from "#lib/score-import/framework/quests/quests";
import { UpdateUsersGamePlaytypeStats } from "#lib/score-import/framework/ugpt-stats/update-ugpt-stats";
import DB from "#services/pg/db";
import {
	type GameGroup,
	GetGPTString,
	type MONGO_ScoreDocument,
	type Playtype,
	type V3Game,
	V3ToGamePT,
} from "tachi-common";
/* eslint-disable no-await-in-loop */

export function DeleteScore(score: MONGO_ScoreDocument, blacklist = false): Promise<void> {
	return DeleteMultipleScores([score], blacklist);
}

export async function DeleteMultipleScores(
	scores: Array<MONGO_ScoreDocument>,
	blacklist = false,
): Promise<void> {
	if (scores.length === 0) {
		return;
	}

	log.info(
		`Received request to delete ${scores.length} score(s) from Postgres (Blacklist: ${blacklist}).`,
	);

	const scoreIDs = scores.map((e) => e.scoreID);
	const chartIDs = scores.map((e) => e.chartID);

	const sessionLinks = await DB.selectFrom("score")
		.select("session_id")
		.where("id", "in", scoreIDs)
		.execute();

	const sessionIds = [
		...new Set(
			sessionLinks
				.map((r) => r.session_id)
				.filter((id): id is string => id !== null && id !== undefined),
		),
	];

	await DB.deleteFrom("pb_composed_from").where("score_id", "in", scoreIDs).execute();

	await DB.deleteFrom("score").where("id", "in", scoreIDs).execute();

	for (const sessionId of sessionIds) {
		const remainingRows = await DB.selectFrom("score")
			.innerJoin("chart", "chart.id", "score.chart_id")
			.innerJoin("song", "song.id", "chart.song_id")
			.leftJoin("import", "import.id", "score.import_id")
			.select(SELECT_SCORE_DOCUMENT)
			.where("score.session_id", "=", sessionId)
			.execute();

		if (remainingRows.length === 0) {
			await DB.deleteFrom("session").where("id", "=", sessionId).execute();
		} else {
			const sessionRow = await DB.selectFrom("session")
				.selectAll()
				.where("id", "=", sessionId)
				.executeTakeFirst();

			if (!sessionRow) {
				continue;
			}

			const scoreDocs = remainingRows.map((r) => ToScoreDocument(r as ScoreDocumentJoinRow));
			const { game, playtype } = V3ToGamePT(sessionRow.game as V3Game);
			const gpt = GetGPTString(game, playtype);
			const calculatedData = CreateSessionCalcData(gpt, scoreDocs);

			await DB.updateTable("session")
				.set({
					calculated_data: JSON.stringify(calculatedData),
				})
				.where("id", "=", sessionId)
				.execute();
		}
	}

	for (const score of scores) {
		await ProcessPBs(score.game, score.playtype, score.userID, new Set([score.chartID]), log);

		if (blacklist) {
			const alreadyBlacklisted = await DB.selectFrom("score_blacklist")
				.select("row_id")
				.where("user_id", "=", score.userID)
				.where("score_id", "=", score.scoreID)
				.executeTakeFirst();

			if (!alreadyBlacklisted) {
				log.info(`Blacklisted ${score.scoreID}.`);
				await DB.insertInto("score_blacklist")
					.values({
						user_id: score.userID,
						score_id: score.scoreID,
					})
					.execute();
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

		if (pertinentChartIDs.length > 0) {
			const goalInfo = await GetAndUpdateUsersGoals(game, userID, new Set(chartIDs), log);

			await UpdateUsersQuests(goalInfo, game, [playtype], userID, log);
		}

		await UpdateUsersGamePlaytypeStats(game, playtype, userID, null, log);
	}

	log.info(`Finished deleting ${scores.length} scores (Postgres).`);
}
