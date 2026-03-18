import type { RequestHandler } from "express";

import db from "#services/mongo/db";

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
	void db.users.update(
		{ id: req.session.tachi.user.id },
		{
			$set: {
				lastSeen: Date.now(),
			},
		},
	);

	next();
};
