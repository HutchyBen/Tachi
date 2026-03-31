import { MakeAction } from "#lib/actions/actions.js";
import { LoadScoreDocumentById } from "#lib/db-formats/score.js";
import { DeleteScore } from "#lib/score-mutation/delete-scores.js";
import { IsUserAdmin } from "#utils/user.js";
import { ExpectedErr } from "bliss";

export const ACTION_DeleteScore = MakeAction("DELETE_SCORE", async (taker, { id, blacklist }) => {
	const score = await LoadScoreDocumentById(id);

	if (!score) {
		throw new ExpectedErr(404, "This score does not exist.");
	}

	if (
		score.userID !== taker.acct.id &&
		!(await IsUserAdmin(taker.acct.id))
	) {
		throw new ExpectedErr(403, "You are not authorised to perform this action.");
	}

	await DeleteScore(score, blacklist ?? false);

	return {};
});
