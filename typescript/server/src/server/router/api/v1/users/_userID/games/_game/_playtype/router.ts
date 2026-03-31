import { CreateActivityRouteHandler } from "#lib/activity/activity";
import { PasswordCompare, ValidatePassword } from "#lib/auth/auth";
import { ONE_MONTH, ONE_WEEK, ONE_YEAR } from "#lib/constants/time";
import { GetChartsByIds } from "#lib/db-formats/chart.js";
import { SELECT_GAME_PROFILE, ToGameStatsDocument } from "#lib/db-formats/game-profiles.js";
import {
	type PbDocumentJoinRow,
	SELECT_PB_DOCUMENT_WITH_LEADERBOARD,
	ToPbScoreDocument,
} from "#lib/db-formats/pb";
import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import { GetSongsByLegacyIDs } from "#lib/db-formats/song.js";
import { log } from "#lib/log/log";
import prValidate from "#server/middleware/prudence-validate";
import DB from "#services/pg/db";
import { IsString } from "#utils/misc";
import { GetTachiData, GetUGPT } from "#utils/req-tachi-data";
import DestroyUserGameProfile from "#utils/reset-state/destroy-user-game-profile.js";
import { CheckStrProfileAlg } from "#utils/string-checks";
import { ISO8601ToUnixMilliseconds, UnixMillisecondsToISO8601 } from "#utils/time";
import {
	FormatUserDoc,
	GetAllRankings,
	GetUGPTPlaycount,
	GetUserPrivateInfo,
	GetUsersRankingAndOutOf,
	GetUsersWithIDs,
} from "#utils/user";
import { Router } from "express";
import { sql, type SqlBool } from "kysely";
import { p } from "prudence";
import {
	FormatGameGroup,
	GamePTToV3,
	GetGamePTConfig,
	type GPTString,
	type integer,
	type MONGO_PBScoreDocument,
	type MONGO_UserGameStatsSnapshotDocument,
	type ProfileRatingAlgorithms,
} from "tachi-common";

import { RequireAuthedAsUser, RequireSelfRequestFromUser } from "../../../middleware";
import foldersRouter from "./folders/router";
import { CheckUserPlayedGamePlaytype } from "./middleware";
import pbsRouter from "./pbs/router";
import rivalsRouter from "./rivals/router";
import scoresRouter from "./scores/router";
import sessionsRouter from "./sessions/router";
import settingsRouter from "./settings/router";
import showcaseRouter from "./showcase/router";
import tablesRouter from "./tables/router";
import targetsRouter from "./targets/router";

const router: Router = Router({ mergeParams: true });

router.use(CheckUserPlayedGamePlaytype);

/**
 * Returns information about a user for this game + playtype.
 * @name GET /api/v1/users/:userID/games/:game/:playtype
 */
router.get("/", async (req, res) => {
	const { game, playtype, user } = GetUGPT(req);

	const stats = GetTachiData(req, "requestedUserGameStats");
	const v3Game = GamePTToV3(game, playtype);

	const scoreJoin = () =>
		DB.selectFrom("score")
			.innerJoin("chart", "chart.id", "score.chart_id")
			.innerJoin("song", "song.id", "chart.song_id")
			.leftJoin("import", "import.id", "score.import_id")
			.where("score.user_id", "=", user.id)
			.where("score.game", "=", v3Game)
			.where("score.time_achieved", "is not", null);

	const [totalScores, firstRow, recentRow, rankingData, playtimeRow] = await Promise.all([
		DB.selectFrom("score")
			.select((eb) => eb.fn.countAll().as("c"))
			.where("user_id", "=", user.id)
			.where("game", "=", v3Game)
			.executeTakeFirst()
			.then((r) => Number(r?.c ?? 0)),
		scoreJoin()
			.select(SELECT_SCORE_DOCUMENT)
			.orderBy("score.time_achieved", "asc")
			.executeTakeFirst(),
		scoreJoin()
			.select(SELECT_SCORE_DOCUMENT)
			.orderBy("score.time_achieved", "desc")
			.executeTakeFirst(),
		GetAllRankings(stats),
		DB.selectFrom("session")
			.select(
				sql<number>`coalesce(sum(extract(epoch from (session.time_ended::timestamptz - session.time_started::timestamptz)) * 1000), 0)::double precision`.as(
					"playtime",
				),
			)
			.where("user_id", "=", user.id)
			.where("game", "=", v3Game)
			.executeTakeFirst(),
	]);

	const firstScore = firstRow ? ToScoreDocument(firstRow as ScoreDocumentJoinRow) : null;
	const mostRecentScore = recentRow ? ToScoreDocument(recentRow as ScoreDocumentJoinRow) : null;

	return res.status(200).json({
		success: true,
		description: `Retrieved user statistics for ${user.username} (${game} ${playtype})`,
		body: {
			gameStats: stats,
			firstScore,
			mostRecentScore,
			totalScores,
			rankingData,
			playtime: Math.round(Number(playtimeRow?.playtime ?? 0)),
		},
	});
});

