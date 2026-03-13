import { log } from "#lib/log/log.js";
import db from "#services/mongo/db";
import { WrapScriptPromise } from "#utils/misc";
import { FormatUserDoc, ResolveUser } from "#utils/user";

import { UserAuthLevels } from "tachi-common";

const userID = process.argv[2];

async function MakeUserAdmin(userID: string) {
	const user = await ResolveUser(userID);

	if (!user) {
		log.error(`No such user '${userID}' exists.`);
		throw new Error(`No such user '${userID}' exists.`);
	}

	await db.users.update(
		{
			id: user.id,
		},
		{
			$set: {
				authLevel: UserAuthLevels.ADMIN,
			},
		},
	);

	log.info(`Made ${FormatUserDoc(user)} an administrator.`);
}

if (!userID) {
	log.error(`Usage: pnpm make-user-admin <userID>.`);
	throw new Error(`No userID provided.`);
}

if (require.main === module) {
	WrapScriptPromise(MakeUserAdmin(userID), log);
}
