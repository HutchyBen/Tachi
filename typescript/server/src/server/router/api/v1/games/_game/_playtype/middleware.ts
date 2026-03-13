import type { RequestHandler } from "express";

import { AssignToReqTachiData, GetTachiData } from "#utils/req-tachi-data";

import {
	type GameGroup,
	GetGameGroupConfig,
	type Playtype,
} from "tachi-common";

export const ValidatePlaytypeFromParam: RequestHandler = (req, res, next) => {
	const game = GetTachiData(req, "game");

	const gameConfig = GetGameGroupConfig(game);

	if (!gameConfig.playtypes.includes(req.params.playtype as Playtype)) {
		return res.status(400).json({
			success: false,
			description: `The playtype ${req.params.playtype} is not supported.`,
		});
	}

	AssignToReqTachiData(req, { playtype: req.params.playtype as Playtype });

	next();
};

export const ValidatePlaytypeFromParamFor =
	(game: GameGroup): RequestHandler =>
	(req, res, next) => {
		const gameConfig = GetGameGroupConfig(game);

		if (!gameConfig.playtypes.includes(req.params.playtype as Playtype)) {
			return res.status(400).json({
				success: false,
				description: `The playtype ${req.params.playtype} is not supported.`,
			});
		}

		AssignToReqTachiData(req, { playtype: req.params.playtype as Playtype });

		next();
	};
