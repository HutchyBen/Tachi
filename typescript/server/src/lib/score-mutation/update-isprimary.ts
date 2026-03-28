import { TachiConfig } from "#lib/setup/config";
/* eslint-disable no-await-in-loop */
import MONGODB_KILL from "#services/mongo/db";

export default async function UpdateIsPrimaryStatus() {
	for (const game of TachiConfig.GAMES) {
		const chartIDs = (
			await MONGODB_KILL.anyCharts[game].find({
				isPrimary: false,
			})
		).map((e) => e.chartID);

		await MONGODB_KILL.scores.update(
			{
				chartID: { $in: chartIDs },
			},
			{ $set: { isPrimary: false } },
		);

		await MONGODB_KILL["personal-bests"].update(
			{
				chartID: { $in: chartIDs },
			},
			{ $set: { isPrimary: false } },
		);
	}
}

// The easier way to do this is just to always update the isPrimary status
// Left, for posterities sake, is an incredibly sub-optimal aggregate that
// achieves this also.
//
// const scores = await db.scores.aggregate([
// 	{
// 		$match: {
// 			game: "iidx",
// 		},
// 	},
// 	{
// 		$lookup: {
// 			from: "charts-iidx",
// 			localField: "chartID",
// 			foreignField: "chartID",
// 			as: "chart",
// 		},
// 	},
// 	{
// 		$unwind: {
// 			path: "$chart",
// 		},
// 	},
// 	// This is the best way to do $match $ne, according to SO.
// 	{
// 		$addFields: {
// 			needsUpdate: {
// 				$ne: ["$chart.isPrimary", "$isPrimary"],
// 			},
// 		},
// 	},
// 	{
// 		$match: {
// 			needsUpdate: true,
// 		},
// 	},
// ]);
