import { ACTION_DeleteAllNotifications } from "#actions/delete-all-notifications.js";
import { ACTION_MarkAllNotificationsRead } from "#actions/mark-all-notifications-read.js";
import DB from "#services/pg/db";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";

import { RequireSelfRequestFromUser } from "../middleware";

const router: Router = Router({ mergeParams: true });

// Notifications aren't really for anyone else to interact with. Only the requesting user
// should be able to see their notifications.
router.use(RequireSelfRequestFromUser);

/**
 * Return all of this user's notifications, this is sorted on most recently sent first.
 *
 * @name GET /api/v1/users/:userID/notifications
 */
router.get("/", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const notifs = await DB.selectFrom("notification")
		.selectAll()
		.where("sent_to", "=", user.id)
		.orderBy("sent_at", "desc")
		.execute();

	return res.status(200).json({
		success: true,
		description: `Found ${notifs.length} notifications.`,
		body: notifs,
	});
});

/**
 * Mark all notifications in this user's inbox as read.
 *
 * @name POST /api/v1/users/:userID/notifications/mark-all-read
 */
router.post("/mark-all-read", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const { markedCount } = await ACTION_MarkAllNotificationsRead(
		{
			acct: {
				id: user.id,
				username: user.username,
			},
			ip: req.ip,
		},
		{},
	);

	return res.status(200).json({
		success: true,
		description: `Marked ${markedCount} notifications as read.`,
		body: {},
	});
});

/**
 * Clear all notifications from your inbox.
 *
 * @name POST /api/v1/users/:userID/notifications/delete-all
 */
router.post("/delete-all", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const { deletedCount } = await ACTION_DeleteAllNotifications(
		{
			acct: {
				id: user.id,
				username: user.username,
			},
			ip: req.ip,
		},
		{},
	);

	return res.status(200).json({
		success: true,
		description: `Deleted ${deletedCount} notification(s).`,
		body: {},
	});
});

export default router;
