import { log } from "#lib/logger/log.js";
import { InitSequenceDocs } from "#services/mongo/sequence-docs";
import { WrapScriptPromise } from "#utils/misc";

if (require.main === module) {
	WrapScriptPromise(InitSequenceDocs(), logger);
}
