import { log } from "#lib/log/log";
import { RecalcSessions } from "#utils/calculations/recalc-sessions";
import { WrapScriptPromise } from "#utils/misc";

if (require.main === module) {
	WrapScriptPromise(RecalcSessions(), log);
}
