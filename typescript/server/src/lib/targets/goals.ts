import type { GoalCriteriaFormatter } from "#game-implementations/types";

import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import { SubscribeFailReasons } from "#lib/constants/err-codes";
import {
	ToGoalDocument,
	ToGoalSubscriptionDocument,
	ToQuestDocument,
	ToQuestSubscriptionDocument,
} from "#lib/db-formats/target-documents";
import { GetFolderChartIDs } from "#lib/folders/folders.js";
import {
	getGoalMetricValueFromPb,
	LoadPbsForUserOnChartsForGoal,
	pbMeetsGoalThreshold,
} from "#lib/targets/goal-pb-queries.js";
import { type KtLogger, log } from "#lib/log/log";
import DB from "#services/pg/db";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import fjsh from "fast-json-stable-hash";
import { sql } from "kysely";
import type { Game } from "tachi-db";
import {
	FormatGameGroup,
	type GameGroup,
	GamePTToV3,
	GetGPTConfig,
	GetGPTString,
	GetScoreMetricConf,
	type GPTString,
	type integer,
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_PBScoreDocument,
	type MONGO_QuestDocument,
	type MONGO_QuestSubscriptionDocument,
	type Playtype,
	V3ToGameGroup,
	v3AllGames,
} from "tachi-common";

import { CreateGoalTitle as CreateGoalName, ValidateGoalChartsAndCriteria } from "./goal-utils";

export interface EvaluatedGoalReturn {
	achieved: boolean;
	progress: number | null;
	outOf: number;
	progressHuman: string;
	outOfHuman: string;
}

/**
 * Creates a goalID from a goals charts and criteria.
 *
 * This uses FJSH to stable-stringify the charts and criteria,
 * then hashes that string under sha256.
 *
 * @note We could do better here, by converting criteria
 * to 'similar' criteria - like 100% resolving to 1million score
 * but that proves very complex to implement when it comes
 * to multiple games.
 */
export function CreateGoalID(
	charts: MONGO_GoalDocument["charts"],
	criteria: MONGO_GoalDocument["criteria"],
	game: GameGroup,
	playtype: Playtype,
) {
	return `G${fjsh.hash({ charts, criteria, game, playtype }, "sha256")}`;
}

export async function EvaluateGoalForUser(
	goal: MONGO_GoalDocument,
	userID: integer,
	log: KtLogger,
): Promise<EvaluatedGoalReturn | null> {
	const chartIDs = await ResolveGoalCharts(goal);
	const gptString = GetGPTString(goal.game, goal.playtype);
	const gptConfig = GetGPTConfig(gptString);
	const scoreConf = GetScoreMetricConf(gptConfig, goal.criteria.key);

	if (!scoreConf) {
		throw new Error(
			`Invalid goal.criteria.key, got '${goal.criteria.key}', but no config exists for this metric for ${gptString}.`,
		);
	}

	const pbs = await LoadPbsForUserOnChartsForGoal(userID, chartIDs);

	switch (goal.criteria.mode) {
		case "single": {
			const outOfHuman = HumaniseGoalOutOf(gptString, goal.criteria.key, goal.criteria.value);

			const qualifying = pbs.filter((pb) =>
				pbMeetsGoalThreshold(pb, goal.criteria.key, goal.criteria.value, scoreConf),
			);

			if (qualifying.length > 0) {
				const res = qualifying[0]!;

				return {
					achieved: true,
					outOf: goal.criteria.value,
					progress:
						scoreConf.type === "ENUM"
							? // @ts-expect-error narrow
								res.scoreData.enumIndexes[goal.criteria.key]
							: // @ts-expect-error narrow
								res.scoreData[goal.criteria.key],
					outOfHuman,
					progressHuman: HumaniseGoalProgress(
						gptString,
						goal.criteria.key,
						goal.criteria.value,
						res,
					),
				};
			}

			const scored = pbs
				.map((pb) => ({
					pb,
					v: getGoalMetricValueFromPb(pb, goal.criteria.key, scoreConf),
				}))
				.filter((e): e is { pb: MONGO_PBScoreDocument; v: number } => e.v !== null)
				.sort((a, b) => b.v - a.v);

			if (scored.length === 0) {
				return {
					achieved: false,
					outOf: goal.criteria.value,
					progress: null,
					outOfHuman,
					progressHuman: "NO DATA",
				};
			}

			const nextBestScore = scored[0]!.pb;

			return {
				achieved: false,
				outOf: goal.criteria.value,
				outOfHuman,
				progress:
					scoreConf.type === "ENUM"
						? // @ts-expect-error narrow
							nextBestScore.scoreData.enumIndexes[goal.criteria.key]
						: // @ts-expect-error narrow
							nextBestScore.scoreData[goal.criteria.key],
				progressHuman: HumaniseGoalProgress(
					gptString,
					goal.criteria.key,
					goal.criteria.value,
					nextBestScore,
				),
			};
		}

		case "absolute":
		case "proportion": {
			let count: number;

			if (goal.criteria.mode === "absolute") {
				count = goal.criteria.countNum;
			} else {
				const totalChartCount = chartIDs.length;

				count = Math.floor(goal.criteria.countNum * totalChartCount);
			}

			const userCount = pbs.filter((pb) =>
				pbMeetsGoalThreshold(pb, goal.criteria.key, goal.criteria.value, scoreConf),
			).length;

			return {
				achieved: userCount >= count,
				progress: userCount,
				outOf: count,
				progressHuman: userCount.toString(),
				outOfHuman: count.toString(),
			};
		}

		default: {
			log.warn(
				{ goal },
				`Invalid goal: ${goal.goalID}, unknown criteria.mode ${
					(goal.criteria as MONGO_GoalDocument["criteria"]).mode
				}, ignoring.`,
			);

			return null;
		}
	}
}

