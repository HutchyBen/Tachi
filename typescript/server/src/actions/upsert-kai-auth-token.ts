import { MakeAction } from "#lib/actions/actions.js";
import { upsertKaiAuthTokensInDb } from "#lib/kai-auth-token/persist.js";
import DB from "#services/pg/db.js";

export const ACTION_UpsertKaiAuthToken = MakeAction(
	"UPSERT_KAI_AUTH_TOKEN",
	async (taker, { service, token, refreshToken }) => {
		await upsertKaiAuthTokensInDb(DB, taker.acct.id, service, token, refreshToken);

		return {};
	},
);
