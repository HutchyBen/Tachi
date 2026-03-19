import { log } from "#lib/log/log.js";
import { CreateScoreCalcData } from "#lib/score-import/framework/calculated-data/score";
import { GetAndUpdateUsersGoals } from "#lib/score-import/framework/goals/goals";
import { ProcessPBs } from "#lib/score-import/framework/pb/process-pbs";
import { UpdateUsersQuests } from "#lib/score-import/framework/quests/quests";
import { UpdateUsersGamePlaytypeStats } from "#lib/score-import/framework/ugpt-stats/update-ugpt-stats";
import { TachiConfig } from "#lib/setup/config";
import MONGODB_KILL from "#services/mongo/db";
import { EfficientDBIterate } from "#utils/efficient-db-iterate";
import { FormatUserDoc } from "#utils/user";
import {
	type GameGroup,
	GetGameGroupConfig,
	type integer,
	type Playtype,
	type UserDocument,
} from "tachi-common";
/* eslint-disable no-await-in-loop */
import deepmerge from "deepmerge";

export async function RecalcAllScores(filter = {}) {
	log.info({ filter }, `Recalcing Scores.`);

	const modifiedUsers = new Set<string>();
	const modifiedUserIDs = new Set<integer>();
	const chartIDs = new Set<string>();

	await EfficientDBIterate(
		MONGODB_KILL.scores,
		async (c) => {
			const chart = await MONGODB_KILL.anyCharts[c.game].findOne({ chartID: c.chartID });

			if (!chart) {
				log.error(
					{
						score: c,
					},
					`Can't find chartID ${c.chartID} ${c.scoreID} (${c.game})`,
				);

				throw new Error(`screwed`);
			}

			chartIDs.add(chart.chartID);

			modifiedUsers.add(`${c.game}-${c.playtype}-${c.userID}`);
			modifiedUserIDs.add(c.userID);

			const calculatedData = CreateScoreCalcData(c.game, c.scoreData, chart);

			return { scoreID: c.scoreID, calculatedData };
		},
		async (updates) => {
			await MONGODB_KILL.scores.bulkWrite(
				updates.map((e) => ({
					updateOne: {
						filter: {
							scoreID: e.scoreID,
						},
						update: {
							$set: {
								calculatedData: e.calculatedData,
							},
						},
					},
				})),
			);
		},
		filter,
	);

	log.info("Reprocessing PBs...");
	await UpdateAllPBs([...modifiedUserIDs.values()], filter);

	log.info(`Updating Profiles for ${modifiedUsers.size} users...`);

	for (const userInfo of modifiedUsers.values()) {
		const [game, playtype, strUserID] = userInfo.split("-") as [GameGroup, Playtype, string];

		const userID = Number(strUserID);

		await UpdateUsersGamePlaytypeStats(game, playtype, userID, null, log);

		const goalInfo = await GetAndUpdateUsersGoals(game, userID, chartIDs, log);

		await UpdateUsersQuests(goalInfo, game, [playtype], userID, log);
	}

	log.info(`Done!`);
}

export async function UpdateAllPBs(userIDs?: Array<integer>, filter = {}) {
	let allUsers: Array<UserDocument>;

	if (!userIDs) {
		allUsers = await MONGODB_KILL.users.find({});
	} else {
		allUsers = await MONGODB_KILL.users.find({
			id: { $in: userIDs },
		});
	}

	for (const user of allUsers) {
		log.debug(`Finding ${FormatUserDoc(user)}'s scores.`);

		for (const game of TachiConfig.GAMES) {
			const gameConfig = GetGameGroupConfig(game);

			for (const playtype of gameConfig.playtypes) {
				const scores = await MONGODB_KILL.scores.find(
					deepmerge(filter, { userID: user.id, game, playtype }),
					{
						projection: { chartID: 1 },
					},
				);

				if (scores.length === 0) {
					continue;
				}

				log.debug(`PBing ${FormatUserDoc(user)}'s scores.`);
				await ProcessPBs(
					game,
					playtype,
					user.id,
					new Set(scores.map((e) => e.chartID)),
					log,
				);
			}
		}
	}

	log.debug(`Done!`);
}
