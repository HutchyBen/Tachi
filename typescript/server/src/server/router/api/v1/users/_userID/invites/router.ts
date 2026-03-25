import { ACTION_CreateInvite } from "#actions/create-invite";
import { SELECT_INVITE, ToInviteDocument } from "#lib/db-formats/invite";
import { GetTotalAllowedInvites } from "#lib/invites/invites";
import { RequireInvitesEnabled } from "#server/middleware/type-require";
import DB from "#services/pg/db";
import { GetTachiData } from "#utils/req-tachi-data";
import { GetUsersWithIDs } from "#utils/user";
import { Router } from "express";
import { sql } from "kysely";

import { RequireSelfRequestFromUser } from "../middleware";

const router: Router = Router({ mergeParams: true });

router.use(RequireInvitesEnabled);
router.use(RequireSelfRequestFromUser);

/**
 * Retrieve all of this users created invites.
 *
 * @name GET /api/v1/users/:userID/invites
 */
router.get("/", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const rows = await DB.selectFrom("priv_invite")
		.select(SELECT_INVITE)
		.where("created_by", "=", user.id)
		.orderBy(sql`priv_invite.consumed_at desc nulls last`)
		.execute();

	const invites = rows.map(ToInviteDocument);

	const consumers = await GetUsersWithIDs(
		invites.map((e) => e.consumedBy).filter((e) => e !== null) as Array<number>,
	);

	return res.status(200).json({
		success: true,
		description: `Found ${invites.length} invites.`,
		body: { invites, consumers },
	});
});

/**
 * Return how many invites this user can create, and how many they
 * have already created.
 *
 * @name GET /api/v1/users/:userID/invites/limit
 */
router.get("/limit", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const { count } = await DB.selectFrom("priv_invite")
		.select(DB.fn.countAll().as("count"))
		.where("created_by", "=", user.id)
		.executeTakeFirstOrThrow();

	const invites = Number(count);
	const limit = GetTotalAllowedInvites(user);

	return res.status(200).json({
		success: true,
		description: `Calculated invite limit.`,
		body: {
			invites,
			limit,
		},
	});
});

/**
 * Create a new invite.
 *
 * @name POST /api/v1/users/:userID/invites/create
 */
router.post("/create", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");
	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	const inviteDoc = await ACTION_CreateInvite(taker, {});

	return res.status(200).json({
		success: true,
		description: `Created Invite.`,
		body: inviteDoc,
	});
});

export default router;
