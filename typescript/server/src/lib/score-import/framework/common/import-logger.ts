import type { ImportTypes, UserDocument } from "../../../../../../common/src";

import { type KtLogger, rootLogger } from "#lib/logger/logger";
import { FormatUserDoc } from "#utils/user";

export function CreateScoreLogger(
	user: UserDocument,
	importID: string,
	importType: ImportTypes,
): KtLogger {
	const meta = {
		context: ["Score Import", importType, FormatUserDoc(user)],
		importID,
	};

	// used so appendLogCtx works
	const childLogger = rootLogger.child(meta);

	childLogger.defaultMeta = meta;

	return childLogger as KtLogger;
}
