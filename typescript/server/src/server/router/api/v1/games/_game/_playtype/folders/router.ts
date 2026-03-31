import { GetFolderChartsAndSongs } from "#lib/folders/folders.js";
import { SearchFoldersForGameFtsAndTrgm } from "#lib/search/folders.js";
import { IsString } from "#utils/misc";
import { GetGPT, GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";

import { GetFolderFromParam } from "./middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Search the folders for this GPT.
 *
 * @param search - The query to search for.
 * @param inactive - Also show inactive folders, such as those on old versions.
 *
 * @name GET /api/v1/games/:game/:playtype/folders
 */
router.get("/", async (req, res) => {
	const { game, playtype } = GetGPT(req);

	if (!IsString(req.query.search)) {
		return res.status(400).json({
			success: false,
			description: `Invalid value for search.`,
		});
	}

	// If `inactive` is passed, include inactive folders; otherwise only active folders.
	const onlyActiveFolders = req.query.inactive === undefined;

	const folders = await SearchFoldersForGameFtsAndTrgm(game, playtype, req.query.search, {
		limit: 100,
		onlyActiveFolders,
	});

	return res.status(200).json({
		success: true,
		description: `Returned ${folders.length} folders.`,
		body: folders,
	});
});

/**
 * Get the folder at this ID, alongside its charts and songs.
 *
 * @name GET /api/v1/games/:game/:playtype/folders/:folderID
 */
router.get("/:folderID", GetFolderFromParam, async (req, res) => {
	const folder = GetTachiData(req, "folderDoc");

	const { songs, charts } = await GetFolderChartsAndSongs(folder);

	return res.status(200).json({
		success: true,
		description: `Returned data for folder ${folder.title}`,
		body: {
			songs,
			charts,
			folder,
		},
	});
});

export default router;