/**
 * Resolves the set of charts involved with this goal.
 *
 * @returns An array of chartIDs.
 */
function ResolveGoalCharts(goal: MONGO_GoalDocument): Array<string> | Promise<Array<string>> {
	switch (goal.charts.type) {
		case "single":
			return [goal.charts.data];
		case "multi":
			return goal.charts.data;
		case "folder":
			return GetFolderChartIDs(goal.charts.data);
		default:
			// @ts-expect-error This can't happen normally, but if it does, I want to
			// handle it properly.
			throw new Error(`Unknown goal.charts.type of ${goal.charts.type}`);
	}
}

type GoalKeys = MONGO_GoalDocument["criteria"]["key"];

/**
 * Turn a users progress (i.e. their PB on a chart where the goal is "AAA $chart")
 * into a human-understandable string.
 *
 * This applies GPT-specific formatting in some cases, like appending 'bp' to
 * IIDX lamp goals.
 */
export function HumaniseGoalProgress(
	gptString: GPTString,
	key: GoalKeys,
	goalValue: integer,
	userPB: MONGO_PBScoreDocument,
): string {
	const gptImpl = GPT_SERVER_IMPLEMENTATIONS[gptString];

	// @ts-expect-error yeah this might fail, i know.
	const formatter = gptImpl.goalProgressFormatters[key];

	if (!formatter) {
		throw new Error(
			`Attempted to format progress for metric '${key}' when no such score metric exists for ${gptString}.`,
		);
	}

	return formatter(userPB, goalValue);
}

/**
 * Turn a goal's "outOf" (i.e. HARD CLEAR; AAA or score=2450) into a human-understandable
 * string.
 */
export function HumaniseGoalOutOf(gptString: GPTString, key: GoalKeys, value: number) {
	const gptConf = GetGPTConfig(gptString);

	const metricConf = GetScoreMetricConf(gptConf, key);

	if (!metricConf) {
		throw new Error(
			`Attempted to format outOf for metric '${key}' when no such score metric exists for ${gptString}.`,
		);
	}

	if (metricConf.type === "ENUM") {
		const val = metricConf.values[value];

		if (val === undefined) {
			throw new Error(
				`Attempted to format outOf for metric '${key}' but no such enum exists at index ${value}. (${gptString})`,
			);
		}

		return val;
	}

	const gptImpl = GPT_SERVER_IMPLEMENTATIONS[gptString];

	// @ts-expect-error yeah this is technically unsafe, whatever
	const fmt: GoalCriteriaFormatter | undefined = gptImpl.goalOutOfFormatters[key];

	if (!fmt) {
		throw new Error(
			`Invalid metric '${key}' passed to format outOf, as no goalCriteriaFormatter exists for it.`,
		);
	}

	return fmt(value);
}

