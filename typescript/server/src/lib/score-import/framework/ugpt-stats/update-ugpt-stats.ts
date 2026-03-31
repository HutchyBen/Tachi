import type { KtLogger } from "#lib/log/log";

import { CreateGameSettings } from "#lib/game-settings/create-game-settings";
import DB from "#services/pg/db";
import { loadUserGameStats } from "#utils/class";
import {
	type ClassDelta,
	type GameGroup,
	GamePTToV3,
	type integer,
	type Playtype,
} from "tachi-common";

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

	const v3Game = GamePTToV3(game, playtype);

	// Attempt to find a users game stats if one already exists. If one doesn't exist,
	// this is this players first import for this game!
	const userGameStats = await loadUserGameStats(userID, game, playtype);

	log.debug(`Calculating UGSClasses...`);

	const classes = await CalculateUGPTClasses(game, playtype, userID, ratings, classProvider, log);

	log.debug(`Finished Calculating UGSClasses`);

	log.debug(`Calculating Class Deltas...`);

	const deltas = await ProcessClassDeltas(game, playtype, classes, userGameStats, userID, log);

	log.debug(`Had ${deltas.length} deltas.`);

	if (userGameStats) {
		log.debug(`Updated player gamestats for ${game} (${playtype})`);

		const nextClasses: Record<string, string | null | undefined> = {
			...userGameStats.classes,
		};

		for (const delta of deltas) {
			nextClasses[delta.set] = delta.new;
		}

		await DB.updateTable("game_profile")
			.set({
				ratings: JSON.stringify(ratings),
				classes: JSON.stringify(nextClasses),
			})
			.where("user_id", "=", userID)
			.where("game", "=", v3Game)
			.execute();
	} else {
		const hasAnyScores = await DB.selectFrom("score")
			.select("id")
			.where("user_id", "=", userID)
			.where("game", "=", v3Game)
			.executeTakeFirst();

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

		log.info(`Created new gamestats for ${game} (${playtype})`);
		await DB.insertInto("game_profile")
			.values({
				user_id: userID,
				game: v3Game,
				ratings: JSON.stringify(ratings),
				classes: JSON.stringify(classes),
			})
			.execute();
		await CreateGameSettings(userID, game, playtype);
	}

	return deltas;
}
