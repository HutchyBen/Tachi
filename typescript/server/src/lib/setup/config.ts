import JSON5 from "json5";
import { allSupportedGameGroups, type GameGroup , type ImportTypes } from "tachi-common";
import { allImportTypes } from "tachi-common/constants/import-types";
import { z } from "zod";

// stub - having a real logger here creates a circular dependency.
const logger = console;

const rawConf = process.env.TCHIS_CONF;

if (!rawConf) {
	logger.error("TCHIS_CONF environment variable is not set. Terminating.");
	process.exit(1);
}

let config: unknown;

try {
	config = JSON5.parse(rawConf);
} catch (err) {
	logger.error("Failed to parse TCHIS_CONF as JSON5.", { err });
	process.exit(1);
}

const oauth2Schema = z.object({
	CLIENT_ID: z.string(),
	CLIENT_SECRET: z.string(),
	REDIRECT_URI: z.string(),
});

const cgConfigSchema = z.object({
	API_KEY: z.string(),
	URL: z.string(),
});

const configSchema = z.object({
	MONGO_DATABASE_NAME: z.string(),
	CAPTCHA_SECRET_KEY: z.string(),
	SESSION_SECRET: z.string(),
	FLO_API_URL: z.url().optional(),
	EAG_API_URL: z.url().optional(),
	MIN_API_URL: z.url().optional(),
	ARC_API_URL: z.url().optional(),
	MYT_API_HOST: z.string().optional(),

	CG_DEV_CONFIG: cgConfigSchema.optional(),
	CG_NAG_CONFIG: cgConfigSchema.optional(),
	CG_GAN_CONFIG: cgConfigSchema.optional(),

	FLO_OAUTH2_INFO: oauth2Schema.optional(),
	EAG_OAUTH2_INFO: oauth2Schema.optional(),
	MIN_OAUTH2_INFO: oauth2Schema.optional(),
	ARC_AUTH_TOKEN: z.string().optional(),
	MYT_AUTH_TOKEN: z.string().optional(),
	ENABLE_SERVER_HTTPS: z.boolean().optional(),
	CLIENT_DEV_SERVER: z.string().nullable().optional(),
	RATE_LIMIT: z.number().int().positive().default(500),
	OAUTH_CLIENT_CAP: z.number().int().positive().default(15),
	OPTIONS_ALWAYS_SUCCEEDS: z.boolean().optional(),
	USE_EXTERNAL_SCORE_IMPORT_WORKER: z.boolean().default(false),
	EXTERNAL_SCORE_IMPORT_WORKER_CONCURRENCY: z.number().int().positive().optional(),
	ALLOW_RUNNING_OFFLINE: z.boolean().optional(),
	ENABLE_METRICS: z.boolean().default(false),
	EMAIL_CONFIG: z
		.object({
			FROM: z.string(),
			// Nodemailer does not export the DKIM type properly, so we accept any object.
			DKIM: z.any().optional(),
			// The actual content is just a wacky options object — not worth asserting precisely.
			TRANSPORT_OPS: z.any().optional(),
		})
		.optional(),
	USC_QUEUE_SIZE: z.number().int().gte(2).default(3),
	BEATORAJA_QUEUE_SIZE: z.number().int().gte(2).default(3),
	MAX_GOAL_SUBSCRIPTIONS: z.number().int().positive().default(1_000),
	MAX_QUEST_SUBSCRIPTIONS: z.number().int().positive().default(100),
	MAX_FOLLOWING_AMOUNT: z.number().int().positive().default(1_000),
	MAX_RIVALS: z.number().int().positive().default(5),
	OUR_URL: z.string().refine((s) => !s.endsWith("/"), {
		message: "OUR_URL must not end with a trailing slash.",
	}),
	INVITE_CODE_CONFIG: z
		.object({
			BATCH_SIZE: z.number().int().positive(),
			INVITE_CAP: z.number().int().positive(),
			BETA_USER_BONUS: z.number().int().positive(),
		})
		.optional(),
	TACHI_CONFIG: z.object({
		NAME: z.string(),
		TYPE: z.enum(["kamai", "boku", "omni"]),
		GAMES: z.array(z.enum(allSupportedGameGroups as [GameGroup, ...GameGroup[]])),
		IMPORT_TYPES: z.array(z.enum(allImportTypes as [ImportTypes, ...ImportTypes[]])),
		SIGNUPS_ENABLED: z.boolean().default(true),
	}),
	CDN_CONFIG: z.object({
		WEB_LOCATION: z.string(),
		SAVE_LOCATION: z.union([
			z.object({
				TYPE: z.literal("LOCAL_FILESYSTEM"),
				SERVE_OWN_CDN: z.boolean().optional(),
				LOCATION: z.string(),
			}),
			z.object({
				TYPE: z.literal("S3_BUCKET"),
				ENDPOINT: z.string(),
				ACCESS_KEY_ID: z.string(),
				SECRET_ACCESS_KEY: z.string(),
				BUCKET: z.string(),
				KEY_PREFIX: z.string().optional(),
				REGION: z.string().optional(),
			}),
		]),
	}),
	SEEDS_CONFIG: z
		.union([
			z.object({
				TYPE: z.literal("GIT_REPO"),
				REPO_URL: z.string(),
				USER_NAME: z.string().nullable(),
				USER_EMAIL: z.string().nullable(),
				BRANCH: z.string().optional(),
			}),
			z.object({
				TYPE: z.literal("LOCAL_FILES"),
				PATH: z.string(),
			}),
		])
		.optional(),
});

