import type { RequestHandler } from "express";

import { TachiConfig } from "#lib/setup/config";
import { IsEnabledGameGroup } from "#utils/misc";
import { REQ_AssignToReqTachiData } from "#utils/req-tachi-data";

export const ValidateGameFromParam: RequestHandler = (req, res, next) => {
	const game = req.params.game;

	if (game === undefined) {
		throw new Error(
			`Expected parameter of game when ValidateGameFromParam was called on ${req.originalUrl}.`,
		);
	}

	if (!IsEnabledGameGroup(game)) {
		return res.status(400).json({
			success: false,
			description: `Invalid/unsupported game ${
				req.params.game
			} - Expected any of ${TachiConfig.GAME_GROUPS.join(", ")}`,
		});
	}

	REQ_AssignToReqTachiData(req, { gameGroup: game });

	next();
};
