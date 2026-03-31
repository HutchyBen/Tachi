import type { Request, Response } from "express-serve-static-core";
import type { Game } from "tachi-db";

import {
	SELECT_CLASS_ACHIEVEMENT_DOCUMENT,
	ToClassAchievementDocument,
} from "#lib/db-formats/class-achievement";
import { type ScoreDocumentJoinRow, ToScoreDocument } from "#lib/db-formats/score";
import { SELECT_SESSION_DOCUMENT, ToSessionDocument } from "#lib/db-formats/session";
import DB from "#services/pg/db";
import {
	GetRecentlyAchievedGoals,
	GetRecentlyAchievedQuests,
	GetRelevantSongsAndCharts,
} from "#utils/db";
import { DedupeArr } from "#utils/misc";
import { scoreDocumentJoin } from "#utils/queries/scores";
import { GetScoreIdsGroupedBySessionId } from "#utils/queries/sessions";
import { GetGPT } from "#utils/req-tachi-data";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { GetUsersWithIDs } from "#utils/user";
import { sql } from "kysely";
import {
	type GameGroup,
	GamePTToV3,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_ClassAchievementDocument,
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_QuestDocument,
	type MONGO_QuestSubscriptionDocument,
	type MONGO_ScoreDocument,
	type MONGO_SessionDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	type Playtype,
} from "tachi-common";

export type ActivityConstraint = {
	game: GameGroup;
	playtype: Playtype;
	userID?: integer | { $in: Array<integer> };
};

/** Kysely dynamic column refs — same pattern as `whereUserIdOnGoalSub` in `#utils/db`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OperandExpressionFactory varies by query (session / join / class_achievement).
type ActivityWhereEb = any;

function whereActivityUserId(
	userID: ActivityConstraint["userID"],
	column: "score.user_id" | "user_id",
) {
	if (userID === undefined) {
		return undefined;
	}

	if (typeof userID === "number") {
		return (eb: ActivityWhereEb) => eb(column, "=", userID);
	}

	if (
		userID &&
		typeof userID === "object" &&
		"$in" in userID &&
		Array.isArray(userID.$in)
	) {
		const ids = userID.$in;

		if (ids.length === 0) {
			return () => sql<boolean>`false`;
		}

		return (eb: ActivityWhereEb) => eb(column, "in", ids);
	}

	throw new Error("Unsupported userID filter for activity.");
}

function whereMsRangeOnColumn(
	column: "class_achievement.timestamp" | "score.time_achieved",
	earliestMs: number,
	startFrom: number | null,
) {
	return (eb: ActivityWhereEb) => {
		if (startFrom !== null) {
			return eb.and([
				eb(column, ">=", UnixMillisecondsToISO8601(earliestMs)),
				eb(column, "<", UnixMillisecondsToISO8601(startFrom)),
			]);
		}

		return eb(column, ">=", UnixMillisecondsToISO8601(earliestMs));
	};
}

/**
 * Retrieves recent activity for this group of users for this GPT.
 *
 * At the moment, this retrieves the following events:
 * - Recent Sessions
 * - Recent Highlighted Scores
 * - Achieved Classes
 * - Recently achieved goals
 * - Recently achieved quests
 *
 * To get the set of things we want to fetch, we fetch the first N sessions we see.
 * This sets our "upper bound" for how far back we want to look -- when the Nth session
 * started.
 *
 * Optionally, startFrom can be passed, which will start this activity search from that
 * point in time.
 *
 * @bug - With the way `startFrom` works, its possible to "skip over" sessions that have
 * the **exact** same timestamp, but didn't fall into the previous limit.
 *
 * for an array of imagined timestamps with sessions=3, followed by startFrom=3
 * i.e. [1, 2, 3] 3, 3, 3 [4, 5, 6]
 */
