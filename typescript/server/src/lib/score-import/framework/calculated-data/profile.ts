import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import {
	type GameGroup,
	GetGPTString,
	type integer,
	type Playtype,
	type UserGameStats,
} from "../../../../../../common/src";

/**
 * Calculate profile ratings for this UGPT.
 */
export async function CalculateProfileRatings(
	game: GameGroup,
	playtype: Playtype,
	userID: integer,
) {
	const calculatedData: Record<string, number | null> = {};

	const gptString = GetGPTString(game, playtype);

	// Do this in parallel for performance.
	await Promise.all(
		Object.entries(GPT_SERVER_IMPLEMENTATIONS[gptString].profileCalcs).map(
			async ([key, fn]) => {
				calculatedData[key] = await fn(game, playtype, userID);
			},
		),
	);

	return calculatedData as UserGameStats["ratings"];
}
