import type { MiddlewareFn } from "#lib/router/typed-router";
import type { RequestHandler } from "express";

import { REQ_AssignToReqTachiData, REQ_GetTachiData } from "#utils/req-tachi-data";
import { ExpectedErr } from "bliss";
import {
	type GameGroup,
	GetGameGroupConfig,
	LEGACY_GameGroupPTToGame,
	type LEGACY_Playtype,
} from "tachi-common";

export const ValidatePlaytypeFromParam: RequestHandler = (req, res, next) => {
	const gameGroup = REQ_GetTachiData(req, "gameGroup");

	const gameConfig = GetGameGroupConfig(gameGroup);

	if (!gameConfig.playtypes.includes(req.params.playtype as LEGACY_Playtype)) {
		return res.status(400).json({
			success: false,
			description: `The playtype ${req.params.playtype} is not supported.`,
		});
	}

	const v3Game = LEGACY_GameGroupPTToGame(gameGroup, req.params.playtype as LEGACY_Playtype);

	REQ_AssignToReqTachiData(req, {
		playtype: req.params.playtype as LEGACY_Playtype,
		game: v3Game,
	});

	next();
};

/**
 * TypedRouter middleware: validates `:playtype` for a fixed game group and assigns
 * `playtype` plus the v3 `game` onto request tachi data.
 */
export const withPlaytypeParamFor =
	(game: GameGroup): MiddlewareFn =>
	async (req) => {
		const gameConfig = GetGameGroupConfig(game);
		const playtype = req.params.playtype as LEGACY_Playtype | undefined;

		if (!playtype || !gameConfig.playtypes.includes(playtype)) {
			throw new ExpectedErr(400, `The playtype ${playtype} is not supported.`);
		}

		const v3Game = LEGACY_GameGroupPTToGame(game, playtype);

		REQ_AssignToReqTachiData(req, {
			playtype,
			game: v3Game,
		});

		return {};
	};

export const ValidatePlaytypeFromParamFor =
	(game: GameGroup): RequestHandler =>
	(req, res, next) => {
		const gameConfig = GetGameGroupConfig(game);

		if (!gameConfig.playtypes.includes(req.params.playtype as LEGACY_Playtype)) {
			return res.status(400).json({
				success: false,
				description: `The playtype ${req.params.playtype} is not supported.`,
			});
		}

		const v3Game = LEGACY_GameGroupPTToGame(game, req.params.playtype as LEGACY_Playtype);

		REQ_AssignToReqTachiData(req, {
			playtype: req.params.playtype as LEGACY_Playtype,
			game: v3Game,
		});

		next();
	};
