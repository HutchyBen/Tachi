import type { RequestHandler } from "express";

import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { LoadImportDocumentById } from "#lib/db-formats/import-document";
import { log } from "#lib/log/log";
import { REQ_AssignToReqTachiData, REQ_GetTachiData } from "#utils/req-tachi-data";
import { IsRequesterAdmin } from "#utils/user";

export const GetImportFromParam: RequestHandler = async (req, res, next) => {
	const importDoc = await LoadImportDocumentById(req.params.importID);

	if (!importDoc) {
		return res.status(404).json({
			success: false,
			description: `This import does not exist.`,
		});
	}

	REQ_AssignToReqTachiData(req, { importDoc });

	next();
};

export const RequireOwnershipOfImportOrAdmin: RequestHandler = async (req, res, next) => {
	const importDoc = REQ_GetTachiData(req, "importDoc");
	const userID = req[SYMBOL_TACHI_API_AUTH].userID;

	if (userID === null) {
		return res.status(401).json({
			success: false,
			description: `You are not authorised as anyone, and this endpoint requires us to know who you are.`,
		});
	}

	if (importDoc.userID !== userID) {
		if (await IsRequesterAdmin(req[SYMBOL_TACHI_API_AUTH])) {
			log.info(`Admin ${userID} interacted with someone elses import.`);
			next();
			return;
		}

		return res.status(403).json({
			success: false,
			description: `You are not authorised to perform this action.`,
		});
	}

	next();
};
