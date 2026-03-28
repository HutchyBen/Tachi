import type { integer } from "tachi-common";

import { ONE_DAY, ONE_HOUR } from "#lib/constants/time";
import { log } from "#lib/log/log";
import MONGODB_KILL from "#services/mongo/db";

/**
 * If a user has no ongoing import, enable the import lock and return true.
 * If a user has an ongoing import, return false.
 *
 * @param userID - The user this import lock is for.
 * @returns True if the lock was set successfully, false if the user already
 * has a lock.
 */
export async function CheckAndSetOngoingImportLock(userID: integer) {
	const lockExists = await MONGODB_KILL["import-locks"].findOne({
		userID,
	});

	if (!lockExists) {
		await MONGODB_KILL["import-locks"].insert({
			userID,
			locked: false,
			lockedAt: null,
		});
	} else if (lockExists.locked && lockExists.lockedAt! + ONE_DAY < Date.now()) {
		log.warn(`Removed import lock for ${userID} as it is ostensibly stuck.`);
		await MONGODB_KILL["import-locks"].update(
			{
				userID,
			},
			{
				$set: {
					locked: false,
					lockedAt: null,
				},
			},
		);
	}

	const lockWasSet = await MONGODB_KILL["import-locks"].findOneAndUpdate(
		{
			userID,
			locked: false,
		},
		{
			$set: { locked: true, lockedAt: Date.now() },
		},
	);

	if (!lockWasSet) {
		return true;
	}

	if (lockWasSet.lockedAt !== null) {
		if (Date.now() - lockWasSet.lockedAt > ONE_HOUR) {
			log.error(
				`User ${userID} has been locked for an hour. Automatically freeing the lock as they're stuck.`,
			);
			await UnsetOngoingImportLock(userID);
		}
	}

	return !lockWasSet;
}

/**
 * Disable a users import lock.
 */
export function UnsetOngoingImportLock(userID: integer) {
	return MONGODB_KILL["import-locks"].findOneAndUpdate(
		{
			userID,
			locked: true,
		},
		{
			$set: { locked: false, lockedAt: null },
		},
	);
}
