import { TachiConfig } from "#lib/setup/config";
import { Router } from "express";
import { GetGameGroupConfig } from "../../../../../../../common/src";

import gameSpecificRoutes from "./@gameSpecificRoutes/router";
import gameRouter from "./_game/router";

const router: Router = Router({ mergeParams: true });

/**
 * Declares the supported games for this version of tachi.
 * Not sure if this endpoint has any purpose, to be honest.
 *
 * @name GET /api/v1/games
 */
router.get("/", (req, res) => {
	// this line is a bit too 'smart' for its own good, but whatever.
	const configs = Object.fromEntries(TachiConfig.GAMES.map((e) => [e, GetGameGroupConfig(e)]));

	return res.status(200).json({
		success: true,
		description: `Returned support information for ${TachiConfig.GAMES.length} game(s).`,
		body: {
			supportedGames: TachiConfig.GAMES,
			configs,
		},
	});
});

router.use("/:game", gameRouter);

// These routes are mounted at /api/v1/games and add things that are game specific,
// such as /bms/7K/tables/sieglindeEC. Simple enough.
router.use("/", gameSpecificRoutes);

export default router;
