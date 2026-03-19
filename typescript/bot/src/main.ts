import { log } from "#utils/log.js";
import { GetLimboChannel } from "#utils/misc";
import { Client, type CommandInteraction, Intents, type SelectMenuInteraction } from "discord.js";

import { Env, ServerConfig } from "./config";
import { handleIsCommand } from "./interaction-handlers/handle-is-command";
import { GetUserAndTokenForDiscordID } from "./query/user-map";
import { app } from "./server/server";
import { RegisterSlashCommands } from "./slash-commands/register";
import { VERSION_PRETTY } from "./version";

// hack: DiscordJS's endpoints sometimes return bigints that end up in our log.
// when our log tries to format that content, JSON.stringify fails.
//
// I personally cannot believe that the spec now made JSON.stringify fallible in such
// a common case. It's kind of absurdly ridiculous. But hey ho; monkey patch our way
// out of it.
// @ts-expect-error hack
BigInt.prototype.toJSON = function toJSON() {
	return this.toString();
};

export const client = new Client({
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_MESSAGES],
});

client.on("guildMemberAdd", async (_member) => {
	if (Env.DISCORD_APPROVED_ROLE && Env.DISCORD_LIMBO_CHANNEL) {
		const channel = GetLimboChannel(client);

		await channel.send(
			`Hello! If you already have an account on ${ServerConfig.NAME}, run \`/letmein\` in #limbo to be let in. Otherwise, ask for an invite in #limbo.`,
		);
	}
});

client.on("interactionCreate", async (interaction) => {
	try {
		if (!interaction.isSelectMenu() && !interaction.isCommand()) {
			return; // We don't deal with any of these interactions atm.
		}

		const requestingUser = await GetUserAndTokenForDiscordID(interaction.user.id);

		if (!requestingUser) {
			await RequireUserAuth(interaction);
			return;
		}

		if (interaction.isCommand()) {
			await handleIsCommand(interaction, requestingUser);
		}
	} catch (err) {
		await interaction.channel?.send(
			"We failed to handle this request. Are your DMs shut to non-friends?",
		);
		log.error({ interaction, err }, "Failed to run interaction.");
	}
});

/**
 * If a user tries to do anything without auth, Tell them to authenticate.
 */
async function RequireUserAuth(interaction: CommandInteraction | SelectMenuInteraction) {
	const oAuthLink = `${Env.TACHI_SERVER_LOCATION}/oauth/request-auth?clientID=${Env.OAUTH_CLIENT_ID}&context=${interaction.user.id}`;

	const dmChannel = await interaction.user.createDM();

	await dmChannel.send(`Click this link to authenticate with ${ServerConfig.NAME}: ${oAuthLink}`);
	return interaction.reply({
		content: `To use the bot, your discord account must be linked to ${ServerConfig.NAME}.
We've sent you a DM with instructions on how to link your account.`,
		ephemeral: true,
	});
}

void (async () => {
	try {
		log.info(`Booting Tachi Bot ${VERSION_PRETTY}.`);

		// Login to discord.
		await client.login(Env.DISCORD_TOKEN);

		log.info(`Logged in successfully to ${client.guilds.cache.size} guilds.`);

		// Mount our express server.
		app.listen(Env.PORT);

		log.info(
			`Invite URL: https://discord.com/api/oauth2/authorize?client_id=${
				client.application!.id
			}&permissions=8&scope=applications.commands%20bot`,
		);

		await RegisterSlashCommands(client);
	} catch (error) {
		log.fatal({ error }, "Failed to properly boot.");
		process.exit(1);
	}
})();

// taken from https://nodejs.org/api/process.html#process_event_unhandledrejection
// to avoid future deprecation.
process.on("unhandledRejection", (reason, promise) => {
	log.error({ promise }, reason as string);
});
