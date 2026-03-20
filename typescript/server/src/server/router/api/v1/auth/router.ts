import { ACTION_ResendVerifyEmail } from "#actions/resend-verify-email.js";
import { ANON_ACTION_ForgotPassword } from "#anon-actions/forgot-password.js";
import { ANON_ACTION_Register } from "#anon-actions/register.js";
import { ANON_ACTION_ResetPassword } from "#anon-actions/reset-password.js";
import { ANON_ACTION_VerifyEmail } from "#anon-actions/verify-email.js";
import { log } from "#lib/log/log.js";
import { Env, ServerConfig, TachiConfig } from "#lib/setup/config";
import prValidate from "#server/middleware/prudence-validate";
import {
	AggressiveRateLimitMiddleware,
	HyperAggressiveRateLimitMiddleware,
} from "#server/middleware/rate-limiter";
import { actionErrorToResponse, apiSuccess } from "#utils/response.js";
import {
	FormatUserDoc,
	GetSettingsForUser,
	GetUserCaseInsensitive,
	GetUserPrivateInfo,
	GetUserWithID,
} from "#utils/user";
import { Router } from "express";
import { p } from "prudence";
import { type UserDocument } from "tachi-common";

import {
	MountAuthCookie,
	PasswordCompare,
	ValidateCaptcha,
	ValidateEmail,
	ValidatePassword,
} from "./auth";

const router: Router = Router({ mergeParams: true });

/**
 * Logs in a user.
 * @name POST /api/v1/auth/login
 */
router.post(
	"/login",
	AggressiveRateLimitMiddleware,
	prValidate(
		{
			username: p.regex(/^[a-zA-Z_-][a-zA-Z0-9_-]{2,20}$/u),
			"!password": ValidatePassword,
			captcha: "string",
		},
		{
			username:
				"Invalid username. Usernames cannot start with a number, and must be between 2 and 20 characters.",
			captcha: "Please fill out the captcha.",
		},
		undefined,
		"debug",
	),
	async (req, res) => {
		if (req.session.tachi?.user.id !== undefined) {
			// Dual logins should destroy the users session and recreate it.
			req.session.tachi = undefined;
		}

		const body = req.safeBody as {
			"!password": string;
			captcha: string;
			username: string;
		};

		log.debug(`Received login request with username ${body.username} (${req.ip})`);

		/* istanbul ignore next */
		if (Env.NODE_ENV === "production" || Env.NODE_ENV === "staging") {
			log.debug("Validating captcha...");
			const validCaptcha = await ValidateCaptcha(body.captcha, req.socket.remoteAddress);

			if (!validCaptcha) {
				log.debug("Captcha failed.");
				return res.status(400).json({
					success: false,
					description: `Captcha failed.`,
				});
			}

			log.debug("Captcha validated!");
		} else {
			log.debug("Skipped captcha check because not in production.");
		}

		const requestedUser = await GetUserCaseInsensitive(body.username);

		if (!requestedUser) {
			log.debug(`Invalid username for login ${body.username}.`);
			return res.status(404).json({
				success: false,
				description: `This user does not exist.`,
			});
		}

		const privateInfo = await GetUserPrivateInfo(requestedUser.id);

		if (!privateInfo) {
			log.error(
				{ requestedUser },
				`State desync for user ${FormatUserDoc(
					requestedUser,
				)}. This user has no password/email information?`,
			);

			return res.status(500).json({
				success: false,
				description: `An internal server error has occured.`,
			});
		}

		const passwordMatch = await PasswordCompare(body["!password"], privateInfo.password);

		if (!passwordMatch) {
			log.debug("Invalid password provided.");
			return res.status(403).json({
				success: false,
				description: `Invalid password.`,
			});
		}

		const user = await GetUserWithID(requestedUser.id);

		if (!user) {
			log.error({ requestedUser }, `User logged in as someone who does not exist?`);
			return res.status(500).json({
				success: false,
				description: `An internal server error has occured.`,
			});
		}

		const settings = await GetSettingsForUser(requestedUser.id);

		MountAuthCookie(req, user, settings);

		log.debug(`${FormatUserDoc(requestedUser)} Logged in.`);

		return res.status(200).json({
			success: true,
			description: `Successfully logged in as ${FormatUserDoc(requestedUser)}`,
			body: {
				userID: requestedUser.id,
			},
		});
	},
);

/**
 * Registers a new user.
 * @name POST /api/v1/auth/register
 */