/**
 * Returns a users game-stats for the past 90 days.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/history
 */
router.get(
	"/history",
	prValidate({
		duration: p.optional(p.isIn("week", "month", "3mo", "year")),
	}),
	async (req, res) => {
		const duration = req.query.duration as "3mo" | "month" | "week" | "year" | undefined;

		let time = Date.now();

		switch (duration) {
			case "year": {
				time = time - ONE_YEAR;
				break;
			}

			// if the user doesn't define anything, default to 3month
			case "3mo":
			case undefined: {
				time = time - ONE_MONTH * 3;
				break;
			}

			case "month": {
				time = time - ONE_MONTH;
				break;
			}

			case "week":
				time = time - ONE_WEEK;
		}

		const { game, playtype, user } = GetUGPT(req);

		const stats = GetTachiData(req, "requestedUserGameStats");
		const v3Game = GamePTToV3(game, playtype);

		const snapshotRows = await DB.selectFrom("game_stats_snapshot")
			.select(["timestamp", "playcount", "ratings", "classes", "rankings"])
			.where("user_id", "=", user.id)
			.where("game", "=", v3Game)
			.where("timestamp", ">=", UnixMillisecondsToISO8601(time))
			.orderBy("timestamp", "desc")
			.execute();

		const snapshots = snapshotRows.map(
			(row) =>
				({
					classes: row.classes,
					ratings: row.ratings,
					timestamp: ISO8601ToUnixMilliseconds(row.timestamp),
					playcount: row.playcount,
					rankings: row.rankings,
				}) as Omit<MONGO_UserGameStatsSnapshotDocument, "game" | "playtype" | "userID">,
		);

		const currentSnapshot: Omit<
			MONGO_UserGameStatsSnapshotDocument,
			"game" | "playtype" | "userID"
		> = {
			classes: stats.classes,
			ratings: stats.ratings,

			// lazy, should probably be this midnight
			timestamp: Date.now(),
			playcount: await GetUGPTPlaycount(user.id, game, playtype),
			rankings: await GetAllRankings(stats),
		};

		return res.status(200).json({
			success: true,
			description: `Successfully returned history for the past ${snapshots.length} days.`,
			body: [currentSnapshot, ...snapshots],
		});
	},
);

/**
 * Returns the users most played charts by playcount.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/most-played
 */
router.get("/most-played", async (req, res) => {
	const { game, playtype, user } = GetUGPT(req);
	const v3Game = GamePTToV3(game, playtype);

	const mostPlayed = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.select([
			"chart.id as chart_id",
			"song.legacy_id as song_legacy_id",
			sql<number>`count(*)::int`.as("playcount"),
		])
		.where("score.user_id", "=", user.id)
		.where("score.game", "=", v3Game)
		.groupBy(["chart.id", "song.legacy_id"])
		.orderBy("playcount", "desc")
		.limit(100)
		.execute();

	const chartIDs = mostPlayed.map((e) => e.chart_id);
	const songIDs = mostPlayed.map((e) => e.song_legacy_id);

	const [songs, charts, pbRows] = await Promise.all([
		GetSongsByLegacyIDs(game, songIDs),
		GetChartsByIds(game, chartIDs),
		chartIDs.length === 0
			? Promise.resolve([] as Array<PbDocumentJoinRow>)
			: DB.selectFrom("pb")
					.innerJoin("chart_leaderboard", "chart_leaderboard.row_id", "pb.row_id")
					.innerJoin("chart", "chart.id", "pb.chart_id")
					.innerJoin("song", "song.id", "chart.song_id")
					.select(SELECT_PB_DOCUMENT_WITH_LEADERBOARD)
					.where("pb.user_id", "=", user.id)
					.where("chart.id", "in", chartIDs)
					.execute()
					.then((rows) => rows as Array<PbDocumentJoinRow>),
	]);

	const playcountMap = new Map<string, integer>();

	for (const doc of mostPlayed) {
		playcountMap.set(doc.chart_id, doc.playcount);
	}

	const playcountPBs = (await Promise.all(pbRows.map((row) => ToPbScoreDocument(row)))) as Array<
		{ __playcount: integer } & MONGO_PBScoreDocument
	>;

	for (const pb of playcountPBs) {
		pb.__playcount = playcountMap.get(pb.chartID) ?? 0;
	}

	playcountPBs.sort((a, b) => b.__playcount - a.__playcount);

	return res.status(200).json({
		success: true,
		description: `Returned ${playcountPBs.length} scores.`,
		body: {
			songs,
			charts,
			pbs: playcountPBs,
		},
	});
});

