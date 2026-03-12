import { Env, TachiConfig } from "#lib/setup/config";
import { EscapeStringRegexp } from "#utils/misc";
import SafeJSONStringify from "safe-json-stringify";
import winston, { format, type LeveledLogMethod, type Logger, transports } from "winston";

export type KtLogger = { severe: LeveledLogMethod } & Logger;

const level = process.env.LOG_LEVEL;

const formatExcessProperties = (meta: Record<string, unknown>, limit = false) => {
	let i = 0;

	for (const [key, val] of Object.entries(meta)) {
		// this is probably fine
		if (val instanceof Error) {
			meta[key] = { message: val.message, stack: val.stack };
		}

		i++;
	}

	if (!i) {
		return "";
	}

	const content = SafeJSONStringify(meta);

	return ` ${limit ? StrCap(content) : content}`;
};

function StrCap(string: string) {
	if (string.length > 300) {
		return `${string.slice(0, 297)}...`;
	}

	return string;
}

const formatExcessPropertiesNoStack = (
	meta: Record<string, unknown>,
	omitKeys: Array<string> = [],
	limit = false,
) => {
	const realMeta: Record<string, unknown> = {};

	for (const [key, val] of Object.entries(meta)) {
		if (omitKeys.includes(key)) {
			continue;
		}

		// this is probably fine
		if (val instanceof Error) {
			realMeta[key] = { message: val.message };
		} else if (!key.startsWith("__") && !key.startsWith("!")) {
			realMeta[key] = val;
		}
	}

	if (Object.keys(realMeta).length === 0) {
		return "";
	}

	const content = SafeJSONStringify(realMeta);

	return ` ${limit ? StrCap(content) : content}`;
};

const tachiPrintf = format.printf(
	({ level, message, context = "tachi-root", timestamp, ...meta }) =>
		`${timestamp} [${
			Array.isArray(context) ? context.join(" | ") : context
		}] ${level}: ${message}${formatExcessProperties(meta)}`,
);

const tachiConsolePrintf = format.printf(
	({ level, message, context = "tachi-root", timestamp, hideFromConsole, ...meta }) =>
		`${timestamp} [${
			Array.isArray(context) ? context.join(" | ") : context
		}] ${level}: ${message}${formatExcessPropertiesNoStack(
			meta,
			hideFromConsole as Array<string>,
			true,
		)}`,
);

winston.addColors({
	crit: ["bgRed", "black"],
	severe: ["bgBrightRed", "black"],
	error: ["red"],
	warn: ["yellow"],
	info: ["cyan"],
	verbose: ["white"],
	debug: ["white"],
});

const baseFormatRoute = format.combine(
	format.timestamp({
		format: "YYYY-MM-DD HH:mm:ss",
	}),
);

const defaultFormatRoute = format.combine(
	baseFormatRoute,
	format.errors({ stack: false }),
	tachiPrintf,
);

const consoleFormatRoute = format.combine(
	baseFormatRoute,
	format.errors({ stack: false }),
	tachiConsolePrintf,
	format.colorize({
		all: true,
	}),
);

const tports: Array<winston.transport> = [
	new transports.Console({
		format: consoleFormatRoute,
	}),
];


export const rootLogger = winston.createLogger({
	levels: {
		// entire process termination is necessary
		crit: 0,

		// something is wrong, and more than one function is affected (such as a failed assertion that is definitely expected to be true).
		severe: 1,

		// function call (or related process) has failed unexpectedly
		error: 2,

		// function call has hit something it didn't want, but can recover
		warn: 3,

		// something has happened that is expected, but worth logging
		info: 4,

		// something has happened
		verbose: 5,

		// glorified console.log debugging
		debug: 6,
	},
	level,
	format: defaultFormatRoute,
	transports: tports,
	defaultMeta: {
		__ServerName: TachiConfig.NAME,
		__Worker: !!process.env.IS_WORKER,
	},
}) as KtLogger;

function CreateLogCtx(filename: string, lg = rootLogger): KtLogger {
	const replacedFilename = filename.replace(
		new RegExp(`^${EscapeStringRegexp(process.cwd())}/((js|src)/)?`, "u"),
		"",
	);

	const logger = lg.child({
		context: [replacedFilename],
	}) as KtLogger;

	// @hack, defaultMeta isn't reactive -- won't be updated unless we do this.

	logger.defaultMeta = { ...(logger.defaultMeta ?? {}), context: [replacedFilename] };

	return logger;
}

export function AppendLogCtx(context: string, lg: KtLogger): KtLogger {
	const newContext = [...lg.defaultMeta.context, context];

	return lg.child({ context: newContext }) as KtLogger;
}

export function ChangeRootLogLevel(
	level: "crit" | "debug" | "error" | "info" | "severe" | "verbose" | "warn",
) {
	rootLogger.info(`Changing log level to ${level}.`);

	for (const tp of rootLogger.transports) {
		tp.level = level;
	}
}

export function GetLogLevel() {
	return (
		rootLogger.transports.map((e) => e.level).find((e) => typeof e === "string") ??
		Env.LOG_LEVEL
	);
}

export const Transports = rootLogger.transports;

export default CreateLogCtx;
