import { GetTableDocumentsForGamePlaytype } from "#lib/db-formats/table";
import { log } from "#lib/log/log";
import MONGODB_KILL from "#services/mongo/db";
import { GetFoldersFromTable } from "#utils/folder";
import { GetGPT, GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";
import { FormatGameGroup } from "tachi-common";

import { GetTableFromParam } from "./middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Return all the tables for this game.
 *
 * @param showInactive - If present, also show "inactive" tables.
 *
 * @name GET /api/v1/games/:game/:playtype/tables
 */
router.get("/", async (req, res) => {
	const { game, playtype } = GetGPT(req);

	const includeInactive = req.query.showInactive !== undefined;

	const tables = await GetTableDocumentsForGamePlaytype(game, playtype, includeInactive);

	if (tables.length === 0) {
		log.error(
			`The game ${FormatGameGroup(
				game,
				playtype,
			)} has no tables. This renders table support for the game broken!`,
		);
		return res.status(500).json({
			success: false,
			description: "This game has no tables.",
		});
	}

	return res.status(200).json({
		success: true,
		description: `Returned ${tables.length} tables.`,
		body: tables,
	});
});

/**
 * Return the folder documents that make up this table.
 *
 * @name GET /api/v1/games/:game/:playtype/tables/:tableID
 */
router.get("/:tableID", GetTableFromParam, async (req, res) => {
	const table = GetTachiData(req, "tableDoc");

	const folders = await GetFoldersFromTable(table);

	return res.status(200).json({
		success: true,
		description: `Returned ${folders.length} for table ${table.title}.`,
		body: {
			folders,
			table,
		},
	});
});

export default router;
