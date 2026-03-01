import CreateLogCtx from "#lib/logger/logger";
import { WrapScriptPromise } from "#utils/misc";

import { InitaliseFolderChartLookup } from "../../utils/folder";

const logger = CreateLogCtx(__filename);

if (require.main === module) {
	WrapScriptPromise(InitaliseFolderChartLookup(), logger);
}
