import { ACTION_FollowUser } from "#actions/follow-user";
import { ACTION_UnfollowUser } from "#actions/unfollow-user";
import { GetFollowingForUser } from "#utils/queries/settings";
import { GetUser } from "#utils/req-tachi-data";
import { GetUsersWithIDs } from "#utils/user";
import { Router } from "express";

import { RequireSelfRequestFromUser } from "../middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Retrieve who this user is following.
 *
 * @note Following a user means you get updates from them in your global activity feed.
 *
 * @name GET /api/v1/users/:userID/following
 */
router.get("/", async (req, res) => {
	const user = GetUser(req);

	const followingIDs = await GetFollowingForUser(user.id);
	const friends = await GetUsersWithIDs(followingIDs);

	return res.status(200).json({
		success: true,
		description: `Found ${friends.length} friend${friends.length !== 1 ? "s" : ""}.`,
		body: { friends },
	});
});

/**
 * Follow a new user.
 *
 * @param userID - The user to follow.
 *
 * @name POST /api/v1/users/:userID/following/add
 */
router.post("/add", RequireSelfRequestFromUser, async (req, res) => {
	const user = req.session.tachi!.user;
	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	const result = await ACTION_FollowUser(taker, { userID: req.body.userID });

	return res.status(200).json({
		success: true,
		description: `Added ${result.username}.`,
		body: {},
	});
});

/**
 * Unfollow a user.
 *
 * @param userID - The user to unfollow.
 *
 * @name POST /api/v1/users/:userID/following/remove
 */
router.post("/remove", RequireSelfRequestFromUser, async (req, res) => {
	const user = req.session.tachi!.user;
	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	const result = await ACTION_UnfollowUser(taker, { userID: req.body.userID });

	return res.status(200).json({
		success: true,
		description: `Unfollowed ${result.username}.`,
		body: {},
	});
});

export default router;
