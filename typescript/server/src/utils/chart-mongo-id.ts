import { GetChartById } from "#lib/db-formats/chart";
import { type GameGroup, GamePTToV3, MongoChartLegacyId, type Playtype } from "tachi-common";

/**
 * Resolves a chart id from the API (Postgres `chart.id` or `legacy_id`) to the legacy
 * string stored in Mongo (`personal-bests`, `folder-chart-lookup`, etc.).
 */
export async function ResolveLegacyChartIdForMongo(
	game: GameGroup,
	playtype: Playtype,
	chartIdParam: string,
): Promise<string | null> {
	const fromPg = await GetChartById(GamePTToV3(game, playtype), chartIdParam);

	if (fromPg) {
		return MongoChartLegacyId(fromPg);
	}

	return null;
}
