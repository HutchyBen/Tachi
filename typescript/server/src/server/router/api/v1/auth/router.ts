import { SendEmail } from "#lib/email/client";
import { EmailFormatResetPassword, EmailFormatVerifyEmail } from "#lib/email/formats";
import { log } from "#lib/log/log.js";
import { Env, ServerConfig, TachiConfig } from "#lib/setup/config";
import prValidate from "#server/middleware/prudence-validate";
import {
	AggressiveRateLimitMiddleware,
	HyperAggressiveRateLimitMiddleware,
} from "#server/middleware/rate-limiter";
import DB from "#services/pg/db.js";
import { Random20Hex } from "#utils/misc";
import { apiSuccess } from "#utils/response.js";
import {
	CheckIfEmailInUse,
	FormatUserDoc,
	GetSettingsForUser,
	GetUserCaseInsensitive,
	GetUserPrivateInfo,
	GetUserWithID,
	GetUserWithIDGuaranteed,
} from "#utils/user";
import { Router } from "express";
import { p } from "prudence";
import { type UserDocument } from "tachi-common";

import {
	AddNewUser,
	HashPassword,
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
			log.warn("Skipped captcha check because not in production.");
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

		// force lowercase for emails to avoid case-confusion in lookups...
		body.email = body.email.toLowerCase();

		if (body.inviteCode === undefined && ServerConfig.INVITE_CODE_CONFIG) {
			return res.status(400).json({
				success: false,
				description: `No invite code given, yet the server uses invites.`,
			});
		}

		log.debug(`received register request with username ${body.username} (${req.ip})`);

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

			log.debug("Captcha validated.");
		} else {
			log.warn("Skipped captcha check because not in production.");
		}

		const existingUser = await GetUserCaseInsensitive(body.username);

		if (existingUser) {
			log.debug(`Invalid username ${body.username}, already in use.`);
			return res.status(409).json({
				success: false,
				description: "This username is already in use.",
			});
		}

		const existingEmail = await CheckIfEmailInUse(body.email);

		if (existingEmail) {
			log.info(`User attempted to sign up with email that was already in use.`);
			return res.status(409).json({
				success: false,
				description: `This email is already in use.`,
			});
		}

		try {
			const newUser = await DB.transaction().execute(async (txn): Promise<UserDocument> => {
				// if we get to this point, We're good to create the user.

				const { newUser, newSettings } = await AddNewUser(
					txn,
					body.username,
					body["!password"],
					body.email,
				);

				if (ServerConfig.INVITE_CODE_CONFIG) {
					if (!body.inviteCode) {
						throw new Error("No invite code given, yet the server uses invites.");
					}

					const inviteCodeDoc = await txn
						.selectFrom("priv_invite")
						.select("code")
						.where("code", "=", body.inviteCode)
						.where("consumed", "=", false)
						.executeTakeFirst();

					if (!inviteCodeDoc) {
						log.info(`Invalid invite code given: ${body.inviteCode}.`);
						throw new Error(`Invalid invite code given: ${body.inviteCode}.`);
					}

					log.info(`Consumed invite ${inviteCodeDoc.code}.`);

					await txn
						.updateTable("priv_invite")
						.set({
							consumed: true,
							consumed_at: new Date().toISOString(),
							consumed_by: newUser.id,
						})
						.where("code", "=", body.inviteCode)
						.execute();
				}

				MountAuthCookie(req, newUser, newSettings);

				// If we have an EMAIL_CONFIG set, send out
				// authentication emails.
				// Otherwise, don't bother; this is equivalent to
				// automatically verifying all users' emails.
				if (ServerConfig.EMAIL_CONFIG) {
					const resetEmailCode = Random20Hex();

					await DB.insertInto("priv_verify_email_token")
						.values({
							token: resetEmailCode,
							user_id: newUser.id,
							email: body.email,
						})
						.execute();

					// TODO: Put this on job queue
					const { text, html } = EmailFormatVerifyEmail(newUser.username, resetEmailCode);

					void SendEmail(body.email, "Email Verification", html, text);
				}

				return newUser;
			});

			return res
				.status(200)
				.json(
					apiSuccess<UserDocument>(
						`Successfully created account ${body.username}!`,
						newUser,
					),
				);
		} catch (err) {
			log.error({ err }, `Bailed on user creation ${body.username}.`);

			return res.status(500).json({
				success: false,
				description: "An internal server error has occured.",
			});
		}
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

		const code = await DB.selectFrom("priv_verify_email_token")
			.select("user_id")
			.where("token", "=", body.code)
			.executeTakeFirstOrThrow();

		if (!code) {
			return res.status(400).json({
				success: false,
				description: `This email code is invalid.`,
			});
		}

		await DB.deleteFrom("priv_verify_email_token").where("token", "=", body.code).execute();

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

	const userID = user.id;

	const verifyInfo = await DB.selectFrom("priv_verify_email_token")
		.select(["email", "token"])
		.where("user_id", "=", userID)
		.executeTakeFirstOrThrow();

	if (!verifyInfo) {
		log.warn(`Attempted to send reset email to ${userID}, but no verifyInfo was set for them.`);
		return;
	}

	// Send the email again.

	const { text, html } = EmailFormatVerifyEmail(user.username, verifyInfo.token);

	void SendEmail(verifyInfo.email, "Email Verification", html, text);
});

/**
 * Logs out the requesting user.
 * @name POST /api/v1/auth/logout
 */
router.post("/logout", (req, res) => {
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

		body.email = body.email.toLowerCase();

		log.debug(`received password reset request for ${body.email}.`);

		// For timing attack and infosec reasons, we can't do anything but **immediately** return here.
		res.status(202).json({
			success: true,
			description: "A code has been sent to your email.",
			body: {},
		});

		const userPrivateInfo = await DB.selectFrom("priv_account_credential")
			.select(["user_id", "email"])
			.where("email", "=", body.email)
			.executeTakeFirstOrThrow();

		if (userPrivateInfo) {
			const user = await GetUserWithIDGuaranteed(userPrivateInfo.user_id);

			if (!user) {
				log.error(
					`User ${userPrivateInfo.user_id} has private information but no real account.`,
				);
				return;
			}

			const code = `M${Random20Hex()}`;

			log.debug(`Created password reset code for ${FormatUserDoc(user)}.`);

			await DB.insertInto("priv_password_reset_token")
				.values({
					token: code,
					user_id: user.id,
					created_on: new Date().toISOString(),
				})
				.execute();

			const { html, text } = EmailFormatResetPassword(user.username, code, req.ip);

			void SendEmail(userPrivateInfo.email, "Reset Password", html, text);
		} else {
			log.info(
				`Silently rejected password reset request for ${body.email}, as no user has this email.`,
			);
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

		const code = await DB.selectFrom("priv_password_reset_token")
			.select("user_id")
			.where("token", "=", body.code)
			.executeTakeFirstOrThrow();

		if (!code) {
			return res.status(404).json({
				success: false,
				description: `Invalid reset code.`,
			});
		}

		const hashedPassword = await HashPassword(body["!password"]);

		await DB.updateTable("priv_account_credential")
			.set({
				password: hashedPassword,
			})
			.where("user_id", "=", code.user_id)
			.execute();

		log.info(`User ${code.user_id} reset their password.`);

		return res.status(200).json({
			success: true,
			description: `Reset your password.`,
			body: {},
		});
	},
);

export default router;
