import DB from "#services/pg/db";
import { type Selection } from "kysely";
import {
	type integer,
	type ShowcaseStatChart,
	type ShowcaseStatDetails,
	type UGPTSettingsDocument,
	type V3Game,
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
): UGPTSettingsDocument {
	const gameSpecific = row.data as UGPTSettingsDocument["preferences"]["gameSpecific"];

	return {
		userID: row.user_id,
		game: row.game,
		preferences: {
			defaultTable: row.pf_default_table,
			gameSpecific,
			preferredDefaultEnum: row.pf_preferred_default_enum,
			preferredProfileAlg:
				row.pf_preferred_profile_alg as UGPTSettingsDocument["preferences"]["preferredProfileAlg"],
			preferredRanking:
				row.pf_preferred_ranking as UGPTSettingsDocument["preferences"]["preferredRanking"],
			preferredScoreAlg:
				row.pf_preferred_score_alg as UGPTSettingsDocument["preferences"]["preferredScoreAlg"],
			preferredSessionAlg:
				row.pf_preferred_session_alg as UGPTSettingsDocument["preferences"]["preferredSessionAlg"],
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
	game: V3Game,
): Promise<UGPTSettingsDocument | null> {
	const row = await DB.selectFrom("game_settings")
		.select(SELECT_GAME_SETTINGS)
		.where("game_settings.user_id", "=", userID)
		.where("game_settings.game", "=", game)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	const rivalRows = await DB.selectFrom("game_rival")
		.select("rival")
		.where("user_id", "=", userID)
		.where("game", "=", game)
		.execute();

	const rivals = rivalRows.map((r) => r.rival);

	const showcaseRow = await DB.selectFrom("game_settings_showcase")
		.select("data")
		.where("user_id", "=", userID)
		.where("game", "=", game)
		.executeTakeFirst();

	const stats = showcaseRow ? (showcaseRow.data as Array<ShowcaseStatDetails>) : [];

	return ToUGPTSettingsDocument(row, rivals, normalizeShowcaseStats(stats));
}

/** Strips legacy `metric` from chart entries stored before chart showcase was PB+playcount-only. */
function normalizeShowcaseStats(raw: Array<ShowcaseStatDetails>): Array<ShowcaseStatDetails> {
	return raw.map((stat) => {
		if (stat.mode === "chart") {
			const s = stat as { metric?: string } & ShowcaseStatChart;
			return { mode: "chart", chartID: s.chartID };
		}
		return stat;
	});
}