export async function GetRecentActivity(
	game: GameGroup,
	query: ActivityConstraint,
	sessions = 30,
	startFrom: number | null = null,
): Promise<{
	achievedClasses: Array<MONGO_ClassAchievementDocument>;
	charts: Array<MONGO_ChartDocument>;
	goals: Array<MONGO_GoalDocument>;
	goalSubs: Array<MONGO_GoalSubscriptionDocument>;
	quests: Array<MONGO_QuestDocument>;
	questSubs: Array<MONGO_QuestSubscriptionDocument>;
	recentlyHighlightedScores: Array<MONGO_ScoreDocument>;
	recentSessions: Array<MONGO_SessionDocument>;
	songs: Array<MONGO_SongDocument>;
	users: Array<MONGO_UserDocument>;
}> {
	const v3Game = GamePTToV3(query.game, query.playtype) as Game;
	const sessionUserWhere = whereActivityUserId(query.userID, "user_id");
	const scoreUserWhere = whereActivityUserId(query.userID, "score.user_id");
	const classUserWhere = whereActivityUserId(query.userID, "user_id");

	let sessionQ = DB.selectFrom("session")
		.select(SELECT_SESSION_DOCUMENT)
		.where("session.game", "=", v3Game);

	if (sessionUserWhere) {
		sessionQ = sessionQ.where(sessionUserWhere);
	}

	if (startFrom !== null) {
		sessionQ = sessionQ.where(
			"session.time_started",
			"<",
			UnixMillisecondsToISO8601(startFrom),
		);
	}

	const sessionRows = await sessionQ
		.orderBy("session.time_started", "desc")
		.limit(sessions)
		.execute();

	const scoreMap =
		sessionRows.length === 0
			? new Map<string, Array<string>>()
			: await GetScoreIdsGroupedBySessionId(sessionRows.map((r) => r.id));

	const recentSessions = sessionRows.map((row) =>
		ToSessionDocument(row, scoreMap.get(row.id) ?? []),
	);

	const earliestSession = recentSessions.at(-1)?.timeStarted ?? Date.now();

	const timeConstraint =
		startFrom !== null
			? { $lt: startFrom, $gte: earliestSession }
			: {
					$gte: earliestSession,
				};

	const timeWhereAchieved = whereMsRangeOnColumn(
		"class_achievement.timestamp",
		earliestSession,
		startFrom,
	);
	const timeWhereScore = whereMsRangeOnColumn("score.time_achieved", earliestSession, startFrom);

	let classQ = DB.selectFrom("class_achievement")
		.select(SELECT_CLASS_ACHIEVEMENT_DOCUMENT)
		.where("class_achievement.game", "=", v3Game)
		.where(timeWhereAchieved);

	if (classUserWhere) {
		classQ = classQ.where(classUserWhere);
	}

	let highlightQ = scoreDocumentJoin()
		.where("score.game", "=", v3Game)
		.where("score.highlight", "=", true)
		.where(timeWhereScore);

	if (scoreUserWhere) {
		highlightQ = highlightQ.where(scoreUserWhere);
	}

	const [
		classRows,
		highlightRows,
		{ goals, goalSubs },
		{ quests, questSubs },
	] = await Promise.all([
		classQ.orderBy("class_achievement.timestamp", "desc").execute(),
		highlightQ.orderBy(sql`score.time_achieved desc nulls last`).execute(),
		GetRecentlyAchievedGoals({ ...query, timeAchieved: timeConstraint }, 0),
		GetRecentlyAchievedQuests({ ...query, timeAchieved: timeConstraint }, 0),
	]);

	const achievedClasses = classRows.map(ToClassAchievementDocument);
	const recentlyHighlightedScores = highlightRows.map((row) =>
		ToScoreDocument(row as ScoreDocumentJoinRow),
	);

	const { songs, charts } = await GetRelevantSongsAndCharts(recentlyHighlightedScores, game);

	const userIDs = DedupeArr([
		...recentSessions.map((e) => e.userID),
		...recentlyHighlightedScores.map((e) => e.userID),
		...achievedClasses.map((e) => e.userID),
		...goalSubs.map((e) => e.userID),
		...questSubs.map((e) => e.userID),
	]);

	const users = await GetUsersWithIDs(userIDs);

	return {
		recentSessions,
		recentlyHighlightedScores,
		songs,
		charts,
		achievedClasses,
		users,
		goals,
		goalSubs,
		quests,
		questSubs,
	};
}

