import { ACTION_ChangeBanner } from "#actions/change-banner.js";
import { ACTION_DeleteBanner } from "#actions/delete-banner.js";
import { CDNRedirect } from "#lib/cdn/cdn";
import { GetProfileBannerURL } from "#lib/cdn/url-format";
import { ONE_MEGABYTE } from "#lib/constants/filesize";
import { RequirePermissions } from "#server/middleware/auth";
import { CreateMulterSingleUploadMiddleware } from "#server/middleware/multer-upload";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";

import { RequireAuthedAsUser } from "../middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Sets a profile banner.
 *
 * @param banner - A JPG, PNG or GIF file less than 1mb.
 * @note although GIFs are supported, this functionality isn't documented on the site.
 * this is kind of an easter egg.
 *
 * @name PUT /api/v1/users/:userID/banner
 */
router.put(
	"/",
	RequireAuthedAsUser,
	RequirePermissions("customise_profile"),
	CreateMulterSingleUploadMiddleware("banner", ONE_MEGABYTE),
	async (req, res) => {
		const user = GetTachiData(req, "requestedUser");

		if (!req.file) {
			return res.status(400).json({
				success: false,
				description: `No file provided.`,
			});
		}

		const { contentHash } = await ACTION_ChangeBanner(
			{
				acct: {
					id: user.id,
					username: user.username,
				},
				ip: req.ip,
			},
			{
				"!fileBuffer": req.file.buffer,
				fileMimetype: req.file.mimetype,
			},
		);

		if (req.session.tachi?.user) {
			req.session.tachi.user.customBannerLocation = contentHash;
		}

		return res.status(200).json({
			success: true,
			description: `Stored profile banner.`,
			body: {
				get: req.originalUrl,
			},
		});
	},
);

/**
 * Returns this user's profile banner. If the user does not have a custom profile banner,
 * return the default profile banner.
 *
 * @name GET /api/v1/users/:userID/banner
 */
router.get("/", (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	if (!user.customBannerLocation) {
		res.setHeader("Content-Type", "image/png");
		CDNRedirect(res, "/users/default/banner");
		return;
	}

	// express sniffs whether this is a png or jpg **and** browsers dont care either.
	CDNRedirect(res, GetProfileBannerURL(user.id, user.customBannerLocation));
});

/**
 * Deletes this user's profile banner, and go back to the default profile banner.
 *
 * @name DELETE /api/v1/users/:userID/banner
 */
router.delete(
	"/",
	RequireAuthedAsUser,
	RequirePermissions("customise_profile"),
	async (req, res) => {
		const user = GetTachiData(req, "requestedUser");

		await ACTION_DeleteBanner(
			{
				acct: {
					id: user.id,
					username: user.username,
				},
				ip: req.ip,
			},
			{},
		);

		if (req.session.tachi?.user) {
			req.session.tachi.user.customBannerLocation = null;
		}

		return res.status(200).json({
			success: true,
			description: `Removed custom profile banner.`,
			body: {},
		});
	},
);

export default router;
