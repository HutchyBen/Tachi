import { type MONGO_FolderDocument } from "tachi-common";
import { type Database } from "tachi-db";

export const SELECT_FOLDER = [] as const;

export function ToFolderDocument(
	row: Selection<Database, "folder", (typeof SELECT_FOLDER)[number]>,
): MONGO_FolderDocument {
	return {
		folderID: row.id,
		legacyID: row.legacy_id,
		game: row.game,
		inactive: row.inactive,
		title: row.title,
		slug: row.slug,
		query: row.query,
		data,
		playtype,
		searchTerms,
		type,
	};
}
