import type { CommandInteraction } from "discord.js";
import type { PrivDiscordUserMap } from "tachi-db";

import { IsValidGame, type UserDocument, type V3Game } from "tachi-common";

import type { Emittable } from "../slash-commands/types";

import { GetUserInfo } from "./api-requests";

/**
 * Utility parser for getting the game and requesting user, since this is
 * a common pattern in the bot.
 */
export async function GetGameAndUser(
	interaction: CommandInteraction,
	requestingUser: PrivDiscordUserMap,
): Promise<
	{ content: { game: V3Game; userDoc: UserDocument }; error: null } | { error: Emittable }
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

	const game = interaction.options.getString("game", true);

	if (!IsValidGame(game)) {
		return { error: `Invalid game: ${game}.` };
	}

	return { error: null, content: { userDoc, game } };
}
