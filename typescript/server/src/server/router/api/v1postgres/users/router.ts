import { SearchUsersRegExp } from "#lib/search/search";
import db from "#services/mongo/db";
import { IsString } from "#utils/misc";
import { GetOnlineCutoff } from "#utils/user";
import { Router } from "express";

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
		const query = onlyOnline ? { lastSeen: { $gt: GetOnlineCutoff() } } : {};

		users = await db.users.find(query, {
			sort: { lastSeen: -1 },
			limit: 100,
		});
	}

	return res.status(200).json({
		success: true,
		description: `Returned ${users.length} users.`,
		body: users,
	});
});

router.use("/:userID", userIDRouter);

export default router;