export type OAuth2Info = z.infer<typeof oauth2Schema>;
export type CGConfig = z.infer<typeof cgConfigSchema>;
export type TachiServerConfig = z.infer<typeof configSchema>;

const result = configSchema.safeParse(config);

if (!result.success) {
	throw new Error(`Invalid TCHIS_CONF: ${result.error.message}`);
}

export const TachiConfig = result.data.TACHI_CONFIG;
export const ServerConfig: TachiServerConfig = result.data;

// Environment Variable Validation

let PORT = Number(process.env.PORT);

if (Number.isNaN(PORT) && process.env.IS_SERVER) {
	logger.warn(`No/invalid PORT specified in environment, defaulting to 8080.`);
	PORT = 8080;
}

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
	// n.b. These logs should be critical level, but the logger cant actually instantiate
	// itself in this file, because this file also controlls the logger. Ouch!
	logger.error(`No REDIS_URL specified in environment. Terminating.`);
	process.exit(1);
}

const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
	logger.error(`No MONGO_URL specified in environment. Terminating.`);
	process.exit(1);
}

const NODE_ENV = process.env.NODE_ENV;

if (!NODE_ENV) {
	logger.error(`No NODE_ENV specified in environment. Terminating.`);
	process.exit(1);
}

if (!["dev", "production", "staging", "test"].includes(NODE_ENV)) {
	logger.error(
		`Invalid NODE_ENV set in environment. Expected dev, production, test or staging. Got ${NODE_ENV}.`,
	);
	process.exit(1);
}

// if (bms XOR pms) is enabled
if (TachiConfig.GAMES.includes("bms") !== TachiConfig.GAMES.includes("pms")) {
	logger.error(
		`BMS and PMS MUST be enabled at the same time, due to how the beatoraja IR works.`,
	);

	process.exit(1);
}

const logLevel = process.env.LOG_LEVEL ?? "info";

if (!["crit", "debug", "error", "info", "severe", "verbose", "warn"].includes(logLevel)) {
	logger.error(`Invalid LOG_LEVEL of ${logLevel}.`);

	process.exit(1);
}


const POSTGRES_URL = process.env.POSTGRES_URL ?? "";

if (!POSTGRES_URL) {
	logger.error(`No POSTGRES_URL specified in environment. Terminating.`);
	process.exit(1);
}

// Typed variant of process.env
export const Env = {
	PORT,
	REDIS_URL,
	MONGO_URL,
	POSTGRES_URL,
	NODE_ENV: NODE_ENV as "dev" | "production" | "staging" | "test",
	COMMIT_HASH: process.env.COMMIT_HASH,
	LOG_LEVEL: logLevel as "crit" | "debug" | "error" | "info" | "severe" | "verbose" | "warn",
};
