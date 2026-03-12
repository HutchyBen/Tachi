import CreateLogCtx from "#lib/logger/logger";
import { InitSequenceDocs } from "#services/mongo/sequence-docs";
import { WrapScriptPromise } from "#utils/misc";

const logger = CreateLogCtx(__filename);

if (require.main === module) {
	WrapScriptPromise(InitSequenceDocs(), logger);
}
