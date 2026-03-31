import type { GameGroup, ShowcaseStatDetails } from "tachi-common";

import { LoadFolderDocumentById } from "#lib/db-formats/folders";
import { log } from "#lib/log/log";
import { GetChartForIDGuaranteed, GetSongForIDGuaranteed } from "#utils/db";

export async function GetRelatedStatDocuments(stat: ShowcaseStatDetails, game: GameGroup) {
	switch (stat.mode) {
		case "chart": {
			const chart = await GetChartForIDGuaranteed(game, stat.chartID);

			const song = await GetSongForIDGuaranteed(game, chart.songID);

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

			const folder = await LoadFolderDocumentById(stat.folderID);

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