/**
 * Given some data about a goal, create a full Goal Document from it. This returns
 * the goal document on success, and throws/panics on error.
 *
 * @param criteria - The criteria for this goal.
 * @param charts - The set of charts relevant to this goal.
 */
export async function ConstructGoal(
	charts: MONGO_GoalDocument["charts"],
	criteria: MONGO_GoalDocument["criteria"],
	game: GameGroup,
	playtype: Playtype,
): Promise<MONGO_GoalDocument> {
	await ValidateGoalChartsAndCriteria(charts, criteria, game, playtype);

	// @ts-expect-error It's complaining because the potential criteria types might mismatch.
	const MONGO_GoalDocument: MONGO_GoalDocument = {
		game,
		playtype,
		criteria,
		charts,
		goalID: CreateGoalID(charts, criteria, game, playtype),
		name: await CreateGoalName(charts, criteria, game, playtype),
	};

	return MONGO_GoalDocument;
}

async function ensureGoalRow(doc: MONGO_GoalDocument) {
	const v3Game = GamePTToV3(doc.game, doc.playtype);

	const existed = await DB.selectFrom("goal").select("goal.id").where("id", "=", doc.goalID).executeTakeFirst();

	if (!existed) {
		await DB.insertInto("goal")
			.values({
				id: doc.goalID,
				game: v3Game,
				name: doc.name,
				charts: doc.charts,
				criteria: doc.criteria,
			})
			.execute();

		log.info(`Inserting new goal '${doc.name}'.`);
	}
}

/**
 * Subscribes a user to the provided goal document. Handles deduping goals naturally
 * and general good stuff.
 *
 * @param isStandaloneAssigment - is this a "standalone assignment?", as in, not a
 * consequence of a quest assignment. Standalone assignments are not allowed to be
 * instantly-achieved. if they are, it will fail with
 * SubscribeFailReasons.ALREADY_ACHIEVED.
 *
 * Returns null if the user is already subscribed to this goal.
 */
export async function SubscribeToGoal(
	userID: integer,
	MONGO_GoalDocument: MONGO_GoalDocument,
	isStandaloneAssignment: boolean,
) {
	await ensureGoalRow(MONGO_GoalDocument);

	const existingSub = await DB.selectFrom("goal_sub")
		.innerJoin("goal", "goal.id", "goal_sub.goal_id")
		.selectAll("goal_sub")
		.select("goal.game as goal_game")
		.where("goal_sub.goal_id", "=", MONGO_GoalDocument.goalID)
		.where("goal_sub.user_id", "=", userID)
		.executeTakeFirst();

	if (existingSub) {
		const userAlreadySubscribed = ToGoalSubscriptionDocument({
			...existingSub,
			goal_game: existingSub.goal_game as Game,
		});

		if (!isStandaloneAssignment) {
			return SubscribeFailReasons.ALREADY_SUBSCRIBED;
		}

		if (userAlreadySubscribed.wasAssignedStandalone) {
			return SubscribeFailReasons.ALREADY_SUBSCRIBED;
		}

		await DB.updateTable("goal_sub")
			.set({ was_assigned_standalone: true })
			.where("goal_id", "=", MONGO_GoalDocument.goalID)
			.where("user_id", "=", userID)
			.execute();

		const updated = await DB.selectFrom("goal_sub")
			.innerJoin("goal", "goal.id", "goal_sub.goal_id")
			.selectAll("goal_sub")
			.select("goal.game as goal_game")
			.where("goal_sub.goal_id", "=", MONGO_GoalDocument.goalID)
			.where("goal_sub.user_id", "=", userID)
			.executeTakeFirstOrThrow();

		return ToGoalSubscriptionDocument({
			...updated,
			goal_game: updated.goal_game as Game,
		});
	}

	const result = await EvaluateGoalForUser(MONGO_GoalDocument, userID, log);

	if (!result) {
		throw new Error(`Couldn't evaluate goal? See previous logs.`);
	}

	if (result.achieved && isStandaloneAssignment) {
		return SubscribeFailReasons.ALREADY_ACHIEVED;
	}

	const nowMs = Date.now();
	const nowIso = UnixMillisecondsToISO8601(nowMs);

	const baseSub = {
		outOf: result.outOf,
		outOfHuman: result.outOfHuman,
		progress: result.progress,
		progressHuman: result.progressHuman,
		userID,
		lastInteraction: null,
		game: MONGO_GoalDocument.game,
		playtype: MONGO_GoalDocument.playtype,
		goalID: MONGO_GoalDocument.goalID,
		wasInstantlyAchieved: result.achieved,
		wasAssignedStandalone: isStandaloneAssignment,
	};

	const goalSub: MONGO_GoalSubscriptionDocument = result.achieved
		? {
				...baseSub,
				achieved: true,
				timeAchieved: nowMs,
			}
		: {
				...baseSub,
				achieved: false,
				timeAchieved: null,
			};

	await DB.insertInto("goal_sub")
		.values({
			goal_id: MONGO_GoalDocument.goalID,
			user_id: userID,
			last_interaction: null,
			progress: goalSub.progress,
			progress_human: goalSub.progressHuman,
			out_of: goalSub.outOf,
			out_of_human: goalSub.outOfHuman,
			achieved: goalSub.achieved,
			time_achieved: result.achieved ? nowIso : null,
			was_instantly_achieved: goalSub.wasInstantlyAchieved,
			was_assigned_standalone: goalSub.wasAssignedStandalone,
		})
		.execute();

	return goalSub;
}

