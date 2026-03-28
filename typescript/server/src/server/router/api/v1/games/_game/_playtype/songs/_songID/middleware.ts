import type { RequestHandler } from "express";

import { GetSongByLegacyID } from "#lib/db-formats/song";
import { AssignToReqTachiData, GetTachiData } from "#utils/req-tachi-data";
import { ParseStrPositiveInt } from "#utils/string-checks";

export const ValidateAndGetSong: RequestHandler = async (req, res, next) => {
	const songID = ParseStrPositiveInt(req.params.songID);

	if (songID === null) {
		return res.status(400).json({
			success: false,
			description: `Invalid songID - could not be converted into integer?`,
		});
	}

	const game = GetTachiData(req, "game");

	const result = await GetSongByLegacyID(game, songID);

	if (!result) {
		return res.status(404).json({
			success: false,
			description: `No song exists with the songID ${songID}.`,
		});
	}

	AssignToReqTachiData(req, { songDoc: result.doc, songPgId: result.pgId });

	next();
};
