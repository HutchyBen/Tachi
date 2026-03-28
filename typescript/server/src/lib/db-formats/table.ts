import DB from "#services/pg/db";
import { toPgGame } from "#services/pg/seeds";
import { type Selectable } from "kysely";
import { type GameGroup, type Playtype, type TableDocument, V3ToGamePT } from "tachi-common";
import { type Database } from "tachi-db";

export type TableRow = Selectable<Database["table"]>;

export function ToTableDocument(row: TableRow, folderIds: Array<string>): TableDocument {
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

/**
 * Load table documents for a game/playtype (API shape). No folder *documents* — only folder IDs.
 */
export async function GetTableDocumentsForGamePlaytype(
	game: GameGroup,
	playtype: Playtype,
	includeInactive: boolean,
): Promise<Array<TableDocument>> {
	const pgGame = toPgGame(game, playtype);

	let q = DB.selectFrom("table").selectAll().where("game", "=", pgGame);

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