export async function GetQuestsThatContainGoal(goalID: string): Promise<Array<MONGO_QuestDocument>> {
	const rows = await DB.selectFrom("quest")
		.selectAll()
		.where(
			sql<boolean>`exists (
				select 1
				from jsonb_array_elements(quest.quest_data) as section,
				lateral jsonb_array_elements(coalesce(section->'goals', '[]'::jsonb)) as g
				where g->>'goalID' = ${goalID}
			)`,
		)
		.execute();

	return rows.map(ToQuestDocument);
}

/**
 * Unsubscribing from a goal may not be legal, because the goal might be part of
 * a quest the user is subscribed to. This function returns all quests
 * and questSubs that a goal is attached to.
 *
 * If this query matches none, an empty array is returned.
 */
export async function GetQuestSubsWhichDependOnThisGoalSub(
	goalSub: MONGO_GoalSubscriptionDocument,
): Promise<Array<{ quest: MONGO_QuestDocument } & MONGO_QuestSubscriptionDocument>> {
	const v3Game = GamePTToV3(goalSub.game, goalSub.playtype);

	const subRows = await DB.selectFrom("quest_sub")
		.innerJoin("quest", "quest.id", "quest_sub.quest_id")
		.selectAll("quest_sub")
		.select("quest.game as quest_game")
		.where("quest_sub.user_id", "=", goalSub.userID)
		.where("quest.game", "=", v3Game)
		.where(
			sql<boolean>`exists (
				select 1
				from jsonb_array_elements(quest.quest_data) as section,
				lateral jsonb_array_elements(coalesce(section->'goals', '[]'::jsonb)) as g
				where g->>'goalID' = ${goalSub.goalID}
			)`,
		)
		.execute();

	const questIds = [...new Set(subRows.map((r) => r.quest_id))];

	const questRows =
		questIds.length === 0
			? []
			: await DB.selectFrom("quest").selectAll().where("id", "in", questIds).execute();

	const questById = new Map(questRows.map((q) => [q.id, ToQuestDocument(q)]));

	return subRows.map((r) => {
		const quest = questById.get(r.quest_id);

		if (!quest) {
			throw new Error(`quest ${r.quest_id} missing after join`);
		}

		return {
			quest,
			...ToQuestSubscriptionDocument({
				quest_id: r.quest_id,
				user_id: r.user_id,
				progress: r.progress,
				last_interaction: r.last_interaction,
				achieved: r.achieved,
				time_achieved: r.time_achieved,
				was_instantly_achieved: r.was_instantly_achieved,
				quest_game: r.quest_game as Game,
			}),
		};
	});
}

/**
 * Given a goalSub, unsubscribe from it.
 *
 * On success, this will return null. On failure, this will return a failure reason.
 * For example, if this goalSub has parent quests involved that prevent its removal, it
 * will return those as an array.
 *
 * @param preventStandaloneRemoval - Some goalsubs might be marked as "standalone". These
 * goals have been explicitly and deliberately assigned by the user, and should therefore
 * only be explicitly un-assigned.
 */
