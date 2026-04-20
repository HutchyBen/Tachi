import type { RequestHandler } from "express";

import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { LoadSessionDocumentById } from "#lib/db-formats/session";
import { REQ_AssignToReqTachiData, REQ_GetTachiData } from "#utils/req-tachi-data";

export const GetSessionFromParam: RequestHandler = async (req, res, next) => {
	const session = await LoadSessionDocumentById(req.params.sessionID);

	if (!session) {
		return res.status(404).json({
			success: false,
			description: `This session does not exist.`,
		});
	}

	REQ_AssignToReqTachiData(req, { sessionDoc: session });

	next();
};

export const RequireOwnershipOfSession: RequestHandler = (req, res, next) => {
	const userID = req[SYMBOL_TACHI_API_AUTH].userID;
	const session = REQ_GetTachiData(req, "sessionDoc");

	if (userID !== session.userID) {
		return res.status(403).json({
			success: false,
			description: `You are not authorised to modify this session.`,
		});
	}

	next();
};
