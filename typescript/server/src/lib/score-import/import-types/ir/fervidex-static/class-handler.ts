import type { ClassProvider } from "#lib/score-import/framework/calculated-data/types";

import type { integer } from "tachi-common";

import { IIDXDans } from "tachi-common/config/game-support/iidx";

export function CreateFerStaticClassProvider(body: Record<string, unknown>): ClassProvider {
	return (gptString, userID, ratings, log) => {
		let index;

		if (gptString === "iidx:SP") {
			index = body.sp_dan;
		} else if (gptString === "iidx:DP") {
			index = body.dp_dan;
		} else {
			log.warn(
				`Invalid gptString ${gptString} passed to FerStaticClassProvider. Attempting to continue.`,
			);
			return;
		}

		if (index === undefined) {
			return;
		}

		if (!Number.isInteger(index)) {
			log.info({ body }, `received invalid fer-static class of ${index} (${gptString}).`);
			return;
		}

		const dan = IIDXDans[index as integer];

		if (!dan) {
			log.warn(`Invalid fer-static class of ${index}. Skipping.`);
			return;
		}

		return {
			dan: dan.id,
		};
	};
}
