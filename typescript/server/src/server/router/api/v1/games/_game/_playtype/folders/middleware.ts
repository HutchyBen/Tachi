import type { RequestHandler } from "express";

import { LoadFolderDocumentById } from "#lib/db-formats/folders.js";
import { AssignToReqTachiData, GetGPT } from "#utils/req-tachi-data";

export const GetFolderFromParam: RequestHandler = async (req, res, next) => {
	const { game, playtype } = GetGPT(req);

	const folder = await LoadFolderDocumentById(req.params.folderID);

	if (!folder || folder.game !== game || folder.playtype !== playtype) {
		return res.status(404).json({
			success: false,
			description: `This folder does not exist.`,
		});
	}

	AssignToReqTachiData(req, { folderDoc: folder });

	next();
};
