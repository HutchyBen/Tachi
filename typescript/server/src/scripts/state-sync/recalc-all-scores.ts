import { log } from "#lib/log/log";
import { RecalcAllScores } from "#utils/calculations/recalc-scores";
import { WrapScriptPromise } from "#utils/misc";

if (require.main === module) {
	WrapScriptPromise(RecalcAllScores(), log);
}
