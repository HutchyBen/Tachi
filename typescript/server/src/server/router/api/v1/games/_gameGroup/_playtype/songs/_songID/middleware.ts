import type { RequestHandler } from "express";

import { GetSongByID } from "#lib/db-formats/song";
import { REQ_AssignToReqTachiData, REQ_GetTachiData } from "#utils/req-tachi-data";

export const ValidateAndGetSong: RequestHandler = async (req, res, next) => {
	const gameGroup = REQ_GetTachiData(req, "gameGroup");

	const result = await GetSongByID(gameGroup, req.params.songID);

	if (!result) {
		return res.status(404).json({
			success: false,
			description: `No song exists with the songID ${req.params.songID}.`,
		});
	}

	REQ_AssignToReqTachiData(req, { songDoc: result.doc, songNewID: result.newSongID });

	next();
};
