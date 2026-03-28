import type { KtLogger } from "#lib/log/log";
import type { ClassDelta, GameGroup, integer, MONGO_UserGameStats, Playtype } from "tachi-common";

import { CreateGameSettings } from "#lib/game-settings/create-game-settings";
import MONGODB_KILL from "#services/mongo/db";

import type { ClassProvider } from "../calculated-data/types";

import { CalculateProfileRatings } from "../calculated-data/profile";
import { CalculateUGPTClasses, ProcessClassDeltas } from "../profile-calculated-data/classes";

export async function UpdateUsersGamePlaytypeStats(
	game: GameGroup,
	playtype: Playtype,
	userID: integer,
	classProvider: ClassProvider | null,
	log: KtLogger,
): Promise<Array<ClassDelta>> {
	log.debug(`Calculating Ratings...`);

	const ratings = await CalculateProfileRatings(game, playtype, userID);

	// Attempt to find a users game stats if one already exists. If one doesn't exist,
	// this is this players first import for this game!
	const userGameStats = await MONGODB_KILL["game-stats"].findOne({
		game,
		playtype,
		userID,
	});

	log.debug(`Calculating UGSClasses...`);

	const classes = await CalculateUGPTClasses(game, playtype, userID, ratings, classProvider, log);

	log.debug(`Finished Calculating UGSClasses`);

	log.debug(`Calculating Class Deltas...`);

	const deltas = await ProcessClassDeltas(game, playtype, classes, userGameStats, userID, log);

	log.debug(`Had ${deltas.length} deltas.`);

	if (userGameStats) {
		log.debug(`Updated player gamestats for ${game} (${playtype})`);

		const updateClasses: Record<string, string> = {};

		for (const delta of deltas) {
			updateClasses[`classes.${delta.set}`] = delta.new;
		}

		await MONGODB_KILL["game-stats"].update(
			{
				game,
				playtype,
				userID,
			},
			{
				$set: {
					ratings,
					...updateClasses,
				},
			},
		);
	} else {
		const hasAnyScores = await MONGODB_KILL.scores.findOne({
			game,
			playtype,
			userID,
		});

		if (!hasAnyScores) {
			log.debug(
				{
					userID,
					game,
					playtype,
				},
				"Not creating new game stats for user with no scores.",
			);
			return deltas;
		}

		const newStats: MONGO_UserGameStats = {
			game,
			playtype,
			userID,
			ratings,
			classes,
		};

		log.info(`Created new gamestats for ${game} (${playtype})`);
		await MONGODB_KILL["game-stats"].insert(newStats);
		await CreateGameSettings(userID, game, playtype);
	}

	return deltas;
}
