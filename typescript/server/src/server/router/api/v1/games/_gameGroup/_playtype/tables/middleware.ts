import type { RequestHandler } from "express";

import { LoadTableDocumentByLegacyIdForGame } from "#lib/db-formats/table";
import { REQ_AssignToReqTachiData, REQ_GetGame } from "#utils/req-tachi-data";

export const GetTableFromParam: RequestHandler = async (req, res, next) => {
	const game = REQ_GetGame(req);

	const table = await LoadTableDocumentByLegacyIdForGame(req.params.tableID, game);

	if (!table) {
		return res.status(404).json({
			success: false,
			description: `This table does not exist.`,
		});
	}

	REQ_AssignToReqTachiData(req, { tableDoc: table });

	next();
};
