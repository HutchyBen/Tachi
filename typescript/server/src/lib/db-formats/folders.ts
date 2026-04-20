import DB from "#services/pg/db";
import { type Selection } from "kysely";
import { type FolderDocument, type V3Game } from "tachi-common";
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
): FolderDocument {
	return {
		folderID: row.id,
		slug: row.slug,
		data: {
			$comment:
				"This data does not exist anymore, and you never should've been depending on it, anyway. This field is only here for backwards compatibility.",
		},
		game: row.game,
		inactive: row.inactive,
		searchTerms: row.search_terms ?? [],
		title: row.title,
		type: "charts",
	};
}

export async function LoadFolderDocumentById(
	folderID: string,
): Promise<FolderDocument | undefined> {
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
): Promise<Map<string, FolderDocument>> {
	if (folderIds.length === 0) {
		return new Map();
	}

	const rows = await DB.selectFrom("folder")
		.select(SELECT_FOLDER)
		.where("id", "in", folderIds)
		.execute();

	const out = new Map<string, FolderDocument>();

	for (const row of rows) {
		out.set(row.id, ToFolderDocument(row));
	}

	return out;
}

export async function LoadFolderDocumentByGameAndSlug(
	game: V3Game,
	slug: string,
): Promise<FolderDocument | undefined> {
	const row = await DB.selectFrom("folder")
		.select(SELECT_FOLDER)
		.where("game", "=", game)
		.where("slug", "=", slug)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	return ToFolderDocument(row);
}

/**
 * Loads folders by slug for one game; map keys are **slug** (not id).
 */
export async function LoadFolderDocumentsByGameAndSlugs(
	game: V3Game,
	slugs: Array<string>,
): Promise<Map<string, FolderDocument>> {
	if (slugs.length === 0) {
		return new Map();
	}

	const rows = await DB.selectFrom("folder")
		.select(SELECT_FOLDER)
		.where("game", "=", game)
		.where("slug", "in", slugs)
		.execute();

	const out = new Map<string, FolderDocument>();

	for (const row of rows) {
		out.set(row.slug, ToFolderDocument(row));
	}

	return out;
}
