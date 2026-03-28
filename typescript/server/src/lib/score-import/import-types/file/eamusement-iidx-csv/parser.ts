import type { KtLogger } from "#lib/log/log";

import type {
	IIDXEamusementCSVContext,
	IIDXEamusementCSVData,
} from "../../common/eamusement-iidx-csv/types";
import type { ParserFunctionReturns } from "../../common/types";

import GenericParseEamIIDXCSV from "../../common/eamusement-iidx-csv/parser";

function ParseEamusementIIDXCSV(
	fileData: Express.Multer.File,
	body: Record<string, unknown>,
	log: KtLogger,
): ParserFunctionReturns<IIDXEamusementCSVData, IIDXEamusementCSVContext> {
	return GenericParseEamIIDXCSV(fileData, body, "e-amusement", log);
}

export default ParseEamusementIIDXCSV;
