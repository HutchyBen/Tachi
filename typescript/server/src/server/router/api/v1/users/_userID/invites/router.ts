import { GetTotalAllowedInvites } from "#lib/invites/invites";
import { RequireInvitesEnabled } from "#server/middleware/type-require";
import MONGODB_KILL from "#services/mongo/db";
import { Random20Hex } from "#utils/misc";
import { GetTachiData } from "#utils/req-tachi-data";
import { GetUsersWithIDs } from "#utils/user";
import { Router } from "express";
import { type InviteCodeDocument, UserAuthLevels } from "tachi-common";

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

	const invites = await MONGODB_KILL.invites.find(
		{
			createdBy: user.id,
		},
		{
			sort: {
				consumedAt: -1,
			},
		},
	);

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

	const invites = await MONGODB_KILL.invites.count({ createdBy: user.id });
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
	const userID = user.id;

	try {
		const lockExists = await MONGODB_KILL["invite-locks"].findOne({
			userID,
		});

		if (!lockExists) {
			await MONGODB_KILL["invite-locks"].insert({
				userID,
				locked: false,
			});
		}

		const isNotLocked = await MONGODB_KILL["invite-locks"].findOneAndUpdate(
			{
				userID,
				locked: false,
			},
			{
				$set: { locked: true },
			},
		);

		// race condition protection
		// to avoid users double-creating invites.
		if (!isNotLocked) {
			return res.status(409).json({
				success: false,
				description: `You already have an outgoing invite creation request.`,
			});
		}

		const existingInvites = await MONGODB_KILL.invites.count({ createdBy: user.id });

		if (
			existingInvites >= GetTotalAllowedInvites(user) &&
			user.authLevel !== UserAuthLevels.ADMIN
		) {
			return res.status(400).json({
				success: false,
				description: `You already have your maximum amount of outgoing invites.`,
			});
		}

		const inviteDoc: InviteCodeDocument = {
			code: Random20Hex(),
			consumed: false,
			consumedAt: null,
			consumedBy: null,
			createdAt: Date.now(),
			createdBy: user.id,
		};

		await MONGODB_KILL.invites.insert(inviteDoc);

		return res.status(200).json({
			success: true,
			description: `Created Invite.`,
			body: inviteDoc,
		});
	} finally {
		await MONGODB_KILL["invite-locks"].findOneAndUpdate(
			{
				userID,
			},
			{
				$set: { locked: false },
			},
		);
	}
});

export default router;
