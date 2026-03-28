import { SELECT_SESSION_CALENDAR, ToSessionCalendarDocument } from "#lib/db-formats/session";
import DB from "#services/pg/db";
import { GetUser } from "#utils/req-tachi-data";
import { Router } from "express";

const router: Router = Router({ mergeParams: true });

/**
 * Returns all sessions, FOR ALL GPTs
 * but with unecessary properties removed so as to reduce
 * bandwidth. This is used for the calendar view in tachi-client, hence the name.
 *
 * @name GET /api/v1/users/:userID/sessions/calendar
 */
router.get("/calendar", async (req, res) => {
	const user = GetUser(req);

	const rows = await DB.selectFrom("session")
		.select(SELECT_SESSION_CALENDAR)
		.where("user_id", "=", user.id)
		.execute();

	const sessions = rows.map(ToSessionCalendarDocument);

	return res.status(200).json({
		success: true,
		description: `Found ${sessions.length} events.`,
		body: sessions,
	});
});

export default router;