router.post(
	"/register",
	AggressiveRateLimitMiddleware,
	prValidate(
		{
			username: p.regex(/^[a-zA-Z_-][a-zA-Z0-9_-]{2,20}$/u),
			"!password": ValidatePassword,
			email: ValidateEmail,
			inviteCode: "*string",
			captcha: "string",
		},
		{
			username:
				"Usernames must be between 3 and 20 characters long, can only contain alphanumeric characters and cannot start with a number.",
			email: "Invalid email.",
			inviteCode: "Invalid invite code.",
			captcha: "Please fill out the captcha.",
		},
		undefined,
		"debug",
	),
	async (req, res) => {
		if (!TachiConfig.SIGNUPS_ENABLED) {
			return res.status(501).json({
				success: false,
				description: `Signups are not currently enabled.`,
			});
		}

		const body = req.safeBody as {
			"!password": string;
			captcha: string;
			email: string;
			inviteCode?: string;
			username: string;
		};

		let newUser: { userID: number };
		try {
			newUser = await ANON_ACTION_Register(
				{
					ip: req.ip,
				},
				{
					email: body.email,
					"!password": body["!password"],
					inviteCode: body.inviteCode ?? null,
					captcha: body.captcha,
					username: body.username,
				},
			);
		} catch (err) {
			return actionErrorToResponse(res, err);
		}

		const user = await GetUserWithID(newUser.userID);

		if (!user) {
			log.error(
				`User ${newUser.userID} does not have a user document, but one was just created.`,
			);

			return res.status(500).json({
				success: false,
				description: "An internal server error has occured.",
			});
		}

		const settings = await GetSettingsForUser(user.id);
		MountAuthCookie(req, user, settings);

		return res
			.status(200)
			.json(apiSuccess<UserDocument>(`Successfully created account ${body.username}!`, user));
	},
);

/**
 * Verifies the provided email according to the code provided.
 *
 * @param code - The emailCode set in the /register function.
 *
 * @name POST /api/v1/auth/verify-email
 */
router.post(
	"/verify-email",
	AggressiveRateLimitMiddleware,
	prValidate({
		code: "string",
	}),
	async (req, res) => {
		const body = req.safeBody as {
			code: string;
		};

		try {
			await ANON_ACTION_VerifyEmail({ ip: req.ip }, { code: body.code });
		} catch (err) {
			return actionErrorToResponse(res, err);
		}

		return res.status(200).json({
			success: true,
			description: `Verified email!`,
			body: {},
		});
	},
);

/**
 * Resend a verification email, for when they fall through the
 * cracks.
 *
 * @param email - The email to send a verification email to.
 *
 * @name POST /api/v1/auth/resend-verify-email
 */
router.post("/resend-verify-email", HyperAggressiveRateLimitMiddleware, async (req, res) => {
	// Immediately send a response so the existence of emails
	// cannot be timing attacked out.
	res.status(200).json({
		success: true,
		description: `Sent an email if the email address has not been verified.`,
		body: {},
	});

	const user = req.session.tachi?.user;

	if (!user) {
		return;
	}

	await ACTION_ResendVerifyEmail(
		{
			ip: req.ip,
			acct: {
				id: user.id,
				username: user.username,
			},
		},
		{},
	);
});

/**
 * Logs out the requesting user.
 * @name POST /api/v1/auth/logout
 */
router.post("/logout", (req, res) => {
	// this is sorrrrt of an action, but it does
	// mutation of req, it's not "pure" enough
	// for me to want to make it an action.

	if (req.session.tachi?.user.id === undefined) {
		return res.status(409).json({
			success: false,
			description: `You are not logged in.`,
		});
	}

	req.session.destroy(() => 0);

	return res.status(200).json({
		success: true,
		description: `Logged Out.`,
		body: {},
	});
});

/**
 * Creates a password reset code for a user. The user will then
 * be able to trigger POST /reset-password with that code.
 *
 * @param email - The email associated with the account you want to reset.
 *
 * @name POST /api/v1/auth/forgot-password
 */
router.post(
	"/forgot-password",
	HyperAggressiveRateLimitMiddleware,
	prValidate({ email: "string" }),
	async (req, res) => {
		if (!ServerConfig.EMAIL_CONFIG && Env.NODE_ENV !== "test") {
			return res.status(501).json({
				success: false,
				description: `This server does not support password resets.`,
			});
		}

		const body = req.safeBody as {
			email: string;
		};

		// For timing attack and infosec reasons, we can't do anything but **immediately** return here.
		res.status(202).json({
			success: true,
			description: "A code has been sent to your email.",
			body: {},
		});

		try {
			await ANON_ACTION_ForgotPassword({ ip: req.ip }, { email: body.email });
		} catch (_err) {
			// error is logged elsewhere.
		}
	},
);

/**
 * Takes a code generated from /forgot-password, a new password,
 * and performs the reset for the user.
 *
 * @param password - The users new password.
 * @param code - The code to use to reset this password.
 *
 * @name POST /api/v1/auth/reset-password
 */
router.post(
	"/reset-password",
	AggressiveRateLimitMiddleware,
	prValidate({
		code: "string",
		"!password": ValidatePassword,
	}),
	async (req, res) => {
		const body = req.safeBody as {
			"!password": string;
			code: string;
		};

		await ANON_ACTION_ResetPassword(
			{ ip: req.ip },
			{
				code: body.code,
				"!password": body["!password"],
			},
		);

		return res.status(200).json({
			success: true,
			description: `Reset your password.`,
			body: {},
		});
	},
);

export default router;
