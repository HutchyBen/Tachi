import type { GameGroup, integer, TachiServerCoreConfig } from "tachi-common";

import { config } from "dotenv";
import { p } from "prudence";

import { IsRecord } from "./utils/predicates";
import { FormatPrError } from "./utils/prudence";

// Initialise .env.
config();

// the real log tries to bind to discord, and is dependent on the options
// below.
const log = console;

export interface BotConfig {
	TACHI_SERVER_LOCATION: string;
	HTTP_SERVER: {
		URL: string;
	};
	OAUTH: {
		CLIENT_ID: string;
		CLIENT_SECRET: string;
	};
	DISCORD: {
		ADMIN_USERS: Array<string>;
		APPROVED_ROLE?: string;
		GAME_CHANNELS: Partial<Record<GameGroup, string>>;
		LIMBO_CHANNEL?: string;
		SERVER_ID: string;
		TOKEN: string;
	};
}

function ParseGameChannels(raw: string | undefined): Partial<Record<GameGroup, string>> {
	if (!raw) {
		return {};
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new Error(`DISCORD_GAME_CHANNELS is not valid JSON: ${err}`);
	}

	if (!IsRecord(parsed)) {
		throw new Error(
			"DISCORD_GAME_CHANNELS must be a JSON object mapping game names to channel IDs.",
		);
	}

	for (const [key, value] of Object.entries(parsed)) {
		if (typeof value !== "string") {
			throw new Error(
				`DISCORD_GAME_CHANNELS: invalid value for key ${key}. Expected a string channel ID.`,
			);
		}
	}

	return parsed as Partial<Record<GameGroup, string>>;
}

function ParseBotConfig(): BotConfig {
	const err = p(
		process.env,
		{
			TACHI_SERVER_LOCATION: "string",
			HTTP_SERVER_URL: "string",
			OAUTH_CLIENT_ID: "string",
			OAUTH_CLIENT_SECRET: "string",
			DISCORD_TOKEN: "string",
			DISCORD_SERVER_ID: "string",
			DISCORD_GAME_CHANNELS: "*string",
			DISCORD_ADMIN_USERS: "*string",
			DISCORD_APPROVED_ROLE: "*string",
			DISCORD_LIMBO_CHANNEL: "*string",
		},
		{},
		{ allowExcessKeys: true },
	);

	if (err) {
		log.error(FormatPrError(err, "Invalid environment. Cannot safely boot."));
		throw err;
	}

	const gameChannels = ParseGameChannels(process.env.DISCORD_GAME_CHANNELS);

	const adminUsers = process.env.DISCORD_ADMIN_USERS
		? process.env.DISCORD_ADMIN_USERS.split(",").filter(Boolean)
		: [];

	return {
		TACHI_SERVER_LOCATION: process.env.TACHI_SERVER_LOCATION!,
		HTTP_SERVER: {
			URL: process.env.HTTP_SERVER_URL!,
		},
		OAUTH: {
			CLIENT_ID: process.env.OAUTH_CLIENT_ID!,
			CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET!,
		},
		DISCORD: {
			TOKEN: process.env.DISCORD_TOKEN!,
			SERVER_ID: process.env.DISCORD_SERVER_ID!,
			GAME_CHANNELS: gameChannels,
			ADMIN_USERS: adminUsers,
			APPROVED_ROLE: process.env.DISCORD_APPROVED_ROLE,
			LIMBO_CHANNEL: process.env.DISCORD_LIMBO_CHANNEL,
		},
	};
}

export interface ProcessEnvironment {
	NODE_ENV: "dev" | "production" | "staging" | "test";
	POSTGRES_URL: string;
	PORT: integer;
}

function ParseEnvVars() {
	const err = p(
		process.env,
		{
			NODE_ENV: p.isIn("production", "dev", "staging", "test"),

			// mei implicitly reads this.
			LOG_LEVEL: p.optional(
				p.isIn("debug", "verbose", "info", "warn", "error", "severe", "crit"),
			),
			POSTGRES_URL: "string",
			PORT: (self) =>
				p.isPositiveInteger(Number(self)) === true ||
				"Should be a string representing a whole integer port.",
		},
		{},
		{ allowExcessKeys: true },
	);

	if (err) {
		log.error(FormatPrError(err, "Invalid environment. Cannot safely boot."));

		throw err;
	}

	return {
		NODE_ENV: process.env.NODE_ENV,
		POSTGRES_URL: process.env.POSTGRES_URL,
		PORT: Number(process.env.PORT),
	} as ProcessEnvironment;
}

export const BotConfig: BotConfig = ParseBotConfig();

// The Tachi Server exports all of the information about it. This saves us having to
// sync more metadata across instances.
async function GetServerConfig() {
	// Yes, I know synchronous fetch is disgusting. However, we can't do anything until
	// this fetch is complete, and it saves us having to do a singleton pattern or worse.
	// This *should* be solved with top-level-await, but good luck actually getting
	// typescript to output the right stuff here.

	const res = await fetch(`${BotConfig.TACHI_SERVER_LOCATION}/api/v1/config`).then((res) =>
		res.json(),
	);

	if (!res.success) {
		log.error(
			`Failed to fetch server info from ${BotConfig.TACHI_SERVER_LOCATION}. Can't run.`,
		);
		process.exit(1);
	}

	return res.body as TachiServerCoreConfig;
}

export const ServerConfig = await GetServerConfig();

export const Env = ParseEnvVars();

// General warnings for config misuse.
// This warns people if their parent server supports games that they aren't acknowledging.
for (const game of ServerConfig.GAMES) {
	if (!Object.prototype.hasOwnProperty.call(BotConfig.DISCORD.GAME_CHANNELS, game)) {
		log.warn(
			`${ServerConfig.NAME} declares support for ${game}, but no channel is mapped to it. Set DISCORD_GAME_CHANNELS to include it.`,
		);
	}
}
