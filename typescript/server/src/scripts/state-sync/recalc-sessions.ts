import { log } from "#lib/logger/log.js";
import { RecalcSessions } from "#utils/calculations/recalc-sessions";
import { WrapScriptPromise } from "#utils/misc";

if (require.main === module) {
	WrapScriptPromise(RecalcSessions(), logger);
}
