import { ACTION_UpdateKshookSv6cSettings } from "#actions/update-kshook-sv6c-settings.js";
import {
	SELECT_KSHOOK_SV6C_SETTINGS,
	ToKshookSv6cSettings,
} from "#lib/db-formats/kshook-sv6c-settings";
import prValidate from "#server/middleware/prudence-validate";
import { RequireKamaitachi } from "#server/middleware/type-require";
import DB from "#services/pg/db";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";

import { RequireSelfRequestFromUser } from "../../middleware";

const router: Router = Router({ mergeParams: true });

router.use(RequireKamaitachi);
router.use(RequireSelfRequestFromUser);

/**
 * Retrieve your KsHook SV6C settings.
 *
 * @name GET /api/v1/users/:userID/integrations/kshook-sv6c/settings
 */
router.get("/settings", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const row = await DB.selectFrom("svc_kshook_sv6c_settings")
		.select(SELECT_KSHOOK_SV6C_SETTINGS)
		.where("user_id", "=", user.id)
		.executeTakeFirst();

	return res.status(200).json({
		success: true,
		description: `Retrieved KsHook (S6VC) settings.`,
		body: row ? ToKshookSv6cSettings(row) : null,
	});
});

/**
 * Update your KsHook SV6C configuration.
 *
 * @param forceStaticImport - Whether or whether not to statically import data.
 *
 * @name PATCH /api/v1/users/:userID/integrations/kshook-sv6c/settings
 */
router.patch("/settings", prValidate({ forceStaticImport: "boolean" }), async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	const result = await ACTION_UpdateKshookSv6cSettings(taker, {
		forceStaticImport: req.body.forceStaticImport,
	});

	return res.status(200).json({
		success: true,
		description: `Successfully updated settings.`,
		body: { userID: user.id, ...result },
	});
});

export default router;
