import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import {
	type GameGroup,
	GetGPTString,
	type integer,
	type MONGO_UserGameStats,
	type Playtype,
} from "tachi-common";

/**
 * Calculate profile ratings for this UGPT.
 */
export function CalculateProfileRatings(
	game: GameGroup,
	playtype: Playtype,
	userID: integer,
): Promise<MONGO_UserGameStats["ratings"]> {
	const gptString = GetGPTString(game, playtype);

	// Per-GPT `profileCalcs` take `GPTStringToGame<GPT>`; at runtime `game` is correct for `gptString`.
	const profileCalcs = GPT_SERVER_IMPLEMENTATIONS[gptString].profileCalcs as (
		game: GameGroup,
		playtype: Playtype,
		userID: integer,
	) => Promise<MONGO_UserGameStats["ratings"]>;

	return profileCalcs(game, playtype, userID);
}
