import { log } from "#lib/log/log";
import { RecalcAllScores, UpdateAllPBs } from "#utils/calculations/recalc-scores";
import { RecalcSessions } from "#utils/calculations/recalc-sessions";

import { RecalcGameProfiles } from "./recalc-game-profiles";

(async () => {
	// note: technically some of this stuff is unecessary/duplicate calculation
	// however it's idempotent, so, we should be good.
	await RecalcAllScores();
	await UpdateAllPBs();
	await RecalcGameProfiles();
	await RecalcSessions();

	log.info(`Completely done!`);
	process.exit(0);
})().catch((err: unknown) => {
	log.error({ err }, `Failed to sync state.`);
	process.exit(1);
});
