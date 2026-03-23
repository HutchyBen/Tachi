import { log } from "#lib/log/log";
import { UpdateAllPBs } from "#utils/calculations/recalc-scores";
import { WrapScriptPromise } from "#utils/misc";

if (require.main === module) {
	WrapScriptPromise(UpdateAllPBs(), log);
}
