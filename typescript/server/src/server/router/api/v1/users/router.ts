import { SELECT_USER, ToUserDocument } from "#lib/db-formats/user";
import { SearchUsersRegExp } from "#lib/search/search";
import DB from "#services/pg/db";
import { IsString } from "#utils/misc";
import { apiSuccess } from "#utils/response";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { GetOnlineCutoff } from "#utils/user";
import { Router } from "express";
import { type MONGO_UserDocument } from "tachi-common";

import userIDRouter from "./_userID/router";

const router: Router = Router({ mergeParams: true });

/**
 * Search users.
 *
 * @param online - Restrict returned users to those who are online.
 * @param search - Search for users where their name contains this string. If not present, returns
 * users sorted by last appearance.
 *
 * @name GET /api/v1/users
 */
router.get("/", async (req, res) => {
	const onlyOnline = req.query.online !== undefined;

	let users;

	const search = req.query.search;

	if (search !== undefined) {
		if (!IsString(search)) {
			return res.status(400).json({
				success: false,
				description: `Search parameter was invalid.`,
			});
		}

		users = await SearchUsersRegExp(search, onlyOnline);
	} else {
		let query = DB.selectFrom("account").select(SELECT_USER);

		if (onlyOnline) {
			const onlineCutoff = GetOnlineCutoff();
			query = query
				.where("last_seen", ">", UnixMillisecondsToISO8601(onlineCutoff))
				.orderBy("last_seen", "desc")
				.limit(100);
		}

		users = await query
			.orderBy("last_seen", "desc")
			.limit(100)
			.execute()
			.then((res) => res.map(ToUserDocument));
	}

	return res
		.status(200)
		.json(apiSuccess<Array<MONGO_UserDocument>>(`Returned ${users.length} users.`, users));
});

router.use("/:userID", userIDRouter);

export default router;
