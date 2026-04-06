import { RequireLocalDevelopment } from "#server/middleware/type-require";
import DB from "#services/pg/db";
import { GetFirstAdmin } from "#utils/user";
import { Router } from "express";

/**
 * Local development helpers (also enabled in NODE_ENV=test). Not available in production.
 */
const router: Router = Router({ mergeParams: true });

router.use(RequireLocalDevelopment);

/**
 * Reports whether the database has any rows in the `song` table (seed data).
 *
 * @name GET /api/v1/localdev/song-seed-status
 */
router.get("/song-seed-status", async (_req, res) => {
	const row = await DB.selectFrom("song")
		.select((eb) => eb.fn.countAll().as("count"))
		.executeTakeFirst();

	const songCount = Number(row?.count ?? 0);

	return res.status(200).json({
		success: true,
		description: "Song seed status retrieved.",
		body: {
			missingSongSeeds: songCount === 0,
		},
	});
});

/**
 * Username of the lowest-ID admin (same as {@link GetFirstAdmin}) and the dev default
 * password for the quick-login button on the login page.
 *
 * @name GET /api/v1/localdev/first-admin-login
 */
router.get("/first-admin-login", async (_req, res) => {
	try {
		const admin = await GetFirstAdmin();
		return res.status(200).json({
			success: true,
			description: "First admin login hint retrieved.",
			body: {
				username: admin.username,
				password: "password",
			},
		});
	} catch {
		return res.status(200).json({
			success: false,
			description: "No admin account exists on this instance.",
		});
	}
});

export default router;
