import { MakeAnonAction } from "#lib/actions/actions.js";
import DB from "#services/pg/db.js";
import { ExpectedErr } from "bliss";

export const ANON_ACTION_VerifyEmail = MakeAnonAction("VERIFY_EMAIL", async (_taker, { code }) => {
	const exists = await DB.selectFrom("priv_verify_email_token")
		.select("user_id")
		.where("token", "=", code)

		.executeTakeFirstOrThrow();

	if (!exists) {
		throw new ExpectedErr(400, "Invalid email verification code.");
	}

	await DB.deleteFrom("priv_verify_email_token").where("token", "=", code).execute();

	return {};
});
