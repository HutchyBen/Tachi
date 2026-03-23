import { type RequestingUser } from "#slash-commands/types";
import { log } from "#utils/log";
import { type CommandInteraction, MessageEmbed } from "discord.js";

import { SLASH_COMMANDS } from "../slash-commands/commands";

/**
 * Handles incoming command requests by resolving the interaction to the command
 * it refers to, and calling it.
 *
 * @param interaction - The interaction the user made. This contains things like what
 * command they called and with what arguments.
 * @param requestingUser - The user who interacted with this command.
 */
export async function handleIsCommand(
	interaction: CommandInteraction,
	requestingUser: RequestingUser,
) {
	try {
		const command = SLASH_COMMANDS.get(interaction.commandName);

		if (!command) {
			throw new Error(`A command was requested that does not exist.`);
		}

		await interaction.deferReply();

		log.debug(`Running ${command.info.name} interaction.`);
		try {
			const response = await command.exec(interaction, requestingUser);

			if (response instanceof MessageEmbed) {
				await interaction.editReply({ embeds: [response] });
			} else if (response !== null) {
				await interaction.editReply(response);
			} else {
				await interaction.editReply({
					content: "Done!",
				});
			}
		} catch (err) {
			log.error({ command, err }, `An error occured while executing a command.`);

			void interaction.editReply(
				`An error has occured while executing this command (${err}). This has been reported.`,
			);
		}
	} catch (e) {
		log.error({ error: e }, "Failed to handle isCommand interaction");
	}
}
