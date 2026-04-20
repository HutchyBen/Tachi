import type { RequestHandler } from "express";

import { GetChartByIdForGame } from "#lib/db-formats/chart";
import { REQ_AssignToReqTachiData, REQ_GetGame } from "#utils/req-tachi-data";

export const ValidateAndGetChart: RequestHandler = async (req, res, next) => {
	const game = REQ_GetGame(req);

	const chart = await GetChartByIdForGame(game, req.params.chartID);

	if (!chart) {
		return res.status(404).json({
			success: false,
			description: `The chart ${req.params.chartID} does not exist.`,
		});
	}

	REQ_AssignToReqTachiData(req, { chartDoc: chart });

	next();
};
