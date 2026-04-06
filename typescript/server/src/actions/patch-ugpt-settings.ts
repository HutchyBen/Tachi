import { MakeAction } from "#lib/actions/actions.js";
import { SELECT_GAME_SETTINGS } from "#lib/db-formats/ugpt-settings";
import DB from "#services/pg/db.js";
import { IsUserAdmin } from "#utils/user.js";
import { ExpectedErr } from "bliss";
import {
	type GameGroup,
	GamePTToV3,
	type MONGO_UGPTSettingsDocument,
	type Playtype,
} from "tachi-common";
import { type GameSettingsUpdate } from "tachi-db";

export const ACTION_PatchUGPTSettings = MakeAction("PATCH_UGPT_SETTINGS", async (taker, input) => {
	const { userID, game: gameStr, playtype: playtypeStr, preferences } = input;
	const game = gameStr as GameGroup;
	const playtype = playtypeStr as Playtype;
	const body = preferences as Partial<MONGO_UGPTSettingsDocument["preferences"]>;

	if (taker.acct.id !== userID && !(await IsUserAdmin(taker.acct.id))) {
		throw new ExpectedErr(403, "You are not authorised to modify this user's settings.");
	}

	const v3Game = GamePTToV3(game, playtype);

	if (typeof body.defaultTable === "string") {
		const table = await DB.selectFrom("table")
			.select("id")
			.where("game", "=", v3Game)
			.where("legacy_id", "=", body.defaultTable)
			.executeTakeFirst();

		if (!table) {
			throw new ExpectedErr(
				400,
				`The table (${body.defaultTable}) does not exist (and therefore cannot be set as a default).`,
			);
		}
	}

	const hasGameSpecificKeys =
		body.gameSpecific !== undefined &&
		body.gameSpecific !== null &&
		typeof body.gameSpecific === "object" &&
		Object.keys(body.gameSpecific as object).length > 0;

	const hasUpdates =
		body.preferredScoreAlg !== undefined ||
		body.preferredSessionAlg !== undefined ||
		body.preferredProfileAlg !== undefined ||
		body.preferredDefaultEnum !== undefined ||
		body.defaultTable !== undefined ||
		body.preferredRanking !== undefined ||
		hasGameSpecificKeys;

	if (!hasUpdates) {
		return {};
	}

	const row = await DB.selectFrom("game_settings")
		.select(SELECT_GAME_SETTINGS)
		.where("game_settings.user_id", "=", userID)
		.where("game_settings.game", "=", v3Game)
		.executeTakeFirst();

	if (!row) {
		throw new ExpectedErr(404, "You do not have an account for this game.");
	}

	const set: GameSettingsUpdate = {};

	if (body.preferredScoreAlg !== undefined) {
		set.pf_preferred_score_alg = body.preferredScoreAlg;
	}
	if (body.preferredSessionAlg !== undefined) {
		set.pf_preferred_session_alg = body.preferredSessionAlg;
	}
	if (body.preferredProfileAlg !== undefined) {
		set.pf_preferred_profile_alg = body.preferredProfileAlg;
	}
	if (body.preferredDefaultEnum !== undefined) {
		set.pf_preferred_default_enum = body.preferredDefaultEnum;
	}
	if (body.defaultTable !== undefined) {
		set.pf_default_table = body.defaultTable;
	}
	if (body.preferredRanking !== undefined) {
		set.pf_preferred_ranking = body.preferredRanking;
	}

	if (hasGameSpecificKeys) {
		const nextData = {
			...(row.data as Record<string, unknown>),
			...(body.gameSpecific as Record<string, unknown>),
		};
		set.data = JSON.stringify(nextData);
	}

	if (Object.keys(set).length === 0) {
		return {};
	}

	await DB.updateTable("game_settings")
		.set(set)
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.execute();

	return {};
});
