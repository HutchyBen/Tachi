import { log } from "#lib/logger/log.js";
import { UpdateAllPBs } from "#utils/calculations/recalc-scores";
import { WrapScriptPromise } from "#utils/misc";

if (require.main === module) {
	WrapScriptPromise(UpdateAllPBs(), logger);
}
