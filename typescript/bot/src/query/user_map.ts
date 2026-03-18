import type { integer } from "tachi-common";

import db from "#services/pg/db";
import { log } from "#utils/log.js";
import { type PrivDiscordUserMap } from "tachi-db";

export async function GetUserAndTokenForDiscordID(
	discordID: string,
): Promise<PrivDiscordUserMap | null> {
	log.debug(`Fetching linked user & token with DiscordID: ${discordID}.`);

	const row = await db
		.selectFrom("priv_discord_user_map")
		.selectAll()
		.where("discord_id", "=", discordID)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return { user_id: row.user_id, discord_id: row.discord_id, api_token: row.api_token };
}

export async function GetUserIDForDiscordID(discordID: string): Promise<integer | null> {
	log.debug(`Fetching linked userID with DiscordID: ${discordID}.`);

	const row = await db
		.selectFrom("priv_discord_user_map")
		.select("user_id")
		.where("discord_id", "=", discordID)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return row.user_id;
}
