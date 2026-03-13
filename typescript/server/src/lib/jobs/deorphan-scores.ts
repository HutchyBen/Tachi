// Attempt to deoprhan lost scores.

import { log } from "#lib/logger/log.js";
import { DeorphanScores } from "#lib/score-import/framework/orphans/orphans";
import { WrapScriptPromise } from "#utils/misc";

export async function DeorphanScoresMain() {
	const { success, failed, removed } = await DeorphanScores({}, logger);

	log.info(`Finished attempting deorphaning.`);

	log.info(`Success: ${success} | Failed ${failed} | Removed ${removed}.`);
}

if (require.main === module) {
	WrapScriptPromise(DeorphanScoresMain(), logger);
}
