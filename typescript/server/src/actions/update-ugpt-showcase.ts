import { MakeAction } from "#lib/actions/actions";
import { GetUGPTSettingsDocument } from "#lib/db-formats/ugpt-settings";
import DB from "#services/pg/db";
import { IsUserAdmin } from "#utils/user";
import { ExpectedErr } from "bliss";
import { type ShowcaseStatDetails } from "tachi-common";

export const ACTION_UpdateUgptShowcase = MakeAction(
	"UPDATE_UGPT_SHOWCASE",
	async (taker, input) => {
		const { userID, game, stats } = input;

		if (taker.acct.id !== userID && !(await IsUserAdmin(taker.acct.id))) {
			throw new ExpectedErr(403, "You are not authorised to modify this user's showcase.");
		}

		const settingsRow = await DB.selectFrom("game_settings")
			.select("user_id")
			.where("user_id", "=", userID)
			.where("game", "=", game)
			.executeTakeFirst();

		if (!settingsRow) {
			throw new ExpectedErr(404, "You do not have a profile for this game.");
		}

		const payload = stats as Array<ShowcaseStatDetails>;

		await DB.insertInto("game_settings_showcase")
			.values({
				user_id: userID,
				game,
				data: JSON.stringify(payload),
			})
			.onConflict((oc) =>
				oc.columns(["user_id", "game"]).doUpdateSet({ data: JSON.stringify(payload) }),
			)
			.execute();

		const newSettings = await GetUGPTSettingsDocument(userID, game);

		if (!newSettings) {
			throw new ExpectedErr(500, "Failed to load settings after updating showcase.");
		}

		return {};
	},
);