/**
 * Returns the users around the given user on the leaderboard.
 *
 * @param alg - Optional, the algorithm to use.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/leaderboard-adjacent
 */
router.get("/leaderboard-adjacent", async (req, res) => {
	const { game, playtype, user } = GetUGPT(req);

	const gptConfig = GetGamePTConfig(game, playtype);

	let alg = gptConfig.defaultProfileRatingAlg;

	if (IsString(req.query.alg)) {
		const temp = CheckStrProfileAlg(game, playtype, req.query.alg);

		if (temp === null) {
			return res.status(400).json({
				success: false,
				description: `Invalid value of ${
					req.query.alg
				} for alg. Expected one of ${Object.keys(gptConfig.profileRatingAlgs).join(", ")}`,
			});
		}

		alg = temp;
	}

	const thisUsersStats = GetTachiData(req, "requestedUserGameStats");
	const v3Game = GamePTToV3(game, playtype);
	const userRating = thisUsersStats.ratings[alg] ?? 0;
	const ratingCol = sql<number>`coalesce((game_profile.ratings::jsonb->>${sql.lit(alg)})::numeric, 0)`;

	const [aboveRows, belowRows] = await Promise.all([
		DB.selectFrom("game_profile")
			.select(SELECT_GAME_PROFILE)
			.where("game", "=", v3Game)
			.where("user_id", "<>", user.id)
			.where(sql<SqlBool>`${ratingCol} > ${userRating}`)
			.orderBy(ratingCol, "asc")
			.limit(5)
			.execute(),
		DB.selectFrom("game_profile")
			.select(SELECT_GAME_PROFILE)
			.where("game", "=", v3Game)
			.where("user_id", "<>", user.id)
			.where(sql<SqlBool>`${ratingCol} <= ${userRating}`)
			.orderBy(ratingCol, "desc")
			.limit(5)
			.execute(),
	]);

	const above = aboveRows.map(ToGameStatsDocument);
	const below = belowRows.map(ToGameStatsDocument);

	const users = await GetUsersWithIDs([
		...aboveRows.map((e) => e.user_id),
		...belowRows.map((e) => e.user_id),
	]);

	const thisUsersRanking = await GetUsersRankingAndOutOf(thisUsersStats, alg);

	return res.status(200).json({
		success: true,
		description: `Returned ${above.length + below.length} nearby stats.`,
		body: {
			above: above.reverse(),
			below,
			users,
			thisUsersStats,
			thisUsersRanking,
		},
	});
});

/**
 * Retrieve activity for this user.
 *
 * @param session - See CreateActivityRouteHandler
 * @param startTime - See CreateActivityRouteHandler
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/activity
 */
router.get("/activity", (req, res) => {
	const { game, playtype, user } = GetUGPT(req);

	const route = CreateActivityRouteHandler({
		userID: user.id,
		game,
		playtype,
	});

	// this handles responding
	void route(req, res);
});

/**
 * Completely wipe this profile.
 * Requires a self-request from this user, and also checks that the user knows their
 * password. This is one of the most bolted down endpoints in the site, for obvious
 * reasons.
 *
 * @param !password - This user's password.
 *
 * @name DELETE /api/v1/users/:userID/games/:game/:playtype
 */
router.delete(
	"/",
	RequireSelfRequestFromUser,
	RequireAuthedAsUser,
	prValidate({
		"!password": ValidatePassword,
	}),
	async (req, res) => {
		const { user, game, playtype } = GetUGPT(req);
		const body = req.safeBody as {
			"!password": string;
		};

		log.info(
			`Recieved request to delete UGPT ${FormatUserDoc(user)} ${FormatGameGroup(game, playtype)}`,
		);

		const privateInfo = await GetUserPrivateInfo(user.id);

		if (!privateInfo) {
			log.error(
				{ user },
				`State desync for user ${FormatUserDoc(
					user,
				)}. This user has no password/email information?`,
			);

			return res.status(500).json({
				success: false,
				description: `An internal server error has occured.`,
			});
		}

		const passwordMatch = await PasswordCompare(body["!password"], privateInfo.password);

		if (!passwordMatch) {
			return res.status(403).json({
				success: false,
				description: `Invalid password.`,
			});
		}

		await DestroyUserGameProfile(user.id, game, playtype);

		return res.status(200).json({
			success: true,
			description: `Destroyed profile.`,
			body: {},
		});
	},
);

router.use("/pbs", pbsRouter);
router.use("/scores", scoresRouter);
router.use("/sessions", sessionsRouter);
router.use("/tables", tablesRouter);
router.use("/showcase", showcaseRouter);
router.use("/settings", settingsRouter);
router.use("/folders", foldersRouter);
router.use("/targets", targetsRouter);
router.use("/rivals", rivalsRouter);

export default router;
