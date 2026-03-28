import type { FilterQuery } from "mongodb";

import { log } from "#lib/log/log";
import MONGODB_KILL from "#services/mongo/db";
import DB from "#services/pg/db.js";
import {
	FormatChart,
	type GameGroup,
	type integer,
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_PBScoreDocument,
	type MONGO_QuestDocument,
	type MONGO_QuestlineDocument,
	type MONGO_QuestSubscriptionDocument,
	type MONGO_ScoreDocument,
} from "tachi-common";

export async function GetNextCounterValue(counterName: string): Promise<integer> {
	const sequenceDoc = await MONGODB_KILL.counters.findOneAndUpdate(
		{
			counterName,
		},
		{
			$inc: {
				value: 1,
			},
		},
		{
			// this is marked as deprecated, but it shouldn't be, as returnDocument: "before"
			// does nothing.
			returnOriginal: true,
		},
	);

	if (!sequenceDoc) {
		log.error(`Could not find sequence document for ${counterName}`);
		throw new Error(`Could not find sequence document for ${counterName}.`);
	}

	return sequenceDoc.value;
}

export async function DecrementCounterValue(counterName: string): Promise<integer> {
	log.debug(`Decrementing Counter Value ${counterName}.`);

	const sequenceDoc = await MONGODB_KILL.counters.findOneAndUpdate(
		{
			counterName,
		},
		{
			$inc: {
				value: -1,
			},
		},
		{
			returnOriginal: false,
		},
	);

	if (!sequenceDoc) {
		log.error(`Could not find sequence document for ${counterName}`);
		throw new Error(`Could not find sequence document for ${counterName}.`);
	}

	return sequenceDoc.value;
}

export async function GetRelevantSongsAndCharts(
	scores: Array<MONGO_PBScoreDocument | MONGO_ScoreDocument>,
	game: GameGroup,
) {
	const [songs, charts] = await Promise.all([
		MONGODB_KILL.anySongs[game].find({
			id: { $in: scores.map((e) => e.songID) },
		}),
		MONGODB_KILL.anyCharts[game].find({
			chartID: { $in: scores.map((e) => e.chartID) },
		}),
	]);

	return { songs, charts };
}

export async function UpdateGameSongIDCounter(game: "bms" | "pms") {
	const latestSong = await MONGODB_KILL.anySongs[game].findOne(
		{},
		{
			sort: { id: -1 },
			projection: { id: 1 },
		},
	);

	if (!latestSong) {
		log.warn(
			`No ${game} charts loaded, yet BMS sync was attempted? This was probably an initial setup, starting songIDs from 1.`,
		);
	}

	const largestSongID = latestSong?.id ?? 0;

	await MONGODB_KILL.counters.update(
		{
			counterName: `${game}-song-id`,
		},
		{
			$set: {
				value: largestSongID + 1,
			},
		},
	);
}

export async function GetChartForIDGuaranteed(game: GameGroup, chartID: string) {
	const chart = await MONGODB_KILL.anyCharts[game].findOne({ chartID });

	if (!chart) {
		throw new Error(`Couldn't find chart with ID ${chartID} (${game}).`);
	}

	return chart;
}

export async function GetSongForIDGuaranteed(game: GameGroup, songID: integer) {
	const song = await MONGODB_KILL.anySongs[game].findOne({ id: songID });

	if (!song) {
		throw new Error(`Couldn't find song with ID ${songID} (${game}).`);
	}

	return song;
}

export async function GetFolder(folderID: string) {
	return DB.selectFrom("folder")
		.select(SELECT_FOLDER)
		.where("id", "=", folderID)
		.executeTakeFirst()
		.then((res) => (res ? ToFolderDocument(res) : null));
}

export async function GetFolderForIDGuaranteed(folderID: string) {
	const folder = await GetFolder(folderID);

	if (!folder) {
		throw new Error(`Couldn't find folder with ID ${folderID}.`);
	}

	return folder;
}

export async function GetGoalForIDGuaranteed(goalID: string) {
	const goal = await MONGODB_KILL.goals.findOne({ goalID });

	if (!goal) {
		throw new Error(`Couldn't find goal with ID ${goalID}`);
	}

	return goal;
}

export async function GetQuestForIDGuaranteed(questID: string) {
	const quest = await MONGODB_KILL.quests.findOne({ questID });

	if (!quest) {
		throw new Error(`Couldn't find quest with ID ${questID}`);
	}

	return quest;
}

export async function HumaniseChartID(game: GameGroup, chartID: string) {
	const chart = await GetChartForIDGuaranteed(game, chartID);
	const song = await GetSongForIDGuaranteed(game, chart.songID);

	return FormatChart(game, song, chart);
}

/**
 * Get recently achieved goals for this query.
 *
 * @param baseQuery - A base query, used to limit results on GPTs or UGPTs.
 * @param limit - How many recently achieved goals to search for.
 * @returns - The goals and their subs.
 */
export async function GetRecentlyAchievedGoals(
	baseQuery: Omit<FilterQuery<MONGO_GoalSubscriptionDocument>, "achieved">,
	limit = 100,
) {
	const query: FilterQuery<MONGO_GoalSubscriptionDocument> = {
		...baseQuery,
		wasInstantlyAchieved: false,
		achieved: true,
	};

	const goalSubs = await MONGODB_KILL["goal-subs"].find(query, {
		sort: {
			timeAchieved: -1,
		},
		limit,
	});

	const goals = await MONGODB_KILL.goals.find({
		goalID: { $in: goalSubs.map((e) => e.goalID) },
	});

	return { goals, goalSubs };
}

