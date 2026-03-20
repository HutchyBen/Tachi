import { MakeAnonAction } from "#lib/actions/actions.js";
import { SendEmail } from "#lib/email/client.js";
import { EmailFormatVerifyEmail } from "#lib/email/formats.js";
import { Env, ServerConfig } from "#lib/setup/config.js";
import { AddNewUser, ValidateCaptcha } from "#server/router/api/v1/auth/auth.js";
import DB from "#services/pg/db.js";
import { Random20Hex } from "#utils/misc.js";
import { CheckIfEmailInUse, GetUserCaseInsensitive } from "#utils/user.js";
import { ExpectedErr, log } from "bliss";
import { type UserDocument } from "tachi-common";

export const ANON_ACTION_Register = MakeAnonAction(
	"REGISTER",
	async (taker, { email, "!password": password, inviteCode, username, captcha }) => {
		// force lowercase for emails to avoid case-confusion in lookups...
		email = email.toLowerCase();

		if (Env.NODE_ENV === "production" || Env.NODE_ENV === "staging") {
			log.debug("Validating captcha...");

			if (taker.ip === null) {
				throw new ExpectedErr(400, `IP address is required to validate captcha.`);
			}

			const validCaptcha = await ValidateCaptcha(captcha, taker.ip);

			if (!validCaptcha) {
				throw new ExpectedErr(400, `Captcha failed.`);
			}
		} else {
			log.debug("Skipped captcha check because not in production.");
		}

		const existingUser = await GetUserCaseInsensitive(username);

		if (existingUser) {
			throw new ExpectedErr(409, `This username is already in use.`);
		}

		const existingEmail = await CheckIfEmailInUse(email);

		if (existingEmail) {
			throw new ExpectedErr(409, `This email is already in use.`);
		}

		const newUser = await DB.transaction().execute(async (txn): Promise<UserDocument> => {
			// if we get to this point, We're good to create the user.

			const { newUser, newSettings: _ } = await AddNewUser(txn, username, password, email);

			if (ServerConfig.INVITE_CODE_CONFIG) {
				if (!inviteCode) {
					throw new ExpectedErr(
						400,
						"No invite code given, yet the server uses invites.",
					);
				}

				const inviteCodeDoc = await txn
					.selectFrom("priv_invite")
					.select("code")
					.where("code", "=", inviteCode)
					.where("consumed", "=", false)
					.executeTakeFirst();

				if (!inviteCodeDoc) {
					log.info(`Invalid invite code given: ${inviteCode}.`);
					throw new Error(`Invalid invite code given: ${inviteCode}.`);
				}

				log.info(`Consumed invite ${inviteCodeDoc.code}.`);

				await txn
					.updateTable("priv_invite")
					.set({
						consumed: true,
						consumed_at: new Date().toISOString(),
						consumed_by: newUser.id,
					})
					.where("code", "=", inviteCode)
					.execute();
			}

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
						email,
					})
					.execute();

				// TODO: Put this on job queue
				const { text, html } = EmailFormatVerifyEmail(newUser.username, resetEmailCode);

				void SendEmail(email, "Email Verification", html, text);
			}

			return newUser;
		});

		return {
			userID: newUser.id,
		};
	},
);
