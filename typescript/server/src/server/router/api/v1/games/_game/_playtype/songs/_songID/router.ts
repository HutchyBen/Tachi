import { GetChartsBySongPgId } from "#lib/db-formats/chart";
import { GetGPT, GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";
import { GamePTToV3 } from "tachi-common";

import { ValidateAndGetSong } from "./middleware";

const router: Router = Router({ mergeParams: true });

router.use(ValidateAndGetSong);

/**
 * Returns the song at this ID and its child chart documents.
 *
 * @name GET /api/v1/games/:game/:playtype/songs/:songID
 */
router.get("/", async (req, res) => {
	const song = GetTachiData(req, "songDoc");
	const songPgId = GetTachiData(req, "songPgId");
	const { game, playtype } = GetGPT(req);

	const charts = await GetChartsBySongPgId(GamePTToV3(game, playtype), songPgId, song.id);

	return res.status(200).json({
		success: true,
		description: `Returned ${charts.length} charts for song ${song.title}.`,
		body: {
			song,
			charts,
		},
	});
});

export default router;
