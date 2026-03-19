import type { RequestHandler } from "express";

import MONGODB_KILL from "#services/mongo/db";
import { AssignToReqTachiData, GetGPT } from "#utils/req-tachi-data";

export const ValidateAndGetChart: RequestHandler = async (req, res, next) => {
	const { game, playtype } = GetGPT(req);

	const chart = await MONGODB_KILL.anyCharts[game].findOne({
		chartID: req.params.chartID,

		// technically redundant, but we're under playtypes here URL wise.
		// this means we cant match an SP chart when we're under IIDX SP, for
		// example.
		playtype,
	});

	if (!chart) {
		return res.status(404).json({
			success: false,
			description: `The chart ${req.params.chartID} does not exist.`,
		});
	}

	AssignToReqTachiData(req, { chartDoc: chart });

	next();
};