/**
 * Get recently interacted-with goals for this query.
 *
 * @param baseQuery - A base query, used to limit results on GPTs or UGPTs.
 * @param limit - How many recently achieved goals to search for.
 * @returns - The goals and their subs.
 */
export async function GetRecentlyInteractedGoals(
	baseQuery: Omit<FilterQuery<MONGO_GoalSubscriptionDocument>, "achieved">,
	limit = 100,
) {
	const query: FilterQuery<MONGO_GoalSubscriptionDocument> = {
		...baseQuery,
		wasInstantlyAchieved: false,
		achieved: false,
		lastInteraction: { $ne: null },
	};

	const goalSubs = await MONGODB_KILL["goal-subs"].find(query, {
		sort: {
			lastInteraction: -1,
		},
		limit,
	});

	const goals = await MONGODB_KILL.goals.find({
		goalID: { $in: goalSubs.map((e) => e.goalID) },
	});

	return { goals, goalSubs };
}

/**
 * Get recently achieved quests for this query.
 *
 * @param baseQuery - A base query, used to limit results on GPTs or UGPTs.
 * @param limit - How many recently achieved goals to search for.
 * @returns - The quests and their subs.
 */
export async function GetRecentlyAchievedQuests(
	baseQuery: Omit<FilterQuery<MONGO_QuestSubscriptionDocument>, "achieved">,
	limit = 100,
) {
	const query: FilterQuery<MONGO_QuestSubscriptionDocument> = {
		...baseQuery,
		wasInstantlyAchieved: false,
		achieved: true,
	};

	const questSubs = await MONGODB_KILL["quest-subs"].find(query, {
		sort: {
			timeAchieved: -1,
		},
		limit,
	});

	const quests = await MONGODB_KILL.quests.find({
		questID: { $in: questSubs.map((e) => e.questID) },
	});

	return { quests, questSubs };
}

/**
 * Get recently interacted-with quests for this query.
 *
 * @param baseQuery - A base query, used to limit results on GPTs or UGPTs.
 * @param limit - How many recently achieved quests to search for.
 * @returns - The quests and their subs.
 */
export async function GetRecentlyInteractedQuests(
	baseQuery: Omit<FilterQuery<MONGO_QuestSubscriptionDocument>, "achieved">,
	limit = 100,
) {
	const query: FilterQuery<MONGO_QuestSubscriptionDocument> = {
		...baseQuery,
		lastInteraction: { $ne: null },
		achieved: false,
		wasInstantlyAchieved: false,
	};

	const questSubs = await MONGODB_KILL["quest-subs"].find(query, {
		sort: {
			lastInteraction: -1,
		},
		limit,
	});

	const quests = await MONGODB_KILL.quests.find({
		questID: { $in: questSubs.map((e) => e.questID) },
	});

	return { quests, questSubs };
}

export async function GetMostSubscribedGoals(
	query: FilterQuery<MONGO_GoalSubscriptionDocument>,
	limit = 100,
): Promise<Array<{ __subscriptions: integer } & MONGO_GoalDocument>> {
	const mostSubscribedGoals: Array<{ goal: MONGO_GoalDocument; subscriptions: integer }> =
		await MONGODB_KILL["goal-subs"].aggregate([
			{
				$match: query,
			},
			{
				$group: {
					_id: "$goalID",
					subscriptions: { $sum: 1 },
				},
			},
			{
				$sort: {
					subscriptions: -1,
				},
			},
			{
				$limit: limit,
			},
			{
				$lookup: {
					from: "goals",
					localField: "_id",
					foreignField: "goalID",
					as: "goal",
				},
			},
			{
				$set: {
					goal: { $arrayElemAt: ["$goal", 0] },
				},
			},
			{
				$unset: "goal._id",
			},
		]);

	return mostSubscribedGoals.map((e) => ({
		__subscriptions: e.subscriptions,
		...e.goal,
	}));
}

export async function GetMostSubscribedQuests(
	query: FilterQuery<MONGO_QuestSubscriptionDocument>,
	limit = 100,
): Promise<Array<{ __subscriptions: integer } & MONGO_QuestDocument>> {
	const mostSubscribedQuests: Array<{ subscriptions: integer } & MONGO_QuestDocument> =
		await MONGODB_KILL.quests.aggregate([
			{
				$match: query,
			},
			{
				$lookup: {
					from: "quest-subs",
					localField: "questID",
					foreignField: "questID",
					as: "subs",
				},
			},
			{
				$addFields: {
					subscriptions: { $size: "$subs" },
				},
			},
			{
				$unset: "subs",
			},
			{
				$sort: {
					subscriptions: -1,
				},
			},
			{
				$limit: limit,
			},
		]);

	return mostSubscribedQuests.map((e) => ({
		...e,
		__subscriptions: e.subscriptions,
	}));
}

export async function GetChildQuests(questline: MONGO_QuestlineDocument) {
	const quests = await MONGODB_KILL.quests.find({
		questID: { $in: questline.quests },
	});

	if (quests.length !== questline.quests.length) {
		log.warn(
			{ questline },
			`Expected to find ${questline.quests.length} quests in the database, but only found ${quests.length}.`,
		);
	}

	return quests;
}
