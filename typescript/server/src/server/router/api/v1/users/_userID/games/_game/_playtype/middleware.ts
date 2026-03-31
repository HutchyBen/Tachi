import type { RequestHandler } from "express";

import { SELECT_GAME_PROFILE, ToGameStatsDocument } from "#lib/db-formats/game-profiles.js";
import DB from "#services/pg/db";
import { IsValidGame, IsValidPlaytype } from "#utils/misc";
import { AssignToReqTachiData, GetTachiData } from "#utils/req-tachi-data";
import { GamePTToV3 } from "tachi-common";

export const CheckUserPlayedGamePlaytype: RequestHandler = async (req, res, next) => {
	const user = GetTachiData(req, "requestedUser");

	const game = req.params.game;
	const playtype = req.params.playtype;

	if (game === undefined) {
		throw new Error(
			`Unexpected lack of game parameter when CheckUserPlayedGamePlaytype called on ${req.originalUrl}.`,
		);
	}

	if (playtype === undefined) {
		throw new Error(
			`Unexpected lack of playtype parameter when CheckUserPlayedGamePlaytype called on ${req.originalUrl}.`,
		);
	}

	if (!IsValidGame(game)) {
		return res.status(400).json({
			success: false,
			description: `The game ${req.params.game} is not supported.`,
		});
	}

	if (!IsValidPlaytype(game, playtype)) {
		return res.status(400).json({
			success: false,
			description: `The game ${game} does not have a playtype called ${playtype}.`,
		});
	}

	const v3Game = GamePTToV3(game, playtype);

	const row = await DB.selectFrom("game_profile")
		.select(SELECT_GAME_PROFILE)
		.where("user_id", "=", user.id)
		.where("game", "=", v3Game)
		.executeTakeFirst();

	if (!row) {
		return res.status(404).json({
			success: false,
			description: `The user ${user.username} has not played ${req.params.game} (${req.params.playtype})`,
		});
	}

	const stats = ToGameStatsDocument(row);

	AssignToReqTachiData(req, {
		requestedUserGameStats: stats,
		game,
		playtype,
	});

	next();
};