export async function UnsubscribeFromGoal(
	goalSub: MONGO_GoalSubscriptionDocument,
	preventStandaloneRemoval: boolean,
) {
	const dependencies = await GetGoalDependencies(goalSub);

	switch (dependencies.reason) {
		case "HAS_QUEST_DEPENDENCIES":
			return dependencies;

		case "WAS_STANDALONE": {
			if (preventStandaloneRemoval) {
				return dependencies;
			}

			break;
		}

		case "WAS_ORPHAN":
	}

	await DB.deleteFrom("goal_sub")
		.where("goal_id", "=", goalSub.goalID)
		.where("user_id", "=", goalSub.userID)
		.execute();

	return null;
}

/**
 * Get the reason why a goal was assigned to a user.
 * This is either "WAS_STANDALONE" -- the user assigned this goal directly and deliberately
 * or "HAS_QUEST_DEPENDENCIES" -- the user was assigned this goal as the consequence
 * of a quest subscription.
 *
 * Failing that, the goal will return "WAS_ORPHAN", there's no reason this goal
 * should be subscribed to the user -- it's safe to remove for any reason.
 */
export async function GetGoalDependencies(goalSub: MONGO_GoalSubscriptionDocument) {
	const parentQuests = await GetQuestSubsWhichDependOnThisGoalSub(goalSub);

	if (parentQuests.length) {
		return {
			reason: "HAS_QUEST_DEPENDENCIES",
			parentQuests,
		} as const;
	}

	if (goalSub.wasAssignedStandalone) {
		return {
			reason: "WAS_STANDALONE",
		} as const;
	}

	return { reason: "WAS_ORPHAN" } as const;
}

/**
 * For a given UGPT, unsubscribe from all their goals that no longer have any parent,
 * for example, a quest was removed, now they are left with some stranded goals that we
 * don't want to keep around.
 */
export async function UnsubscribeFromOrphanedGoalSubs(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
) {
	const v3Game = GamePTToV3(game, playtype);

	const subRows = await DB.selectFrom("goal_sub")
		.innerJoin("goal", "goal.id", "goal_sub.goal_id")
		.selectAll("goal_sub")
		.select("goal.game as goal_game")
		.where("goal_sub.user_id", "=", userID)
		.where("goal.game", "=", v3Game)
		.execute();

	const goalSubs = subRows.map((r) =>
		ToGoalSubscriptionDocument({
			...r,
			goal_game: r.goal_game as Game,
		}),
	);

	const maybeToRemove = await Promise.all(
		goalSubs.map(async (goalSub) => {
			const deps = await GetGoalDependencies(goalSub);

			if (deps.reason === "WAS_ORPHAN") {
				return goalSub.goalID;
			}

			return null;
		}),
	);

	const toRemove = maybeToRemove.filter((e): e is string => e !== null);

	if (toRemove.length > 0) {
		log.info(
			`Removing ${toRemove.length} goals from user ${userID} on ${FormatGameGroup(
				game,
				playtype,
			)} as they were orphanned.`,
		);

		await DB.deleteFrom("goal_sub")
			.where("user_id", "=", userID)
			.where("goal_id", "in", toRemove)
			.execute();
	}
}

/**
 * Gets the goals the user has set for this game and playtype.
 * Then, filters it based on the chartIDs involved in this import.
 *
 * This optimisation allows users to have *lots* of goals, but only ever
 * evaluate the ones we need to.
 *
 * @param onlyUnachieved - optionally, pass "onlyUnachieved=true" to limit this to
 * only goals that the user has not achieved.
 * @returns An array of Goals, and an array of goalSubs.
 */
