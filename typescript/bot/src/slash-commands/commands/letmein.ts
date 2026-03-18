import { BotConfig } from "#config";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ExpectedErr } from "bliss";
import { GuildMember } from "discord.js";

import type { SlashCommand } from "../types";

import { ACTION_Letmein } from "../../actions/letmein";

const command: SlashCommand = {
	info: new SlashCommandBuilder()
		.setName("letmein")
		.setDescription("Let yourself into the server.")
		.toJSON(),
	exec: async (interaction) => {
		if (!BotConfig.DISCORD.APPROVED_ROLE) {
			return null; // no-op
		}

		if (!(interaction.member instanceof GuildMember)) {
			return null;
		}

		try {
			await ACTION_Letmein(
				{ ip: null },
				{
					discord_user_id: interaction.user.id,
					role_id: BotConfig.DISCORD.APPROVED_ROLE,
					"!member": interaction.member,
				},
			);
		} catch (e) {
			if (ExpectedErr.is(e)) {
				return e.reason;
			}

			throw e;
		}

		return null;
	},
};

export default command;
