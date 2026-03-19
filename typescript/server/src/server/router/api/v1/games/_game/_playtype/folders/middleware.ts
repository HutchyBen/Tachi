import type { RequestHandler } from "express";

import MONGODB_KILL from "#services/mongo/db";
import { AssignToReqTachiData, GetGPT } from "#utils/req-tachi-data";

export const GetFolderFromParam: RequestHandler = async (req, res, next) => {
	const { game, playtype } = GetGPT(req);

	const folder = await MONGODB_KILL.folders.findOne({
		folderID: req.params.folderID,
		game,
		playtype,
	});

	if (!folder) {
		return res.status(404).json({
			success: false,
			description: `This folder does not exist.`,
		});
	}

	AssignToReqTachiData(req, { folderDoc: folder });

	next();
};
