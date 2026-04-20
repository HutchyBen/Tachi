import type { RequestHandler } from "express";

import { LoadFolderDocumentByGameAndSlug } from "#lib/db-formats/folders";
import { LEGACY_REQ_GetGPT, REQ_AssignToReqTachiData } from "#utils/req-tachi-data";
import { LEGACY_GameGroupPTToGame } from "tachi-common";

export const GetFolderFromParam: RequestHandler = async (req, res, next) => {
	const { gameGroup: game, playtype } = LEGACY_REQ_GetGPT(req);
	const v3Game = LEGACY_GameGroupPTToGame(game, playtype);

	const folder = await LoadFolderDocumentByGameAndSlug(v3Game, req.params.folderSlug);

	if (!folder || folder.game !== v3Game) {
		return res.status(404).json({
			success: false,
			description: `This folder does not exist.`,
		});
	}

	REQ_AssignToReqTachiData(req, { folderDoc: folder });

	next();
};
