import type { MONGO_NotificationDocument, NotificationBody } from "tachi-common";
import type { Notification } from "tachi-db";

import { ISO8601ToUnixMilliseconds } from "#utils/time";

export function ToNotificationDocument(row: Notification): MONGO_NotificationDocument {
	const body = row.payload as NotificationBody;

	return {
		title: row.title,
		notifID: row.row_id,
		sentTo: row.sent_to,
		sentAt: ISO8601ToUnixMilliseconds(row.sent_at),
		read: row.read,
		body,
	};
}
