import DB from "#services/pg/db";
import { type Selection } from "kysely";
import {
	type GameGroup,
	GamePTToV3,
	type integer,
	type MONGO_UGPTSettingsDocument,
	type Playtype,
	type ShowcaseStatDetails,
	V3ToGamePT,
} from "tachi-common";
import { type Database } from "tachi-db";

export const SELECT_GAME_SETTINGS = [
	"game_settings.user_id",
	"game_settings.game",
	"game_settings.pf_preferred_score_alg",
	"game_settings.pf_preferred_session_alg",
	"game_settings.pf_preferred_profile_alg",
	"game_settings.pf_preferred_default_enum",
	"game_settings.pf_default_table",
	"game_settings.pf_preferred_ranking",
	"game_settings.data",
] as const;

export type GameSettingsRow = Selection<
	Database,
	"game_settings",
	(typeof SELECT_GAME_SETTINGS)[number]
>;

export function ToUGPTSettingsDocument(
	row: GameSettingsRow,
	rivals: Array<integer>,
	stats: Array<ShowcaseStatDetails>,
): MONGO_UGPTSettingsDocument {
	const { game, playtype } = V3ToGamePT(row.game);
	const gameSpecific = row.data as MONGO_UGPTSettingsDocument["preferences"]["gameSpecific"];

	return {
		userID: row.user_id,
		game,
		playtype,
		preferences: {
			defaultTable: row.pf_default_table,
			gameSpecific,
			preferredDefaultEnum: row.pf_preferred_default_enum,
			preferredProfileAlg:
				row.pf_preferred_profile_alg as MONGO_UGPTSettingsDocument["preferences"]["preferredProfileAlg"],
			preferredRanking:
				row.pf_preferred_ranking as MONGO_UGPTSettingsDocument["preferences"]["preferredRanking"],
			preferredScoreAlg:
				row.pf_preferred_score_alg as MONGO_UGPTSettingsDocument["preferences"]["preferredScoreAlg"],
			preferredSessionAlg:
				row.pf_preferred_session_alg as MONGO_UGPTSettingsDocument["preferences"]["preferredSessionAlg"],
			stats,
		},
		rivals,
	};
}

/**
 * Full UGPT settings document (preferences + rivals + showcase stats) from Postgres.
 */
export async function GetUGPTSettingsDocument(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
): Promise<MONGO_UGPTSettingsDocument | null> {
	const v3Game = GamePTToV3(game, playtype);

	const row = await DB.selectFrom("game_settings")
		.select(SELECT_GAME_SETTINGS)
		.where("game_settings.user_id", "=", userID)
		.where("game_settings.game", "=", v3Game)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	const rivalRows = await DB.selectFrom("game_rival")
		.select("rival")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.execute();

	const rivals = rivalRows.map((r) => r.rival);

	const showcaseRow = await DB.selectFrom("game_settings_showcase")
		.select("data")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.executeTakeFirst();

	const stats = showcaseRow ? (showcaseRow.data as Array<ShowcaseStatDetails>) : [];

	return ToUGPTSettingsDocument(row, rivals, stats);
}
