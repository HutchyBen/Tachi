import { SELECT_CHART, ToChartDocument } from "#lib/db-formats/chart.js";
import { SELECT_SCORE_DOCUMENT, ToScoreDocument } from "#lib/db-formats/score.js";
import { SELECT_SONG_DOCUMENT, ToSongDocument } from "#lib/db-formats/song.js";
import DB from "#services/pg/db.js";
import { GetUserWithIDGuaranteed } from "#utils/user.js";
import _ from "lodash";
import {
	type MONGO_ChartDocument,
	type MONGO_ScoreDocument,
	type MONGO_SessionDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	type SessionScoreInfo,
} from "tachi-common";

/** Score ids attached to each session id (batch helper for session list endpoints). */
export async function GetScoreIdsGroupedBySessionId(
	sessionIds: Array<string>,
): Promise<Map<string, Array<string>>> {
	const map = new Map<string, Array<string>>();

	if (sessionIds.length === 0) {
		return map;
	}

	const rows = await DB.selectFrom("score")
		.select(["session_id", "id"])
		.where("session_id", "in", sessionIds)
		.execute();

	for (const r of rows) {
		if (!r.session_id) {
			continue;
		}

		const arr = map.get(r.session_id) ?? [];

		arr.push(r.id);
		map.set(r.session_id, arr);
	}

	return map;
}

export async function GetSessionData(session: MONGO_SessionDocument): Promise<{
	charts: Array<MONGO_ChartDocument>;
	scoreInfo: Array<SessionScoreInfo>;
	scores: Array<MONGO_ScoreDocument>;
	songs: Array<MONGO_SongDocument>;
	user: MONGO_UserDocument;
}> {
	const user = await GetUserWithIDGuaranteed(session.userID);

	const rows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.leftJoin("import", "import.id", "score.import_id")
		.select(SELECT_SCORE_DOCUMENT)
		.select(SELECT_CHART)
		.select(SELECT_SONG_DOCUMENT)
		.where("score.session_id", "=", session.sessionID)
		.execute();

	let charts = rows.map((row) => ToChartDocument(row, row.song_legacy_id));
	charts = _.uniqBy(charts, "chartID");

	let songs = rows.map((row) => ToSongDocument(row));
	songs = _.uniqBy(songs, "id");

	let scores = rows.map((row) => ToScoreDocument(row));
	scores = _.uniqBy(scores, "scoreID");

	// TODO: Hard to implement efficiently
	// need to get the PB for this chart BEFORE the
	// given time T
	const scoreInfo: Array<SessionScoreInfo> = [];

	return {
		charts,
		scores,
		scoreInfo,
		songs,
		user,
	};
}
