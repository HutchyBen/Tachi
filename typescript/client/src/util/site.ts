import { TachiConfig } from "#lib/config";
import { GetGameGroupConfig } from "tachi-common";

export function GetSortedGPTs() {
	const arr = [];
	for (const game of TachiConfig.GAMES) {
		const gameConfig = GetGameGroupConfig(game);
		for (const playtype of gameConfig.playtypes) {
			arr.push({ game, playtype });
		}
	}

	return arr;
}
