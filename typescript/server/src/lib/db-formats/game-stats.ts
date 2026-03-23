import { type Selection } from "kysely";
import {
	type AnyClasses,
	type GPTString,
	type ProfileRatingAlgorithms,
	type UserGameStats,
	V3ToGamePT,
} from "tachi-common";
import { type Database } from "tachi-db";

export const SELECT_GAME_STATS = [
	"game_stats.user_id",
	"game_stats.game",
	"game_stats.ratings",
	"game_stats.classes",
] as const;

export function ToGameStatsDocument(
	row: Selection<Database, "game_stats", (typeof SELECT_GAME_STATS)[number]>,
): UserGameStats {
	const { game, playtype } = V3ToGamePT(row.game);

	return {
		userID: row.user_id,
		game,
		playtype,
		ratings: row.ratings as Partial<Record<ProfileRatingAlgorithms[GPTString], number | null>>,
		classes: row.classes as AnyClasses,
	};
}
