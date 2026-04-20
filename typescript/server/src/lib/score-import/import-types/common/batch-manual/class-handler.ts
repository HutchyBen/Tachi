import type { ClassProvider } from "#lib/score-import/framework/calculated-data/types";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import { ClassToIndex } from "#utils/class";
import { type Classes, GetGameConfig, type V3Game } from "tachi-common";

// Note: This is tested by batch-manuals parser.test.ts.
export function CreateBatchManualClassProvider(
	outerGame: V3Game,
	classes: Partial<Record<Classes[V3Game], string | null>>,
): ClassProvider<V3Game> {
	return (game, _userID, _ratings, log) => {
		// TODO(zk): seems pointless? The game is already passed in.
		if (outerGame !== game) {
			return {};
		}

		const gameConfig = GetGameConfig(game);

		const newObj: Partial<Record<Classes[V3Game], string>> = {};

		for (const [s, classID] of Object.entries(classes)) {
			if (classID === null) {
				continue;
			}

			const set = s as Classes[V3Game];

			const index = ClassToIndex(game, set, classID);

			if (index === null) {
				log.warn(
					`User passed invalid class of ${classID} for set ${set}. Expected any of ${gameConfig.classes[
						set
					]!.values.map((e) => e.id).join(", ")}`,
				);

				throw new ScoreImportFatalError(
					400,
					`Invalid class of ${classID} for set ${set}. Expected any of ${gameConfig.classes[
						set
					]!.values.map((e) => e.id).join(", ")}`,
				);
			}

			newObj[set] = classID;
		}

		return newObj;
	};
}
