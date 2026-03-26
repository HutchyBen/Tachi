import { ACTION_DeleteMytCardInfo } from "#actions/delete-myt-card-info.js";
import { ACTION_UpdateMytCardInfo } from "#actions/update-myt-card-info.js";
import { SELECT_MYT_CARD_INFO, ToMytCardInfo } from "#lib/db-formats/myt-card-info";
import prValidate from "#server/middleware/prudence-validate";
import { RequireKamaitachi } from "#server/middleware/type-require";
import DB from "#services/pg/db";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";
import { p } from "prudence";

import { RequireSelfRequestFromUser } from "../../middleware";

const router: Router = Router({ mergeParams: true });

router.use(RequireKamaitachi);
router.use(RequireSelfRequestFromUser);

/**
 * Retrieve this user's card info (cardAccessCode).
 *
 * @name GET /api/v1/users/:userID/integrations/myt
 */
router.get("/", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const row = await DB.selectFrom("priv_svc_myt_card_info")
		.select(SELECT_MYT_CARD_INFO)
		.where("user_id", "=", user.id)
		.executeTakeFirst();

	return res.status(200).json({
		success: true,
		description: row ? `Found card info.` : `User has no card info set.`,
		body: row ? ToMytCardInfo(row) : null,
	});
});

/**
 * Write new card details for Myt.
 *
 * @name PUT /api/v1/users/:userID/integrations/myt
 */
router.put(
	"/",
	prValidate(
		{ cardAccessCode: p.regex(/^[0-9]{20}$/u) },
		{ cardAccessCode: "Expected 20 digits." },
	),
	async (req, res) => {
		const user = GetTachiData(req, "requestedUser");
		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		const { cardAccessCode } = req.safeBody as { cardAccessCode: string };

		await ACTION_UpdateMytCardInfo(taker, { cardAccessCode });

		return res.status(200).json({
			success: true,
			description: `Updated cardAccessCode.`,
			body: {},
		});
	},
);

/**
 * Unset this user's card details for Myt.
 *
 * @name DELETE /api/v1/users/:userID/integrations/myt
 */
router.delete("/", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");
	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	await ACTION_DeleteMytCardInfo(taker, {});

	return res.status(200).json({
		success: true,
		description: `Deleted stored card info.`,
		body: {},
	});
});

export default router;
