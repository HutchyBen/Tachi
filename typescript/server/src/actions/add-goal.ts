import { MakeAction } from "#lib/actions/actions.js";
import { SubscribeFailReasons } from "#lib/constants/err-codes.js";
import { ServerConfig } from "#lib/setup/config.js";
import { ConstructGoal, SubscribeToGoal } from "#lib/targets/goals.js";
import DB from "#services/pg/db.js";
import { IsUserAdmin } from "#utils/user.js";
import { ExpectedErr } from "bliss";
import { sql } from "kysely";
import {
	type GameGroup,
	GamePTToV3,
	GetGamePTConfig,
	type MONGO_GoalDocument,
	type Playtype,
} from "tachi-common";

export const ACTION_AddGoal = MakeAction("ADD_GOAL", async (taker, input) => {
	const { userID, game: gameStr, playtype: playtypeStr, charts, criteria } = input;
	const game = gameStr as GameGroup;
	const playtype = playtypeStr as Playtype;

	if (taker.acct.id !== userID && !(await IsUserAdmin(taker.acct.id))) {
		throw new ExpectedErr(403, "You are not authorised to modify this user's goals.");
	}

	const v3Game = GamePTToV3(game, playtype);

	const row = await DB.selectFrom("goal_sub")
		.innerJoin("goal", "goal.id", "goal_sub.goal_id")
		.select(sql<number>`count(*)::int`.as("c"))
		.where("goal_sub.user_id", "=", userID)
		.where("goal.game", "=", v3Game)
		.executeTakeFirst();

	const existingGoalsCount = Number(row?.c ?? 0);

	if (existingGoalsCount > ServerConfig.MAX_GOAL_SUBSCRIPTIONS) {
		throw new ExpectedErr(
			400,
			`You already have ${ServerConfig.MAX_GOAL_SUBSCRIPTIONS} goals. You cannot have anymore.`,
		);
	}

	const gptConfig = GetGamePTConfig(game, playtype);

	const validCriteria = [
		...Object.keys(gptConfig.providedMetrics),
		...Object.keys(gptConfig.derivedMetrics),
	];

	const criteriaKey = (criteria as { key?: string }).key;

	if (typeof criteriaKey !== "string" || !validCriteria.includes(criteriaKey)) {
		throw new ExpectedErr(
			400,
			`Invalid criteria '${String(criteriaKey)}', expected any of ${validCriteria.join(", ")}.`,
		);
	}

	let goal: MONGO_GoalDocument;

	try {
		goal = await ConstructGoal(
			charts as MONGO_GoalDocument["charts"],
			criteria as MONGO_GoalDocument["criteria"],
			game,
			playtype,
		);
	} catch (e) {
		throw new ExpectedErr(400, (e as Error).message);
	}

	const goalSub = await SubscribeToGoal(userID, goal, true);

	if (goalSub === SubscribeFailReasons.ALREADY_SUBSCRIBED) {
		throw new ExpectedErr(409, "You are already subscribed to this goal.");
	}

	if (goalSub === SubscribeFailReasons.ALREADY_ACHIEVED) {
		throw new ExpectedErr(
			400,
			"You can't directly assign goals that you would immediately achieve.",
		);
	}

	return { goalID: goal.goalID };
});
