import connectRedis from "connect-redis";
import "express-async-errors";
import express, { type Express } from "express";

import type { integer } from "tachi-common";
// THIS IMPORT **MUST** GO HERE. DO NOT MOVE IT. IT MUST OCCUR BEFORE ANYTHING HAPPENS WITH EXPRESS
// BUT AFTER EXPRESS IS IMPORTED.

import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { log } from "#lib/log/log.js";
import { Env, ServerConfig, TachiConfig } from "#lib/setup/config";
import { RedisClient } from "#services/redis/redis";
import { IsNonEmptyString, IsRecord } from "#utils/misc";
import ExpressPromBundle from "express-prom-bundle";
import expressSession from "express-session";
import helmet from "helmet";

import { RequestLoggerMiddleware } from "./middleware/request-logger";
import mainRouter from "./router/router";

let store;

if (Env.NODE_ENV !== "test") {
	log.info({ bootInfo: true }, "Connecting ExpressSession to Redis.");
	const RedisStore = connectRedis(expressSession);

	store = new RedisStore({
		host: "localhost",
		port: 6379,
		client: RedisClient,
		prefix: TachiConfig.NAME,
	});
}

const userSessionMiddleware = expressSession({
	// append node_env onto the end of the session name
	// so we can separate tokens under the same URL.
	name: `${TachiConfig.NAME.replace(/ /gu, "_")}_SESSION`,
	secret: ServerConfig.SESSION_SECRET,
	store,
	resave: true,
	saveUninitialized: false,
	cookie: {
		// the absence of Secure in combination with SameSite=None will cause issues on non-https
		// instances in newer versions of chromium. there is no workaround for this.
		secure:
			Env.NODE_ENV === "production" ||
			Env.NODE_ENV === "staging" ||
			ServerConfig.ENABLE_SERVER_HTTPS,

		// Very important. Without this, we're vulnerable to CSRF!
		sameSite: Env.NODE_ENV === "production" || Env.NODE_ENV === "staging" ? "strict" : "none",
	},
});

const app: Express = express();

if (Env.NODE_ENV !== "production" && IsNonEmptyString(ServerConfig.CLIENT_DEV_SERVER)) {
	log.warn(
		{
			bootInfo: true,
		},
		`Enabling CORS requests from ${ServerConfig.CLIENT_DEV_SERVER}.`,
	);

	// Note: we have to assign it here to make sure it doesn't get modified!
	// If we try and use ServerConfig.CLIENT_DEV_SERVER inside the callback, TS rightly
	// complains that this value might end up being mutated to null/undefined.
	//
	// Even though we don't do that,
	// we may aswell be correct about the whole thing.
	const clientDevServerLocation = ServerConfig.CLIENT_DEV_SERVER;

	// Allow CORS requests from another server (since we have our dev server hosted separately).
	app.use((req, res, next) => {
		res.header("Access-Control-Allow-Origin", clientDevServerLocation);
		res.header(
			"Access-Control-Allow-Headers",
			"Origin, X-Requested-With, Content-Type, Accept, X-User-Intent",
		);
		res.header("Access-Control-Allow-Credentials", "true");
		res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
		next();
	});

	// hack to allow all OPTIONS requests. Remember that this setting should not be on in production!
	if (ServerConfig.OPTIONS_ALWAYS_SUCCEEDS === true) {
		app.options("*", (req, res) => res.send());
	}
} else {
	app.use((req, res, next) => {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Content-Type, X-User-Intent, Authorization");
		res.header("Access-Control-Allow-Credentials", "false");
		res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
		next();
	});

	app.options("*", (req, res) => res.send());

	if (Env.NODE_ENV !== "test") {
		log.info(
			{
				bootInfo: true,
			},
			"Enabling Helmet, as no CLIENT_DEV_SERVER was set, or we are in production.",
		);
	}

	app.use(helmet());
}

if (ServerConfig.ENABLE_METRICS) {
	app.use(ExpressPromBundle({ includeMethod: true, includePath: true }));
}

app.use(userSessionMiddleware);

// Most of these options are leveraged from KTAPI

// Pass the IP of the user up our increasingly insane chain of nginx/docker nonsense
app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);

// we don't allow nesting in query strings.
app.set("query parser", "simple");

// taken from https://nodejs.org/api/process.html#process_event_unhandledrejection
// to avoid future deprecation.
process.on("unhandledRejection", (reason, promise) => {
	// @ts-expect-error reason is an error, and thelog can handle errors
	// it just refuses.
	log.error(reason, { promise });
});

// enable reading json bodies
// limit them so as not to choke the api
app.use(express.json({ limit: "4mb" }));

app.use((req, res, next) => {
	// Always mount an empty req body. We operate under the assumption that req.body is
	// always defined as atleast an object.
	if (req.method !== "GET" && (typeof req.body !== "object" || req.body === null)) {
		req.body = {};
	}

	// req.safeBody *is* just a type-safe req.body!
	req.safeBody = req.body as Record<string, unknown>;

	next();
});

app.use(RequestLoggerMiddleware);

app.use("/", mainRouter);

// The SERVE_OWN_CDN option means that our /cdn path has to be hosted by us. In production,
// this is not the case (we have a dedicated nginx box for it running in a separate process).
// In dev, this is a pain to setup, so we can just run it locally.
if (
	ServerConfig.CDN_CONFIG.SAVE_LOCATION.TYPE === "LOCAL_FILESYSTEM" &&
	ServerConfig.CDN_CONFIG.SAVE_LOCATION.SERVE_OWN_CDN === true
) {
	if (Env.NODE_ENV === "production") {
		log.warn(
			{ bootInfo: true },
			`Running LOCAL_FILESYSTEM OWN_CDN in production. Consider making a separate process handle your CDN for performance.`,
		);
	}

	log.info(
		{
			bootInfo: true,
		},
		`Running own CDN at ${ServerConfig.CDN_CONFIG.SAVE_LOCATION.LOCATION}.`,
	);

	app.use("/cdn", express.static(ServerConfig.CDN_CONFIG.SAVE_LOCATION.LOCATION));
	app.get("/cdn/*", (req, res) => res.status(404).send("No content here."));
}

// completely stolen from ktapi error handler
interface ExpressJSONErr extends SyntaxError {
	status: integer;
	message: string;
}

const MAIN_ERR_HANDLER: express.ErrorRequestHandler = (err, req, res, _next) => {
	if (err instanceof SyntaxError) {
		const expErr: ExpressJSONErr = err as ExpressJSONErr;

		if (expErr.status === 400 && "body" in expErr) {
			log.info(
				{
					url: req.originalUrl,

					userID: req[SYMBOL_TACHI_API_AUTH]?.userID,
				},
				`JSON Parsing Error?`,
			);
			return res.status(400).send({ success: false, description: err.message });
		}

		// else, this isn't a JSON parsing error
	}

	log.error({ url: req.originalUrl, body: req.body }, `MAIN_ERR_HANDLER hit by request.`);

	const unknownErr = err as unknown;

	if (IsRecord(unknownErr) && unknownErr.type === "entity.too.large") {
		return res.status(413).json({
			success: false,
			description: "Your request body was too large. The limit is 4MB.",
		});
	}

	log.error(
		{
			err: unknownErr,
			url: req.originalUrl,
			authInfo: req[SYMBOL_TACHI_API_AUTH],
		},
		"Fatal error propagated to server root? ",
	);

	return res.status(500).json({
		success: false,
		description: "A fatal internal server error has occured.",
	});
};

app.use(MAIN_ERR_HANDLER);

export default app;
