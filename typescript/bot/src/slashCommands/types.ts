import type {
	CommandInteraction,
	InteractionReplyOptions,
	MessageEmbed,
	MessagePayload,
} from "discord.js";
import type { APIApplicationCommandOption } from "discord-api-types";

import type { DiscordUserMapDocument } from "../query/documents";

export type Emittable = string | InteractionReplyOptions | MessageEmbed | MessagePayload;

type Command = (
	interaction: CommandInteraction,
	requestingUser: DiscordUserMapDocument,
) => Emittable | Promise<Emittable | null>;

export interface SlashCommand {
	info: {
		description: string;
		name: string;
		options: Array<APIApplicationCommandOption>;
	};
	exec: Command;
}
