import type { WebhookEvents } from "tachi-common";

import { log } from "#lib/log/log.js";
import db from "#services/mongo/db";
import fetch from "#utils/fetch";

// @todo make use of aggressive caching here?
export async function GetWebhookUrlInfo() {
	const urls = await db["api-clients"].find(
		{ webhookUri: { $ne: null } },
		{ projection: { webhookUri: 1, clientSecret: 1 } },
	);

	return urls as Array<{ clientSecret: string; webhookUri: string }>;
}

/**
 * Emits a webhook event to all registered client webhooks on this tachi-server install.
 */
export async function EmitWebhookEvent(content: WebhookEvents) {
	const webhookUrls = await GetWebhookUrlInfo();

	log.debug(`Emitting webhook event ${content.type} to ${webhookUrls.length} clients.`);

	// We don't actually care about the response of these. Just fire them and forget.
	for (const client of webhookUrls) {
		// we know this to be non-null because of GetWebhookUrlInfo.
		fetch(client.webhookUri, {
			method: "POST",
			body: JSON.stringify(content),
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${client.clientSecret}`,
			},
		}).catch((err: Error) => {
			// We don't care about errors. It's probably on their end.
			log.info(err.message);
		});
	}
}
