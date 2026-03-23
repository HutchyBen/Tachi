import { log } from "#lib/log/log";
import { InitSequenceDocs } from "#services/mongo/sequence-docs";
import { WrapScriptPromise } from "#utils/misc";

if (require.main === module) {
	WrapScriptPromise(InitSequenceDocs(), log);
}
