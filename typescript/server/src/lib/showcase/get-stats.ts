import { log } from "#lib/log/log.js";
import MONGODB_KILL from "#services/mongo/db";
import {
	type GameGroup,
	GetGPTString,
	type GPTString,
	type integer,
	type Playtype,
	type ShowcaseStatDetails,
} from "tachi-common";

import { EvaluateShowcaseStat } from "./evaluator";
import { GetRelatedStatDocuments } from "./get-related";

/**
 * Evaluate a users set Stats Showcase.
 * @param projectUserStats - Optionally, provide another users ID here. Their stats showcase will be
 * used instead.
 */
export async function EvaluateUsersStatsShowcase(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	projectUserStats?: integer,
) {
	const getSettingsID = projectUserStats ?? userID;
	const settings = await MONGODB_KILL["game-settings"].findOne({
		userID: getSettingsID,
		game,
		playtype,
	});

	if (!settings) {
		log.error(
			`User ${getSettingsID} has no game-settings, yet a call to EvaluateUsersStatsShowcase was made.`,
		);

		throw new Error(
			`User ${getSettingsID} has no game-settings, yet a call to EvaluateUsersStatsShowcase was made.`,
		);
	}

	const gpt = GetGPTString(game, playtype);

	const results = await Promise.all(
		settings.preferences.stats.map((details) => EvaluateStats(gpt, details, userID, game)),
	);

	return results;
}

async function EvaluateStats(
	gpt: GPTString,
	details: ShowcaseStatDetails,
	userID: integer,
	game: GameGroup,
) {
	const [result, related] = await Promise.all([
		EvaluateShowcaseStat(gpt, details, userID),
		GetRelatedStatDocuments(details, game),
	]);

	return { stat: details, result, related };
}
