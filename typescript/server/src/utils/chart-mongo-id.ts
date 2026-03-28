import { GetChartByPgIdOrLegacyId } from "#lib/db-formats/chart";
import MONGODB_KILL from "#services/mongo/db";
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
	const fromPg = await GetChartByPgIdOrLegacyId(GamePTToV3(game, playtype), chartIdParam);

	if (fromPg) {
		return MongoChartLegacyId(fromPg);
	}

	const mongoChart = await MONGODB_KILL.anyCharts[game].findOne({
		chartID: chartIdParam,
		playtype,
	});

	return mongoChart?.chartID ?? null;
}
