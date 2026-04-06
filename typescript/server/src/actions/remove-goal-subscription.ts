import { MakeAction } from "#lib/actions/actions.js";
import { SELECT_GOAL_SUB_WITH_GOAL_GAME } from "#lib/db-formats/goal";
import { ToGoalSubscriptionDocument } from "#lib/db-formats/target-documents.js";
import { UnsubscribeFromGoal } from "#lib/targets/goals.js";
import DB from "#services/pg/db.js";
import { staticAssertUnreachable } from "#utils/misc.js";
import { IsUserAdmin } from "#utils/user.js";
import { ExpectedErr } from "bliss";
import { type GameGroup, GamePTToV3, type Playtype } from "tachi-common";

export const ACTION_RemoveGoalSubscription = MakeAction(
	"REMOVE_GOAL_SUBSCRIPTION",
	async (taker, input) => {
		const { userID, game: gameStr, playtype: playtypeStr, goalID } = input;
		const game = gameStr as GameGroup;
		const playtype = playtypeStr as Playtype;

		if (taker.acct.id !== userID && !(await IsUserAdmin(taker.acct.id))) {
			throw new ExpectedErr(403, "You are not authorised to modify this user's goals.");
		}

		const v3Game = GamePTToV3(game, playtype);

		const row = await DB.selectFrom("goal_sub")
			.innerJoin("goal", "goal.id", "goal_sub.goal_id")
			.select(SELECT_GOAL_SUB_WITH_GOAL_GAME)
			.where("goal_sub.user_id", "=", userID)
			.where("goal_sub.goal_id", "=", goalID)
			.where("goal.game", "=", v3Game)
			.executeTakeFirst();

		if (!row) {
			throw new ExpectedErr(404, "You are not subscribed to this goal.");
		}

		const goalSub = ToGoalSubscriptionDocument(row);

		const fail = await UnsubscribeFromGoal(goalSub, false);

		if (!fail) {
			return {};
		}

		switch (fail.reason) {
			case "HAS_QUEST_DEPENDENCIES":
				throw new ExpectedErr(
					400,
					`This goal is part of a quest you are subscribed to. It can only be removed by unsubscribing from the relevant quests: ${fail.parentQuests
						.map((e) => `'${e.quest.name}'`)
						.join(", ")}.`,
				);

			case "WAS_STANDALONE":
				throw new ExpectedErr(
					400,
					"This goal was assigned by you and can't be removed as a consequence of another action.",
				);

			default:
				staticAssertUnreachable(fail);
		}
	},
);
