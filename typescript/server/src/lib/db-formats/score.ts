import { pgScoreDataToMongo } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";
import { ISO8601ToUnixMilliseconds } from "#utils/time";
import {
	GetGPTString,
	type GPTString,
	type ImportTypes,
	type ScoreDocument,
	V3ToGamePT,
} from "tachi-common";
import { type Game } from "tachi-db";

/** Columns from `score` joined with chart/song for a full {@link ScoreDocument}. */
export const SELECT_SCORE_DOCUMENT = [
	"score.id",
	"score.user_id",
	"score.game",
	"score.data",
	"score.derived_data",
	"score.judgements",
	"score.calculated_data",
	"score.meta",
	"score.time_achieved",
	"score.time_added",
	"score.highlight",
	"score.comment",
	"chart.legacy_id as chart_legacy_id",
	"chart.is_primary",
	"song.legacy_id as song_legacy_id",
	"import.service as import_service",
	"import.import_type as import_import_type",
] as const;

/** Row shape from {@link SELECT_SCORE_DOCUMENT} join query. */
export interface ScoreDocumentJoinRow {
	id: string;
	user_id: number;
	game: Game;
	data: unknown;
	derived_data: unknown;
	judgements: unknown;
	calculated_data: unknown;
	meta: unknown;
	time_achieved: string | null;
	time_added: string;
	highlight: boolean;
	comment: string | null;
	chart_legacy_id: string;
	is_primary: boolean;
	song_legacy_id: number;
	import_service: string | null;
	import_import_type: string | null;
}

export function ToScoreDocument(row: ScoreDocumentJoinRow): ScoreDocument {
	const { game, playtype } = V3ToGamePT(row.game);

	const scoreData = pgScoreDataToMongo(row.game, {
		data: row.data as any,
		derived: row.derived_data as any,
		judgements: row.judgements as any,
	});

	const scoreMeta = row.meta as ScoreDocument["scoreMeta"];

	const calculatedData = row.calculated_data as ScoreDocument["calculatedData"];

	const service =
		row.import_service !== null &&
		row.import_service !== undefined &&
		row.import_service.length > 0
			? row.import_service
			: "Unknown";

	return {
		service,
		game,
		playtype,
		userID: row.user_id,
		scoreData,
		scoreMeta: scoreMeta ?? {},
		calculatedData: calculatedData ?? {},
		timeAchieved: row.time_achieved ? ISO8601ToUnixMilliseconds(row.time_achieved) : null,
		songID: row.song_legacy_id,
		chartID: row.chart_legacy_id,
		isPrimary: row.is_primary,
		highlight: row.highlight,
		comment: row.comment,
		timeAdded: ISO8601ToUnixMilliseconds(row.time_added),
		scoreID: row.id,
		importType: row.import_import_type as ImportTypes | null,
	};
}

export async function LoadScoreDocumentById(scoreID: string): Promise<ScoreDocument | undefined> {
	const row = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.leftJoin("import", "import.id", "score.import_id")
		.select(SELECT_SCORE_DOCUMENT)
		.where("score.id", "=", scoreID)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	return ToScoreDocument(row as ScoreDocumentJoinRow);
}
