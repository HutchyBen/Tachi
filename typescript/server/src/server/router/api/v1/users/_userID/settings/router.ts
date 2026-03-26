import { ACTION_UpdateUserSettings } from "#actions/update-user-settings";
import prValidate from "#server/middleware/prudence-validate";
import { GetTachiData } from "#utils/req-tachi-data";
import { GetSettingsForUser } from "#utils/user";
import { Router } from "express";

import { RequireSelfRequestFromUser } from "../middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Retrieve this user's settings. Note that these settings are NOT private.
 *
 * @name GET /api/v1/users/:userID/settings
 */
router.get("/", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const settings = await GetSettingsForUser(user.id);

	return res.status(200).json({
		success: true,
		description: `Retrieved settings.`,
		body: settings,
	});
});

/**
 * Update a user's settings.
 *
 * @param invisible - Whether to set the user to invisible or not.
 * @param developerMode - Whether to display developer specific information in the WebUI.
 * @param advancedMode - Whether to display more advanced options in the WebUI.
 * @param contentiousContent - Whether to display slightly inappropriate splash messages.
 * @param deletableScores - Whether scores can be deleted.
 *
 * @name PATCH /api/v1/users/:userID/settings
 */
router.patch(
	"/",
	RequireSelfRequestFromUser,
	prValidate({
		invisible: "*boolean",
		developerMode: "*boolean",
		contentiousContent: "*boolean",
		advancedMode: "*boolean",
		deletableScores: "*boolean",
	}),
	async (req, res) => {
		const user = GetTachiData(req, "requestedUser");
		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		const body = req.safeBody as {
			advancedMode?: boolean;
			contentiousContent?: boolean;
			deletableScores?: boolean;
			developerMode?: boolean;
			invisible?: boolean;
		};

		await ACTION_UpdateUserSettings(taker, body);

		const settings = await GetSettingsForUser(user.id);

		if (req.session.tachi?.settings) {
			req.session.tachi.settings = settings;
		}

		return res.status(200).json({
			success: true,
			description: `Updated settings.`,
			body: settings,
		});
	},
);

export default router;
