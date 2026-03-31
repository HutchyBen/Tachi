import { LoadFolderDocumentsByIds } from "#lib/db-formats/folders";
import {
	CountPbsOnChart,
	LoadPbsOnChartByRankAsc,
	LoadPbsOnChartForUserSearch,
} from "#lib/db-formats/pb";
import { GetSongByLegacyID } from "#lib/db-formats/song";
import { GetFolderIDsForChartId } from "#lib/folders/folders";
import { log } from "#lib/log/log";
import { SearchUsersRegExp } from "#lib/search/search";
import { IsString } from "#utils/misc";
import { GetTachiData } from "#utils/req-tachi-data";
import { apiSuccess } from "#utils/response";
import { ParseStrPositiveNonZeroInt } from "#utils/string-checks";
import { GetUsersWithIDs } from "#utils/user";
import { Router } from "express";
import {
	FormatChart,
	type MONGO_FolderDocument,
	type MONGO_PBScoreDocument,
	type MONGO_UserDocument,
	MongoChartLegacyId,
} from "tachi-common";

import { ValidateAndGetChart } from "./middleware";

const router: Router = Router({ mergeParams: true });

router.use(ValidateAndGetChart);

/**
 * Returns the chart (and the parent song) at this chart ID.
 *
 * @name GET /api/v1/games/:game/:playtype/charts/:chartID
 */
router.get("/", async (req, res) => {
	const chart = GetTachiData(req, "chartDoc");
	const game = GetTachiData(req, "game");

	const songRes = await GetSongByLegacyID(game, chart.songID);

	if (!songRes) {
		log.error(
			`Song ${chart.songID} does not exist, yet chart ${chart.chartID} has it as a parent?`,
		);

		return res.status(500).json({
			success: false,
			description: `An internal server error has occured.`,
		});
	}

	const song = songRes.doc;

	return res.status(200).json({
		success: true,
		description: `Returned ${FormatChart(game, song, chart)}.`,
		body: {
			song,
			chart,
		},
	});
});

/**
 * Returns any folders that contain this chart.
 *
 * @param inactive - Also include inactive folders.
 *
 * @name GET /api/v1/games/:game/:playtype/charts/:chartID/folders
 */
router.get("/folders", async (req, res) => {
	const chart = GetTachiData(req, "chartDoc");

	const folderIds = await GetFolderIDsForChartId(chart.chartID);
	const byId = await LoadFolderDocumentsByIds(folderIds);
	let folders = folderIds
		.map((id) => byId.get(id))
		.filter((f): f is MONGO_FolderDocument => f !== undefined);

	if (req.query.inactive === undefined) {
		folders = folders.filter((f) => !f.inactive);
	}

	return res.status(200).json({
		success: true,
		description: `Found ${folders.length} folders that contain this chart.`,
		body: folders,
	});
});

/**
 * Returns the total amount of unique players that have played this chart.
 *
 * @name GET /api/v1/games/:game/:playtype/charts/:chartID/playcount
 */
router.get("/playcount", async (req, res) => {
	const chart = GetTachiData(req, "chartDoc");

	const count = await CountPbsOnChart(chart.chartID);

	return res.status(200).json({
		success: true,
		description: `Counted scores for chart.`,
		body: {
			count,
		},
	});
});

/**
 * Returns the personal bests for this chart in batches of 100.
 * These are returned sorted by their ranking.
 *
 * @param startRanking - The ranking to start iterating from - defaults to 1.
 *
 * @name GET /api/v1/games/:game/:playtype/charts/:chartID/pbs
 */
router.get("/pbs", async (req, res) => {
	const chart = GetTachiData(req, "chartDoc");

	const startRanking = ParseStrPositiveNonZeroInt(req.query.startRanking) ?? 1;

	const pbs = await LoadPbsOnChartByRankAsc(MongoChartLegacyId(chart), startRanking, 100);

	const users = await GetUsersWithIDs(pbs.map((e) => e.userID));

	return res.status(200).json({
		success: true,
		description: `Returned ${pbs.length} scores.`,
		body: {
			pbs,
			users,
		},
	});
});

/**
 * Searches the PBs on this chart for the given user(s).
 *
 * @param search - The user to search for
 *
 * @name GET /api/v1/games/:game/:playtype/charts/:chartID/pbs/search
 */
router.get("/pbs/search", async (req, res) => {
	const chart = GetTachiData(req, "chartDoc");

	if (!IsString(req.query.search)) {
		return res.status(400).json({
			success: false,
			description: `Invalid parameter for search.`,
		});
	}

	const users = await SearchUsersRegExp(req.query.search);

	const pbs = await LoadPbsOnChartForUserSearch(MongoChartLegacyId(chart), req.query.search);

	return res.status(200).json(
		apiSuccess<{ pbs: Array<MONGO_PBScoreDocument>; users: Array<MONGO_UserDocument> }>(
			`Returned ${pbs.length} scores.`,
			{
				pbs,
				users,
			},
		),
	);
});

export default router;
