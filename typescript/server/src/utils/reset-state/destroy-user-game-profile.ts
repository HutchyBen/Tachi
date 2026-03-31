import type { Game } from "tachi-db";

import { log } from "#lib/log/log";
import { RecalculatePbsForChartsFromPostgresScores } from "#lib/score-import/framework/pb/process-pbs";
import DB from "#services/pg/db";
import { sql } from "kysely";
import { type GameGroup, GamePTToV3, type integer, type Playtype } from "tachi-common";

/**
 * Completely resets a user's game profile.
 *
 * This function is dangerous! Should only be ran by admins.
 */
export default async function DestroyUserGameProfile(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	await DB.deleteFrom("game_stats_snapshot")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.execute();

	const chartLegacyRows = await DB.selectFrom("pb")
		.innerJoin("chart", "chart.id", "pb.chart_id")
		.select("chart.legacy_id")
		.where("pb.user_id", "=", userID)
		.where("chart.game", "=", v3Game)
		.where("pb.lens", "is", null)
		.execute();

	const scoreChartRows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.select("chart.legacy_id")
		.where("score.user_id", "=", userID)
		.where("chart.game", "=", v3Game)
		.execute();

	const chartLegacyIds = [
		...new Set([
			...chartLegacyRows.map((r) => r.legacy_id),
			...scoreChartRows.map((r) => r.legacy_id),
		]),
	];

	const scoreRows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.select("score.id")
		.where("score.user_id", "=", userID)
		.where("chart.game", "=", v3Game)
		.execute();

	const scoreIds = scoreRows.map((r) => r.id);

	if (scoreIds.length > 0) {
		await DB.deleteFrom("pb_composed_from").where("score_id", "in", scoreIds).execute();

		await DB.deleteFrom("score").where("id", "in", scoreIds).execute();
	}

	const pbRowIds = await DB.selectFrom("pb")
		.innerJoin("chart", "chart.id", "pb.chart_id")
		.select("pb.row_id")
		.where("pb.user_id", "=", userID)
		.where("chart.game", "=", v3Game)
		.execute();

	const pbIds = pbRowIds.map((r) => r.row_id);

	if (pbIds.length > 0) {
		await DB.deleteFrom("pb_composed_from").where("pb_id", "in", pbIds).execute();

		await DB.deleteFrom("pb").where("row_id", "in", pbIds).execute();
	}

	if (chartLegacyIds.length > 0) {
		await RecalculatePbsForChartsFromPostgresScores(game, playtype, chartLegacyIds, log);
	}

	await DB.deleteFrom("session")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.execute();

	await DB.deleteFrom("import_game")
		.where("game", "=", v3Game)
		.where("id", "in", (eb) =>
			eb
				.selectFrom("import")
				.select("id")
				.where("user_id", "=", userID)
				.where("game_group", "=", game),
		)
		.execute();

	await sql`
		DELETE FROM import AS i
		WHERE i.user_id = ${userID}
		AND i.game_group = ${game}
		AND NOT EXISTS (SELECT 1 FROM import_game ig WHERE ig.id = i.id)
	`.execute(DB);

	await DB.deleteFrom("game_settings_showcase")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.execute();

	await DB.deleteFrom("game_rival")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.execute();

	await DB.deleteFrom("game_settings")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.execute();

	await DB.deleteFrom("game_profile")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.execute();
}
