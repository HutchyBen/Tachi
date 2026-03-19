import type { GameGroup, ShowcaseStatDetails } from "tachi-common";

import { log } from "#lib/log/log.js";
import MONGODB_KILL from "#services/mongo/db";

export async function GetRelatedStatDocuments(stat: ShowcaseStatDetails, game: GameGroup) {
	switch (stat.mode) {
		case "chart": {
			const chart = await MONGODB_KILL.anyCharts[game].findOne({ chartID: stat.chartID });

			if (!chart) {
				log.error({ stat }, `This stat refers to a chart that does not exist?`);
				throw new Error(`Stat refers to a chart that does not exist? ${stat.chartID}.`);
			}

			const song = await MONGODB_KILL.anySongs[game].findOne({ id: chart.songID });

			if (!song) {
				log.error({ chart }, `Song-Chart Mismatch - ${chart.songID}.`);
				throw new Error(`Song-Chart Mismatch on ${chart.songID}.`);
			}

			return { song, chart };
		}

		case "folder": {
			if (Array.isArray(stat.folderID)) {
				log.warn(
					{ stat },
					`This stat is corrupt and attempted to use multiple folderIDs. This is no longer supported. Check that migrations have ran.`,
				);
				throw new Error(`Legacy FolderIDs used in showcase stat.`);
			}

			const folder = await MONGODB_KILL.folders.findOne({
				folderID: stat.folderID,
			});

			if (!folder) {
				log.error({ stat }, `This stat refers to a folder that does not exist?`);
				throw new Error(`Stat refers to folder that no longer exists.`);
			}

			return { folder };
		}

		default: {
			log.error(
				{ stat },
				`Invalid stat - has nonsense stat.mode of ${(stat as ShowcaseStatDetails).mode}.`,
			);
			throw new Error(`Invalid stat.mode in stat?`);
		}
	}
}
