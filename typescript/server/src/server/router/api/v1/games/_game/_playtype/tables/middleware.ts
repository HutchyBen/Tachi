import type { RequestHandler } from "express";

import MONGODB_KILL from "#services/mongo/db";
import { AssignToReqTachiData, GetTachiData } from "#utils/req-tachi-data";

export const GetTableFromParam: RequestHandler = async (req, res, next) => {
	const game = GetTachiData(req, "game");
	const playtype = GetTachiData(req, "playtype");

	const table = await MONGODB_KILL.tables.findOne({
		tableID: req.params.tableID,
		game,
		playtype,
	});

	if (!table) {
		return res.status(404).json({
			success: false,
			description: `This table does not exist.`,
		});
	}

	AssignToReqTachiData(req, { tableDoc: table });

	next();
};
