import type { CommandInteraction } from "discord.js";

import { type GameGroup, type Playtype, type UserDocument } from "tachi-common";

import type { DiscordUserMapDocument } from "../database/documents";
import type { Emittable } from "../slashCommands/types";

import { GetUserInfo } from "./apiRequests";
import { ParseGPT } from "./misc";

/**
 * Utility parser for getting the game, playtype and requesting user, since this is
 * a common pattern in the bot.
 */
export async function GetGPTAndUser(
	interaction: CommandInteraction,
	requestingUser: DiscordUserMapDocument,
): Promise<
	| { content: { game: GameGroup; playtype: Playtype; userDoc: UserDocument }; error: null }
	| { error: Emittable }
> {
	const userID = interaction.options.getString("other_user") ?? requestingUser.userID.toString();

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
