import { ACTION_ChangePfp } from "#actions/change-pfp.js";
import { ACTION_DeletePfp } from "#actions/delete-pfp.js";
import { CDNRedirect } from "#lib/cdn/cdn";
import { GetProfilePictureURL } from "#lib/cdn/url-format";
import { ONE_MEGABYTE } from "#lib/constants/filesize";
import { log } from "#lib/log/log";
import { RequirePermissions } from "#server/middleware/auth";
import { CreateMulterSingleUploadMiddleware } from "#server/middleware/multer-upload";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";

import { RequireAuthedAsUser } from "../middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Sets a profile picture.
 *
 * @param pfp - A JPG, PNG or GIF file less than 1mb.
 * @note although GIFs are supported, this functionality isn't documented on the site.
 * this is kind of an easter egg.
 *
 * @name PUT /api/v1/users/:userID/pfp
 */
router.put(
	"/",
	RequireAuthedAsUser,
	RequirePermissions("customise_profile"),
	CreateMulterSingleUploadMiddleware("pfp", ONE_MEGABYTE),
	async (req, res) => {
		const user = GetTachiData(req, "requestedUser");

		if (!req.file) {
			return res.status(400).json({
				success: false,
				description: `No file provided.`,
			});
		}

		const { contentHash } = await ACTION_ChangePfp(
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
			req.session.tachi.user.customPfpLocation = contentHash;
		}

		return res.status(200).json({
			success: true,
			description: `Stored profile picture.`,
			body: {
				get: req.originalUrl,
			},
		});
	},
);

/**
 * Returns this user's profile picture. If the user does not have a custom profile picture,
 * return the default profile picture.
 *
 * @name GET /api/v1/users/:userID/pfp
 */
router.get("/", (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	log.debug(user, "User Info for /:userID/pfp request is ");

	if (!user.customPfpLocation) {
		res.setHeader("Content-Type", "image/png");
		CDNRedirect(res, "/users/default/pfp");
		return;
	}

	CDNRedirect(res, GetProfilePictureURL(user.id, user.customPfpLocation));
});

/**
 * Deletes this user's profile picture, and go back to the default profile picture.
 *
 * @name DELETE /api/v1/users/:userID/pfp
 */
router.delete(
	"/",
	RequireAuthedAsUser,
	RequirePermissions("customise_profile"),
	async (req, res) => {
		const user = GetTachiData(req, "requestedUser");

		await ACTION_DeletePfp(
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
			req.session.tachi.user.customPfpLocation = null;
		}

		return res.status(200).json({
			success: true,
			description: `Removed custom profile picture.`,
			body: {},
		});
	},
);

export default router;
