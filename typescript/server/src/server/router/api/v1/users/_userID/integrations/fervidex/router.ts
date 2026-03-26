import { ACTION_UpdateFervidexSettings } from "#actions/update-fervidex-settings.js";
import { SELECT_FER_SETTINGS, ToFervidexSettingsDocument } from "#lib/db-formats/fervidex-settings";
import prValidate from "#server/middleware/prudence-validate";
import { RequireKamaitachi } from "#server/middleware/type-require";
import DB from "#services/pg/db";
import { optNull } from "#utils/prudence";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";

import { RequireSelfRequestFromUser } from "../../middleware";

const router: Router = Router({ mergeParams: true });

router.use(RequireKamaitachi);
router.use(RequireSelfRequestFromUser);

/**
 * Retrieve your fervidex settings.
 *
 * @name GET /api/v1/users/:userID/integrations/fervidex/settings
 */
router.get("/settings", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const row = await DB.selectFrom("svc_fer_settings")
		.select(SELECT_FER_SETTINGS)
		.where("user_id", "=", user.id)
		.executeTakeFirst();

	if (!row) {
		return res.status(200).json({
			success: true,
			description: `Retrieved Fervidex settings.`,
			body: null,
		});
	}

	const cardRows = await DB.selectFrom("priv_svc_fer_card")
		.select(["priv_svc_fer_card.card_id"])
		.where("user_id", "=", user.id)
		.execute();

	const cards = cardRows.length > 0 ? cardRows.map((r) => r.card_id) : null;

	return res.status(200).json({
		success: true,
		description: `Retrieved Fervidex settings.`,
		body: ToFervidexSettingsDocument(row, cards),
	});
});

/**
 * Update your fervidex configuration.
 *
 * @param cards - An array of card IDs to use as a whitelist, or null to disable filtering.
 * @param forceStaticImport - Whether to force a static import on non-INF2 clients.
 *
 * @name PATCH /api/v1/users/:userID/integrations/fervidex/settings
 */
router.patch(
	"/settings",
	prValidate({ cards: optNull(["string"]), forceStaticImport: "*?boolean" }),
	async (req, res) => {
		const body = req.safeBody as {
			cards?: Array<string> | null;
			forceStaticImport?: boolean | null;
		};

		const hasCards = body.cards !== undefined;
		const hasForceStaticImport = typeof body.forceStaticImport === "boolean";

		if (!hasCards && !hasForceStaticImport) {
			return res.status(400).json({
				success: false,
				description: `No modifications sent.`,
			});
		}

		if (body.cards !== null && body.cards !== undefined && body.cards.length > 6) {
			return res.status(400).json({
				success: false,
				description: `You cannot have more than 6 card filters at once.`,
			});
		}

		const user = GetTachiData(req, "requestedUser");
		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		const result = await ACTION_UpdateFervidexSettings(taker, {
			cards: body.cards,
			forceStaticImport: hasForceStaticImport
				? (body.forceStaticImport as boolean)
				: undefined,
		});

		return res.status(200).json({
			success: true,
			description: `Successfully updated settings.`,
			body: result,
		});
	},
);

export default router;
