import { MakeAction } from "#lib/actions/actions.js";
import DB from "#services/pg/db.js";

export const ACTION_DeleteCgCardInfo = MakeAction(
	"DELETE_CG_CARD_INFO",
	async (taker, { service }) => {
		await DB.deleteFrom("priv_svc_cg_card_info")
			.where("user_id", "=", taker.acct.id)
			.where("service", "=", service)
			.execute();

		return {};
	},
);
