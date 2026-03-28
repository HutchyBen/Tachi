import type { CommandInteraction } from "discord.js";
import type { PrivDiscordUserMap } from "tachi-db";

import { type GameGroup, type MONGO_UserDocument, type Playtype } from "tachi-common";

import type { Emittable } from "../slash-commands/types";

import { GetUserInfo } from "./api-requests";
import { ParseGPT } from "./misc";

/**
 * Utility parser for getting the game, playtype and requesting user, since this is
 * a common pattern in the bot.
 */
export async function GetGPTAndUser(
	interaction: CommandInteraction,
	requestingUser: PrivDiscordUserMap,
): Promise<
	| { content: { game: GameGroup; playtype: Playtype; userDoc: MONGO_UserDocument }; error: null }
	| { error: Emittable }
> {
	const userID = interaction.options.getString("other_user") ?? requestingUser.user_id.toString();

	if (!/^[a-zA-Z0-9_-]{0,20}$/u.test(userID)) {
		return { error: `Invalid userID. Can't query this!` };
	}

	let userDoc;

	try {
		userDoc = await GetUserInfo(userID);
	} catch {
		return { error: `This user does not exist.` };
	}

	const { game, playtype } = ParseGPT(interaction.options.getString("game", true));

	return { error: null, content: { userDoc, game, playtype } };
}