export async function GetRelevantGoals(
	game: GameGroup,
	userID: integer,
	chartIDs: Set<string>,
	log: KtLogger,
	onlyUnachieved = false,
): Promise<{
	goals: Array<MONGO_GoalDocument>;
	goalSubsMap: Map<string, MONGO_GoalSubscriptionDocument>;
}> {
	const v3GamesForGroup = v3AllGames.filter((v) => V3ToGameGroup(v) === game);

	let q = DB.selectFrom("goal_sub")
		.innerJoin("goal", "goal.id", "goal_sub.goal_id")
		.selectAll("goal_sub")
		.select("goal.game as goal_game")
		.where("goal_sub.user_id", "=", userID)
		.where("goal.game", "in", v3GamesForGroup);

	if (onlyUnachieved) {
		q = q.where("goal_sub.achieved", "=", false);
	}

	const subRows = await q.execute();

	log.debug(`Found user has ${subRows.length} goals.`);

	if (!subRows.length) {
		return { goals: [], goalSubsMap: new Map() };
	}

	const goalSubs = subRows.map((r) =>
		ToGoalSubscriptionDocument({
			...r,
			goal_game: r.goal_game as Game,
		}),
	);

	const goalIDs = goalSubs.map((e) => e.goalID);

	const chartIDsArr: Array<string> = [];

	for (const c of chartIDs) {
		chartIDsArr.push(c);
	}

	const goalRows = await DB.selectFrom("goal").selectAll().where("goal.id", "in", goalIDs).execute();

	const directMulti: Array<MONGO_GoalDocument> = [];

	for (const g of goalRows) {
		const doc = ToGoalDocument(g);

		if (doc.charts.type === "single" && chartIDsArr.includes(doc.charts.data)) {
			directMulti.push(doc);
		} else if (doc.charts.type === "multi") {
			if (doc.charts.data.some((c) => chartIDsArr.includes(c))) {
				directMulti.push(doc);
			}
		}
	}

	const folderGoals = await GetRelevantFolderGoals(goalIDs, chartIDsArr);

	const goals = [...directMulti, ...folderGoals];
	const goalSet = new Set(goals.map((e) => e.goalID));

	const goalSubsMap: Map<string, MONGO_GoalSubscriptionDocument> = new Map();

	for (const goalSub of goalSubs) {
		if (!goalSet.has(goalSub.goalID)) {
			continue;
		}

		goalSubsMap.set(goalSub.goalID, goalSub);
	}

	return {
		goals,
		goalSubsMap,
	};
}

/**
 * Returns the set of goals where its folder contains any member
 * of chartIDsArr.
 */
export async function GetRelevantFolderGoals(goalIDs: Array<string>, chartIDsArr: Array<string>) {
	if (goalIDs.length === 0 || chartIDsArr.length === 0) {
		return [];
	}

	const rows = await DB.selectFrom("goal")
		.innerJoin("folder_chart_lookup", (join) =>
			join.on(sql`folder_chart_lookup.folder_id`, "=", sql`goal.charts->>'data'`),
		)
		.selectAll("goal")
		.where(sql`goal.charts->>'type'`, "=", "folder")
		.where("goal.id", "in", goalIDs)
		.where("folder_chart_lookup.chart_id", "in", chartIDsArr)
		.execute();

	return rows.map(ToGoalDocument);
}

/**
 * Rarely, some sort of change might happen where a goal needs to be edited.
 *
 * This happens if the goal schema changes, but that really is quite rare.
 */
export async function EditGoal(oldGoal: MONGO_GoalDocument, newGoal: MONGO_GoalDocument) {
	const newGoalID = CreateGoalID(
		newGoal.charts,
		newGoal.criteria,
		newGoal.game,
		newGoal.playtype,
	);

	newGoal.goalID = newGoalID;

	await DB.updateTable("goal_sub").set({ goal_id: newGoalID }).where("goal_id", "=", oldGoal.goalID).execute();

	const quests = await GetQuestsThatContainGoal(oldGoal.goalID);

	for (const quest of quests) {
		const newQuestData: MONGO_QuestDocument["questData"] = [];

		for (const qd of quest.questData) {
			const goals = [];

			for (const goal of qd.goals) {
				if (goal.goalID === oldGoal.goalID) {
					goals.push({ ...goal, goalID: newGoal.goalID });
				} else {
					goals.push(goal);
				}
			}

			newQuestData.push({
				...qd,
				goals,
			});
		}

		await DB.updateTable("quest")
			.set({ quest_data: newQuestData })
			.where("quest.id", "=", quest.questID)
			.execute();
	}

	await DB.deleteFrom("goal").where("goal.id", "=", oldGoal.goalID).execute();

	newGoal.name = await CreateGoalName(
		newGoal.charts,
		newGoal.criteria,
		newGoal.game,
		newGoal.playtype,
	);

	const v3Game = GamePTToV3(newGoal.game, newGoal.playtype);

	try {
		await DB.insertInto("goal")
			.values({
				id: newGoal.goalID,
				game: v3Game,
				name: newGoal.name,
				charts: newGoal.charts,
				criteria: newGoal.criteria,
			})
			.execute();
	} catch {
		log.info(`Goal ${newGoal.name} already existed.`);
	}
}
