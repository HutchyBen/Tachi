import type { SlashCommandStringOption } from "@discordjs/builders";

import { FormatGame, GetGameGroupConfig } from "tachi-common";

import { ServerConfig } from "../config";

/**
 * Game options. Frequently used by things that might need
 * game specific listening.
 */
const GameChoices: Array<[string, string]> = [];

for (const gameGroup of ServerConfig.GAME_GROUPS) {
	const gameGroupConfig = GetGameGroupConfig(gameGroup);

	for (const game of gameGroupConfig.games) {
		GameChoices.push([FormatGame(game), game]);
	}
}

export const GameOptions = (str: SlashCommandStringOption) =>
	str.setName("game").setDescription("Pick the relevant game.").addChoices(GameChoices);

export function MakeRequired(fn: (str: SlashCommandStringOption) => SlashCommandStringOption) {
	return (str: SlashCommandStringOption) => fn(str).setRequired(true);
}

export const OtherUserOption = (str: SlashCommandStringOption) =>
	str.setName("other_user").setDescription("Optionally, check this info out for another user.");
