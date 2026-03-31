import { MakeAction } from "#lib/actions/actions.js";
import { GetUGPTSettingsDocument } from "#lib/db-formats/ugpt-settings.js";
import DB from "#services/pg/db.js";
import { IsUserAdmin } from "#utils/user.js";
import { ExpectedErr } from "bliss";
import { type GameGroup, GamePTToV3, type Playtype, type ShowcaseStatDetails } from "tachi-common";

export const ACTION_UpdateUgptShowcase = MakeAction(
	"UPDATE_UGPT_SHOWCASE",
	async (taker, input) => {
		const { userID, game: gameStr, playtype: playtypeStr, stats } = input;
		const game = gameStr as GameGroup;
		const playtype = playtypeStr as Playtype;

		if (taker.acct.id !== userID && !(await IsUserAdmin(taker.acct.id))) {
			throw new ExpectedErr(403, "You are not authorised to modify this user's showcase.");
		}

		const v3Game = GamePTToV3(game, playtype);

		const settingsRow = await DB.selectFrom("game_settings")
			.select("user_id")
			.where("user_id", "=", userID)
			.where("game", "=", v3Game)
			.executeTakeFirst();

		if (!settingsRow) {
			throw new ExpectedErr(404, "You do not have a profile for this game.");
		}

		const payload = stats as Array<ShowcaseStatDetails>;

		await DB.insertInto("game_settings_showcase")
			.values({
				user_id: userID,
				game: v3Game,
				data: JSON.stringify(payload),
			})
			.onConflict((oc) =>
				oc.columns(["user_id", "game"]).doUpdateSet({ data: JSON.stringify(payload) }),
			)
			.execute();

		const newSettings = await GetUGPTSettingsDocument(userID, game, playtype);

		if (!newSettings) {
			throw new ExpectedErr(500, "Failed to load settings after updating showcase.");
		}

		return {};
	},
);
