import { type Selection } from "kysely";
import {
	type AnyClasses,
	type GPTString,
	type MONGO_UserGameStats,
	type ProfileRatingAlgorithms,
	V3ToGamePT,
} from "tachi-common";
import { type Database } from "tachi-db";

export const SELECT_GAME_PROFILE = [
	"game_profile.user_id",
	"game_profile.game",
	"game_profile.ratings",
	"game_profile.classes",
] as const;

export function ToGameStatsDocument(
	row: Selection<Database, "game_profile", (typeof SELECT_GAME_PROFILE)[number]>,
): MONGO_UserGameStats {
	const { game, playtype } = V3ToGamePT(row.game);

	return {
		userID: row.user_id,
		game,
		playtype,
		ratings: row.ratings as Partial<Record<ProfileRatingAlgorithms[GPTString], number | null>>,
		classes: row.classes as AnyClasses,
	};
}
