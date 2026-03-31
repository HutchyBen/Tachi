import { ACTION_PatchUGPTSettings } from "#actions/patch-ugpt-settings";
import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { GetUGPTSettingsDocument } from "#lib/db-formats/ugpt-settings";
import { RequirePermissions } from "#server/middleware/auth";
import { FormatPrError, optNull } from "#utils/prudence";
import { GetUGPT } from "#utils/req-tachi-data";
import { FormatUserDoc, GetUserWithIDGuaranteed } from "#utils/user";
import { Router } from "express";
import { p } from "prudence";
import {
	GetGamePTConfig,
	GetScoreMetrics,
	type MONGO_UGPTSettingsDocument,
	PrudenceZodShim,
} from "tachi-common";

import { RequireAuthedAsUser } from "../../../../middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Update your settings.
 *
 * @param - See the prudence validation.
 *
 * @name PATCH /api/v1/users/:userID/games/:game/:playtype/settings
 */
router.patch(
	"/",
	RequireAuthedAsUser,
	RequirePermissions("customise_profile"),
	async (req, res) => {
		const { user, game, playtype } = GetUGPT(req);

		const gptConfig = GetGamePTConfig(game, playtype);

		const gameSpecificSchema = PrudenceZodShim(gptConfig.preferences);

		const err = p(req.safeBody, {
			preferredScoreAlg: p.optional(
				p.nullable(p.isIn(Object.keys(gptConfig.scoreRatingAlgs))),
			),
			preferredSessionAlg: p.optional(
				p.nullable(p.isIn(Object.keys(gptConfig.sessionRatingAlgs))),
			),
			preferredProfileAlg: p.optional(
				p.nullable(p.isIn(Object.keys(gptConfig.profileRatingAlgs))),
			),
			defaultTable: "*?string",
			preferredRanking: optNull(p.isIn("global", "rival")),

			gameSpecific: optNull(gameSpecificSchema),
			preferredDefaultEnum: optNull(p.isIn(...GetScoreMetrics(gptConfig, "ENUM"))),
		});

		if (err) {
			return res.status(400).json({
				success: false,
				description: FormatPrError(err, "Invalid game-settings."),
			});
		}

		const body = req.safeBody as Partial<MONGO_UGPTSettingsDocument["preferences"]>;

		const authUserID = req[SYMBOL_TACHI_API_AUTH].userID;

		if (authUserID === null) {
			return res.status(401).json({
				success: false,
				description: "Authentication is required for this endpoint.",
			});
		}

		const authedUser = await GetUserWithIDGuaranteed(authUserID);
		const taker = { ip: req.ip, acct: { id: authedUser.id, username: authedUser.username } };

		const { settings } = await ACTION_PatchUGPTSettings(taker, {
			userID: user.id,
			game,
			playtype,
			preferences: body,
		});

		const description =
			Object.keys(body).length === 0
				? "Nothing has been modified, successfully."
				: "Updated settings.";

		return res.status(200).json({
			success: true,
			description,
			body: settings,
		});
	},
);

/**
 * Returns this user's settings.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/settings
 */
router.get("/", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const settings = await GetUGPTSettingsDocument(user.id, game, playtype);

	return res.status(200).json({
		success: true,
		description: `Returned ${FormatUserDoc(user)}'s settings.`,
		body: settings,
	});
});

export default router;
