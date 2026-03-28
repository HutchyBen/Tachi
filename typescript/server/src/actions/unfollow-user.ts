import { MakeAction } from "#lib/actions/actions.js";
import DB from "#services/pg/db.js";
import { GetUserWithID } from "#utils/user.js";
import { ExpectedErr } from "bliss";

export const ACTION_UnfollowUser = MakeAction(
	"UNFOLLOW_USER",
	async (taker, { userID: toUnfollow }) => {
		const existingFollow = await DB.selectFrom("account_following")
			.select("followee")
			.where("user_id", "=", taker.acct.id)
			.where("followee", "=", toUnfollow)
			.executeTakeFirst();

		if (!existingFollow) {
			throw new ExpectedErr(409, "You are not following this user.");
		}

		const userToUnfollow = await GetUserWithID(toUnfollow);

		if (!userToUnfollow) {
			throw new ExpectedErr(400, `No user with the id '${toUnfollow}' exists.`);
		}

		await DB.deleteFrom("account_following")
			.where("user_id", "=", taker.acct.id)
			.where("followee", "=", toUnfollow)
			.execute();

		return { username: userToUnfollow.username };
	},
);
