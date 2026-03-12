import type { integer } from "tachi-common";

import { log } from "#utils/log.js";

import type { DiscordUserMapDocument } from "./documents";

import db from "./mongo";


export function GetUserAndTokenForDiscordID(
	discordID: string,
): Promise<DiscordUserMapDocument | null> {
	log.debug(`Fetching linked user & token with DiscordID: ${discordID}.`);

	return db.discordUserMap.findOne({ discordID });
}

export async function GetUserIDForDiscordID(discordID: string): Promise<integer | null> {
	log.debug(`Fetching linked user & token with DiscordID: ${discordID}.`);

	const user = await db.discordUserMap.findOne({ discordID }, { projection: { userID: 1 } });

	if (!user) {
		return null;
	}

	return user.userID;
}
