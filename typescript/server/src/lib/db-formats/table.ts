import DB from "#services/pg/db";
import { toPgGame } from "#services/pg/seeds";
import { type Selection } from "kysely";
import { type GameGroup, type MONGO_TableDocument, type Playtype, V3ToGamePT } from "tachi-common";
import { type Database } from "tachi-db";

export const SELECT_TABLE = [
	"table.id",
	"table.legacy_id",
	"table.game",
	"table.inactive",
	"table.title",
	"table.default_value",
	"table.slug",
] as const;

export type TableRow = Selection<Database, "table", (typeof SELECT_TABLE)[number]>;

export function ToTableDocument(row: TableRow, folderIds: Array<string>): MONGO_TableDocument {
	const { game, playtype } = V3ToGamePT(row.game);

	return {
		tableID: row.legacy_id,
		game,
		playtype,
		title: row.title,
		description: "",
		folders: folderIds,
		inactive: row.inactive,
		default: row.default_value,
	};
}

async function tableRowToDocumentWithFolders(row: TableRow): Promise<MONGO_TableDocument> {
	const tfRows = await DB.selectFrom("table_folder")
		.select("folder_id")
		.where("table_id", "=", row.id)
		.execute();

	return ToTableDocument(
		row,
		tfRows.map((t) => t.folder_id),
	);
}

/**
 * Load table documents for a game/playtype (API shape). No folder *documents* — only folder IDs.
 */
export async function GetTableDocumentsForGamePlaytype(
	game: GameGroup,
	playtype: Playtype,
	includeInactive: boolean,
): Promise<Array<MONGO_TableDocument>> {
	const pgGame = toPgGame(game, playtype);

	let q = DB.selectFrom("table").select(SELECT_TABLE).where("game", "=", pgGame);

	if (!includeInactive) {
		q = q.where("inactive", "=", false);
	}

	const rows = await q.execute();

	if (rows.length === 0) {
		return [];
	}

	const tableIds = rows.map((r) => r.id);

	const tfRows = await DB.selectFrom("table_folder")
		.select(["table_id", "folder_id"])
		.where("table_id", "in", tableIds)
		.execute();

	const foldersByTable = new Map<string, Array<string>>();

	for (const t of tfRows) {
		const list = foldersByTable.get(t.table_id) ?? [];

		list.push(t.folder_id);
		foldersByTable.set(t.table_id, list);
	}

	return rows.map((row) => ToTableDocument(row, foldersByTable.get(row.id) ?? []));
}

/**
 * Load one table by API `tableID` (`table.legacy_id`), with folder ids from `table_folder`
 * (same join pattern as {@link GetTableDocumentsForGamePlaytype}).
 */
export async function LoadTableDocumentByLegacyId(
	legacyId: string,
): Promise<MONGO_TableDocument | undefined> {
	const row = await DB.selectFrom("table")
		.select(SELECT_TABLE)
		.where("legacy_id", "=", legacyId)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	return tableRowToDocumentWithFolders(row);
}

/**
 * Load one table by API `tableID` for a specific game playtype route (matches Mongo
 * `tables.findOne({ tableID, game, playtype })`).
 */
export async function LoadTableDocumentByLegacyIdForGamePlaytype(
	legacyId: string,
	game: GameGroup,
	playtype: Playtype,
): Promise<MONGO_TableDocument | undefined> {
	const pgGame = toPgGame(game, playtype);

	const row = await DB.selectFrom("table")
		.select(SELECT_TABLE)
		.where("legacy_id", "=", legacyId)
		.where("game", "=", pgGame)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	return tableRowToDocumentWithFolders(row);
}
