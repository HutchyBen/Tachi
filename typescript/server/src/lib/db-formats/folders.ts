import DB from "#services/pg/db";
import { type Selection } from "kysely";
import { type MONGO_FolderDocument, V3ToGamePT } from "tachi-common";
import { type Database } from "tachi-db";

export const SELECT_FOLDER = [
	"folder.id",
	"folder.legacy_id",
	"folder.game",
	"folder.inactive",
	"folder.title",
	"folder.slug",
	"folder.where",
	"folder.search_terms",
] as const;

export function ToFolderDocument(
	row: Selection<Database, "folder", (typeof SELECT_FOLDER)[number]>,
): MONGO_FolderDocument {
	const { game, playtype } = V3ToGamePT(row.game);

	return {
		folderID: row.id,
		data: {
			$comment:
				"This data does not exist anymore, and you never should've been depending on it, anyway. This field is only here for backwards compatibility.",
		},
		game,
		inactive: row.inactive,
		playtype,
		searchTerms: row.search_terms ?? [],
		title: row.title,
		type: "charts",
	};
}

export async function LoadFolderDocumentById(
	folderID: string,
): Promise<MONGO_FolderDocument | undefined> {
	const row = await DB.selectFrom("folder")
		.select(SELECT_FOLDER)
		.where("id", "=", folderID)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	return ToFolderDocument(row);
}

export async function LoadFolderDocumentsByIds(
	folderIds: Array<string>,
): Promise<Map<string, MONGO_FolderDocument>> {
	if (folderIds.length === 0) {
		return new Map();
	}

	const rows = await DB.selectFrom("folder")
		.select(SELECT_FOLDER)
		.where("id", "in", folderIds)
		.execute();

	const out = new Map<string, MONGO_FolderDocument>();

	for (const row of rows) {
		out.set(row.id, ToFolderDocument(row));
	}

	return out;
}
