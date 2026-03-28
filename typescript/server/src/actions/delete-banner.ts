import { MakeAction } from "#lib/actions/actions.js";
import { CDNDelete } from "#lib/cdn/cdn.js";
import { GetProfileBannerURL } from "#lib/cdn/url-format.js";
import DB from "#services/pg/db.js";
import { ExpectedErr } from "bliss";

export const ACTION_DeleteBanner = MakeAction("DELETE_BANNER", async (taker) => {
	const account = await DB.selectFrom("account")
		.select("custom_banner_location")
		.where("id", "=", taker.acct.id)
		.executeTakeFirstOrThrow();

	if (!account.custom_banner_location) {
		throw new ExpectedErr(404, "You do not have a custom profile banner to delete.");
	}

	await CDNDelete(GetProfileBannerURL(taker.acct.id, account.custom_banner_location));

	await DB.updateTable("account")
		.set({ custom_banner_location: null })
		.where("id", "=", taker.acct.id)
		.execute();

	return {};
});
