import {
	SELECT_SESSION_CALENDAR,
	SELECT_SESSION_DOCUMENT,
	ToSessionCalendarDocument,
	ToSessionDocument,
} from "#lib/db-formats/session";
import { GetSessionScoreInfo } from "#lib/score-import/framework/sessions/sessions";
import { SearchSessions } from "#lib/search/search";
import DB from "#services/pg/db";
import { GetScoreIdsGroupedBySessionId } from "#utils/queries/sessions";
import { GetUGPT } from "#utils/req-tachi-data";
import { CheckStrSessionAlg } from "#utils/string-checks";
import { Router } from "express";
import { sql } from "kysely";
import {
	type AnySessionRatingAlg,
	GamePTToV3,
	GetGamePTConfig,
	type MONGO_SessionDocument,
	type SessionScoreInfo,
} from "tachi-common";
import { type Game } from "tachi-db";

const router: Router = Router({ mergeParams: true });

async function attachSessionScoreInfo(
	sessions: Array<MONGO_SessionDocument>,
): Promise<Array<{ __scoreInfo: Array<SessionScoreInfo> } & MONGO_SessionDocument>> {
	const sessionsWithScoreInfo: Array<
		{ __scoreInfo: Array<SessionScoreInfo> } & MONGO_SessionDocument
	> = [];

	await Promise.all(
		sessions.map((session) =>
			GetSessionScoreInfo(session).then((r) => {
				sessionsWithScoreInfo.push({
					...session,
					__scoreInfo: r,
				});
			}),
		),
	);

	return sessionsWithScoreInfo;
}

/**
 * Search a users sessions.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/sessions
 */
router.get("/", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	if (typeof req.query.search !== "string") {
		return res.status(400).json({
			success: false,
			description: `Invalid value for search parameter.`,
		});
	}

	const hits = await SearchSessions(req.query.search, game, playtype, user.id, 100);

	return res.status(200).json({
		success: true,
		description: `Retrieved ${hits.length} sessions.`,
		body: hits.map(({ session, rank }) => ({ ...session, __textScore: rank })),
	});
});

/**
 * Returns a user's best 100 sessions according to the default statistic
 * for that game.
 *
 * @param alg - An override to specify a different algorithm for that game.
 * @name GET /api/v1/users/:userID/games/:game/:playtype/sessions/best
 */
router.get("/best", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const gptConfig = GetGamePTConfig(game, playtype);

	let alg = gptConfig.defaultSessionRatingAlg as AnySessionRatingAlg;

	if (typeof req.query.alg === "string") {
		const userAlg = CheckStrSessionAlg(game, playtype, req.query.alg);

		if (userAlg === null) {
			return res.status(400).json({
				success: false,
				description: `Invalid algorithm '${
					req.query.alg
				}' provided. Expected any of ${Object.keys(gptConfig.sessionRatingAlgs).join(
					", ",
				)}.`,
			});
		}

		alg = userAlg;
	}

	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await DB.selectFrom("session")
		.select(SELECT_SESSION_DOCUMENT)
		.where("user_id", "=", user.id)
		.where("game", "=", v3Game)
		.orderBy(
			sql`(session.calculated_data::jsonb->>${sql.lit(alg)})::double precision desc nulls last`,
		)
		.orderBy("session.time_ended", "desc")
		.limit(100)
		.execute();

	const scoreMap = await GetScoreIdsGroupedBySessionId(rows.map((r) => r.id));

	const sessions = rows.map((row) => ToSessionDocument(row, scoreMap.get(row.id) ?? []));

	const sessionsWithScoreInfo = await attachSessionScoreInfo(sessions);

	sessionsWithScoreInfo.sort(
		(a, b) => (b.calculatedData[alg] ?? -Infinity) - (a.calculatedData[alg] ?? -Infinity),
	);

	return res.status(200).json({
		success: true,
		description: `Retrieved ${sessions.length} sessions.`,
		body: sessionsWithScoreInfo,
	});
});

/**
 * Returns a users 100 most recent highlighted sessions. Returned in timeEnded order.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/sessions/highlighted
 */
router.get("/highlighted", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await DB.selectFrom("session")
		.select(SELECT_SESSION_DOCUMENT)
		.where("user_id", "=", user.id)
		.where("game", "=", v3Game)
		.where("highlight", "=", true)
		.orderBy("session.time_ended", "desc")
		.limit(100)
		.execute();

	const scoreMap = await GetScoreIdsGroupedBySessionId(rows.map((r) => r.id));

	const sessions = rows.map((row) => ToSessionDocument(row, scoreMap.get(row.id) ?? []));

	const sessionsWithScoreInfo = await attachSessionScoreInfo(sessions);

	sessionsWithScoreInfo.sort((a, b) => b.timeEnded - a.timeEnded);

	return res.status(200).json({
		success: true,
		description: `Returned ${sessions.length} sessions.`,
		body: sessionsWithScoreInfo,
	});
});

/**
 * Returns a users 100 most recent sessions. Returned in timeEnded order.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/sessions/recent
 */
router.get("/recent", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await DB.selectFrom("session")
		.select(SELECT_SESSION_DOCUMENT)
		.where("user_id", "=", user.id)
		.where("game", "=", v3Game)
		.orderBy("session.time_ended", "desc")
		.limit(100)
		.execute();

	const scoreMap = await GetScoreIdsGroupedBySessionId(rows.map((r) => r.id));

	const sessions = rows.map((row) => ToSessionDocument(row, scoreMap.get(row.id) ?? []));

	const sessionsWithScoreInfo = await attachSessionScoreInfo(sessions);

	sessionsWithScoreInfo.sort((a, b) => b.timeEnded - a.timeEnded);

	return res.status(200).json({
		success: true,
		description: `Returned ${sessions.length} sessions.`,
		body: sessionsWithScoreInfo,
	});
});

/**
 * Returns a user's most recent session.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/sessions/last
 */
router.get("/last", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("session")
		.select(SELECT_SESSION_DOCUMENT)
		.where("user_id", "=", user.id)
		.where("game", "=", v3Game)
		.orderBy("session.time_ended", "desc")
		.executeTakeFirst();

	if (!row) {
		return res.status(404).json({
			success: false,
			description: `This user has not got any sessions!`,
		});
	}

	const scoreMap = await GetScoreIdsGroupedBySessionId([row.id]);

	const session = ToSessionDocument(row, scoreMap.get(row.id) ?? []);

	const scoreInfo = await GetSessionScoreInfo(session);

	return res.status(200).json({
		success: true,
		description: `Returned a session.`,
		body: {
			session,
			scoreInfo,
		},
	});
});

/**
 * Returns all sessions, but with unecessary properties removed so as to reduce
 * bandwidth. This is used for the calendar view in tachi-client, hence the name.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/sessions/calendar
 */
router.get("/calendar", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await DB.selectFrom("session")
		.select(SELECT_SESSION_CALENDAR)
		.where("user_id", "=", user.id)
		.where("game", "=", v3Game)
		.execute();

	return res.status(200).json({
		success: true,
		description: `Found ${rows.length} events.`,
		body: rows.map(ToSessionCalendarDocument),
	});
});

export default router;
