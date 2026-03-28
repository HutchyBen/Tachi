import { MakeAnonAction } from "#lib/actions/actions";
import { HashPassword } from "#lib/auth/auth";
import DB from "#services/pg/db";
import { GetTimeXHoursAgo } from "#utils/misc";
import { ISO8601ToUnixMilliseconds } from "#utils/time";
import { ExpectedErr, log } from "bliss";

export const ANON_ACTION_ResetPassword = MakeAnonAction(
	"RESET_PASSWORD",
	async (_taker, { "!password": password, code }) => {
		const codeInfo = await DB.selectFrom("priv_password_reset_token")
			.select(["user_id", "created_on"])
			.where("token", "=", code)
			.executeTakeFirstOrThrow();

		if (!codeInfo) {
			throw new ExpectedErr(404, "Invalid reset code.");
		}

		if (ISO8601ToUnixMilliseconds(codeInfo.created_on) < GetTimeXHoursAgo(24)) {
			throw new ExpectedErr(400, "Reset code has expired. Please request a new one.");
		}

		const hashedPassword = await HashPassword(password);

		await DB.updateTable("priv_account_credential")
			.set({
				password: hashedPassword,
			})
			.where("user_id", "=", codeInfo.user_id)
			.execute();

		log.info(`User ${codeInfo.user_id} reset their password.`);

		return {
			userID: codeInfo.user_id,
		};
	},
);
