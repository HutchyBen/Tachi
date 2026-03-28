import { MakeAction } from "#lib/actions/actions.js";
import DB from "#services/pg/db.js";

export const ACTION_RevokeKaiAuthToken = MakeAction(
	"REVOKE_KAI_AUTH_TOKEN",
	async (taker, { service }) => {
		await DB.deleteFrom("priv_svc_kai_auth_token")
			.where("user_id", "=", taker.acct.id)
			.where("service", "=", service)
			.execute();

		return {};
	},
);