/**
 * @see {GetRecentActivity}, but for multiple games. Works pretty much as expected.
 *
 * @param gpts - An array of Game+Playtype combos to fetch from.
 */
export async function GetRecentActivityForMultipleGames(
	gpts: Array<{ game: GameGroup; playtype: Playtype }>,
	sessions = 30,
	startFrom: number | null = null,
) {
	// { "iidx:SP": {recentSessions: ..., ...} }
	const data: Partial<Record<GPTString, Awaited<ReturnType<typeof GetRecentActivity>>>> = {};

	await Promise.all(
		gpts.map(async ({ game, playtype }) => {
			const activity = await GetRecentActivity(
				game,
				{
					game,
					playtype,
				},
				sessions,
				startFrom,
			);

			data[`${game}:${playtype}` as GPTString] = activity;
		}),
	);

	// depressingly, we have to discard most of this data for sorting reasons
	// because not all sessions are guaranteed to be in the same order
	// it's possible for, say, a really old jubeat session to push the "oldest session"
	// very far back, resulting in us skipping over data.

	const flatPointer = Object.entries(data) as Array<
		[GPTString, { recentSessions: Array<MONGO_SessionDocument> }]
	>;

	// sort all games data to find the Nth session (where we should set our cutoff).
	const sessionTimes = flatPointer
		.flatMap((e) => e[1].recentSessions.map((e) => e.timeEnded))
		.sort((a, b) => b - a);

	const stop = sessionTimes[sessions] ?? -Infinity;

	for (const value of Object.values(data)) {
		// remove all data that happened before the stop point.
		value.achievedClasses = value.achievedClasses.filter((e) => e.timeAchieved > stop);
		value.goalSubs = value.goalSubs.filter(
			(e) => e.timeAchieved !== null && e.timeAchieved > stop,
		);
		value.questSubs = value.questSubs.filter(
			(e) => e.timeAchieved !== null && e.timeAchieved > stop,
		);
		value.recentSessions = value.recentSessions.filter((e) => e.timeEnded > stop);
		value.recentlyHighlightedScores = value.recentlyHighlightedScores.filter(
			(e) => e.timeAchieved !== null && e.timeAchieved > stop,
		);
	}

	return data;
}

/**
 * Utility for creating an express handler for activity-related endpoints. These endpoints
 * are all *remarkably* similar, but with slightly different initial constraints.
 *
 * This creates a function that you should call inside another route.
 */
export function CreateActivityRouteHandler(query: ActivityConstraint) {
	return async (req: Request, res: Response) => {
		const { game } = GetGPT(req);

		const qSessions = req.query.sessions;
		const qStartTime = req.query.startTime;

		if (qSessions !== undefined && typeof qSessions !== "string") {
			return res.status(400).json({
				success: false,
				description: `Invalid 'sessions'.`,
			});
		}

		if (qStartTime !== undefined && typeof qStartTime !== "string") {
			return res.status(400).json({
				success: false,
				description: `Invalid 'startTime'.`,
			});
		}

		// defaulting to 30 seems sensible.
		const sessions = qSessions ? Number(qSessions) : 30;

		if (sessions > 100 || sessions < 10 || Number.isNaN(sessions)) {
			return res.status(400).json({
				success: false,
				description: `Invalid sessions, got ${sessions}, which wasn't between 10 and 100.`,
			});
		}

		const startTime = qStartTime ? Number(qStartTime) : null;

		if (Number.isNaN(startTime)) {
			return res.status(400).json({
				success: false,
				description: `Invalid startTime, got a non number.`,
			});
		}

		const recentActivity = await GetRecentActivity(game, query, sessions, startTime);

		return res.status(200).json({
			success: true,
			description: `Retrieved activity.`,
			body: recentActivity,
		});
	};
}
