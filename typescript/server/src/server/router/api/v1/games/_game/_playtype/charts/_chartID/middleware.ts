import type { RequestHandler } from "express";

import { GetChartById } from "#lib/db-formats/chart";
import { AssignToReqTachiData, GetGPT } from "#utils/req-tachi-data";
import { GamePTToV3 } from "tachi-common";

export const ValidateAndGetChart: RequestHandler = async (req, res, next) => {
	const { game, playtype } = GetGPT(req);

	const chart = await GetChartById(GamePTToV3(game, playtype), req.params.chartID);

	if (!chart) {
		return res.status(404).json({
			success: false,
			description: `The chart ${req.params.chartID} does not exist.`,
		});
	}

	AssignToReqTachiData(req, { chartDoc: chart });

	next();
};
