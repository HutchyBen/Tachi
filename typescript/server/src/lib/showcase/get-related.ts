import { log } from "#lib/logger/log.js";
import db from "#services/mongo/db";

import type { GameGroup, ShowcaseStatDetails } from "../../../../common/src";

export async function GetRelatedStatDocuments(stat: ShowcaseStatDetails, game: GameGroup) {
	switch (stat.mode) {
		case "chart": {
			const chart = await db.anyCharts[game].findOne({ chartID: stat.chartID });

			if (!chart) {
				log.error(`This stat refers to a chart that does not exist?`, { stat });
				throw new Error(`Stat refers to a chart that does not exist? ${stat.chartID}.`);
			}

			const song = await db.anySongs[game].findOne({ id: chart.songID });

			if (!song) {
				log.error(`Song-Chart Mismatch - ${chart.songID}.`, { chart });
				throw new Error(`Song-Chart Mismatch on ${chart.songID}.`);
			}

			return { song, chart };
		}

		case "folder": {
			if (Array.isArray(stat.folderID)) {
				log.warn(
					`This stat is corrupt and attempted to use multiple folderIDs. This is no longer supported. Check that migrations have ran.`,
					{ stat },
				);
				throw new Error(`Legacy FolderIDs used in showcase stat.`);
			}

			const folder = await db.folders.findOne({
				folderID: stat.folderID,
			});

			if (!folder) {
				log.error(`This stat refers to a folder that does not exist?`, { stat });
				throw new Error(`Stat refers to folder that no longer exists.`);
			}

			return { folder };
		}

		default: {
			log.error(
				`Invalid stat - has nonsense stat.mode of ${(stat as ShowcaseStatDetails).mode}.`,
				{ stat },
			);
			throw new Error(`Invalid stat.mode in stat?`);
		}
	}
}
