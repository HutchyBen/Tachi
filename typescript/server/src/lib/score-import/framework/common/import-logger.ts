import { type KtLogger, log } from "#lib/log/log.js";
import { FormatUserDoc } from "#utils/user";

import type { ImportTypes, UserDocument } from "tachi-common";

export function CreateScoreLogger(
	user: UserDocument,
	importID: string,
	importType: ImportTypes,
): KtLogger {
	return log.child({
		context: ["Score Import", importType, FormatUserDoc(user)],
		importID,
	});
}
