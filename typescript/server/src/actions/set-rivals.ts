import { MakeAction } from "#lib/actions/actions.js";
import { SetRivalsFailReasons } from "#lib/constants/err-codes.js";
import { setRivalsWithResult } from "#lib/rivals/rivals.js";
import { staticAssertUnreachable } from "#utils/misc.js";
import { IsUserAdmin } from "#utils/user.js";
import { ExpectedErr } from "bliss";
import { FormatGameGroup, type GameGroup, type Playtype } from "tachi-common";

function throwIfSetRivalsFailed(
	game: GameGroup,
	playtype: Playtype,
	reason: SetRivalsFailReasons,
): never {
	switch (reason) {
		case SetRivalsFailReasons.RIVALED_SELF:
			throw new ExpectedErr(400, `You cannot rival yourself.`);
		case SetRivalsFailReasons.RIVALS_HAVENT_PLAYED_GPT:
			throw new ExpectedErr(
				400,
				`Not all of the rivals you specified have played ${FormatGameGroup(game, playtype)}.`,
			);
		case SetRivalsFailReasons.TOO_MANY:
			throw new ExpectedErr(400, `You can't set more than 5 rivals.`);
		default:
			staticAssertUnreachable(reason);
	}
}

export const ACTION_SetRivals = MakeAction("SET_RIVALS", async (taker, input) => {
	const { userID, game: gameStr, playtype: playtypeStr, rivalIDs } = input;
	const game = gameStr as GameGroup;
	const playtype = playtypeStr as Playtype;

	if (taker.acct.id !== userID && !(await IsUserAdmin(taker.acct.id))) {
		throw new ExpectedErr(403, "You are not authorised to modify this user's rivals.");
	}

	const err = await setRivalsWithResult(userID, game, playtype, rivalIDs);
	if (err !== null) {
		throwIfSetRivalsFailed(game, playtype, err);
	}

	return {};
});
