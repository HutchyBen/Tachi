import type { CGServices } from "#lib/score-import/import-types/common/api-cg/types";
import type { RequestHandler } from "express-serve-static-core";

import { ACTION_DeleteCgCardInfo } from "#actions/delete-cg-card-info.js";
import { ACTION_UpdateCgCardInfo } from "#actions/update-cg-card-info.js";
import { SELECT_CG_CARD_INFO, ToCGCardInfo } from "#lib/db-formats/cg-card-info";
import prValidate from "#server/middleware/prudence-validate";
import DB from "#services/pg/db";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";
import { p } from "prudence";

import { RequireSelfRequestFromUser } from "../../../middleware";

const router: Router = Router({ mergeParams: true });

const ValidateCGType: RequestHandler = (req, res, next) => {
	if (req.params.cgType === "dev" || req.params.cgType === "nag" || req.params.cgType === "gan") {
		next();
		return;
	}

	return res.status(404).json({
		success: false,
		description: `No such service 'cg/${req.params.cgType}' is supported.`,
	});
};

/**
 * Retrieve this user's card info (cardID).
 *
 * @name GET /api/v1/users/:userID/integrations/cg/:cgType
 */
router.get("/", ValidateCGType, RequireSelfRequestFromUser, async (req, res) => {
	const user = GetTachiData(req, "requestedUser");
	const cgType = req.params.cgType as CGServices;

	const row = await DB.selectFrom("priv_svc_cg_card_info")
		.select(SELECT_CG_CARD_INFO)
		.where("user_id", "=", user.id)
		.where("service", "=", cgType)
		.executeTakeFirst();

	if (!row) {
		return res.status(200).json({
			success: true,
			description: `User has no card info set.`,
			body: null,
		});
	}

	return res.status(200).json({
		success: true,
		description: `Found card info.`,
		body: ToCGCardInfo(row),
	});
});

/**
 * Write new card details for this CG integration.
 *
 * @name PUT /api/v1/users/:userID/integrations/cg/:cgType
 */
router.put(
	"/",
	ValidateCGType,
	RequireSelfRequestFromUser,
	prValidate(
		{
			cardID: p.regex(/^[a-zA-Z0-9]{16}$/u),
			pin: p.regex(/^[0-9]{4}$/u),
		},
		{
			cardID: "Expected 16 characters.",
			pin: "Expected 4 digits.",
		},
	),
	async (req, res) => {
		const user = GetTachiData(req, "requestedUser");
		const cgType = req.params.cgType as CGServices;

		const { cardID, pin } = req.safeBody as {
			cardID: string;
			pin: string;
		};

		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		await ACTION_UpdateCgCardInfo(taker, { service: cgType, cardID, pin });

		return res.status(200).json({
			success: true,
			description: `Updated cardID and pin.`,
			body: {},
		});
	},
);

/**
 * Unset this user's card details for this CG integration.
 *
 * @name DELETE /api/v1/users/:userID/integrations/cg/:cgType
 */
router.delete("/", ValidateCGType, RequireSelfRequestFromUser, async (req, res) => {
	const user = GetTachiData(req, "requestedUser");
	const cgType = req.params.cgType as CGServices;

	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	await ACTION_DeleteCgCardInfo(taker, { service: cgType });

	return res.status(200).json({
		success: true,
		description: `Deleted stored card info.`,
		body: {},
	});
});

export default router;
