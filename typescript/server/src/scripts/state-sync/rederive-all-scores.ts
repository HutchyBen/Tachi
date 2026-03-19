import { log } from "#lib/log/log.js";
import UpdateScore from "#lib/score-mutation/update-score";
import MONGODB_KILL from "#services/mongo/db";
import { UpdateAllPBs } from "#utils/calculations/recalc-scores";
import { EfficientDBIterate } from "#utils/efficient-db-iterate";

/**
 * Effectively, rerun CalculateData and DeriveMetrics on all scores.
 */
async function main() {
	await EfficientDBIterate(
		MONGODB_KILL.scores,
		async (score) => {
			// @ts-expect-error just incase
			delete score._id;

			try {
				await UpdateScore(
					score,
					// although this seems like a no-op, this actually results
					// in a safe re-derivation of the existing score.
					score,
					undefined,
					true, // skipUpdatingPBs because we'll do it after
					// all scores are guaranteeably correct.
				);
			} catch (err) {
				log.warn(err);
				log.warn("Continuing through the error.");
			}
		},
		// no-op

		async () => void 0,
		{},
		10000,
	);

	await UpdateAllPBs();
}

if (require.main === module) {
	void main().then(() => process.exit(0));
}
