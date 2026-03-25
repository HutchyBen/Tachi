import type { RequestHandler } from "express";

import DB from "#services/pg/db.js";
import { sql } from "kysely";

export const UpdateLastSeen: RequestHandler = (req, _res, next) => {
	if (req.session.tachi?.user.id === undefined) {
		next();
		return;
	}

	if (req.session.tachi.settings.preferences.invisible) {
		next();
		return;
	}

	// fire, but we have no reason to await it.
	void DB.updateTable("account")
		.set({
			last_seen: sql`NOW()`,
		})
		.where("id", "=", req.session.tachi.user.id)
		.execute();

	next();
};
