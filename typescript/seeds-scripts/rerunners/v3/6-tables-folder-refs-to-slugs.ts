/**
 * Rewrites `tables.json` so each `folders[]` entry is a folder **slug** (per game),
 * not a hex folder id. Run after `5-folders-to-sql-queries.ts` (folders must have
 * `where` and `slug`).
 *
 * Idempotent: if an entry is already a slug for that game, it is left unchanged.
 */

import fs from "fs";
import path from "path";
import { computeFolderSlug, type SeedFolderRow } from "tachi-common";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = path.join(__dirname, "../../../../db/seeds");

function resolvedFolderSlug(f: {
	game: string;
	id: string;
	slug?: string;
	title: string;
	versionFilter?: Array<string>;
	where: string;
}): string {
	if (f.slug !== undefined && f.slug !== "") {
		return f.slug;
	}

	return computeFolderSlug({
		game: f.game,
		id: f.id,
		title: f.title,
		where: f.where,
		versionFilter: f.versionFilter,
	} as SeedFolderRow);
}

const foldersPath = path.join(SEEDS, "folders.json");
const tablesPath = path.join(SEEDS, "tables.json");

const folders = JSON.parse(fs.readFileSync(foldersPath, "utf-8")) as Array<{
	game: string;
	id: string;
	slug?: string;
	title: string;
	versionFilter?: Array<string>;
	where: string;
}>;

const idToSlug = new Map<string, string>();
const slugByGame = new Map<string, Set<string>>();

for (const f of folders) {
	const slug = resolvedFolderSlug(f);

	idToSlug.set(f.id, slug);

	const set = slugByGame.get(f.game) ?? new Set<string>();

	set.add(slug);
	slugByGame.set(f.game, set);
}

const tables = JSON.parse(fs.readFileSync(tablesPath, "utf-8")) as Array<{
	folders: Array<string>;
	game: string;
	id: string;
	title: string;
}>;

for (const t of tables) {
	const validSlugs = slugByGame.get(t.game);

	if (validSlugs === undefined) {
		throw new Error(`Table "${t.title}": no folders for game ${JSON.stringify(t.game)}`);
	}

	t.folders = t.folders.map((ref, i) => {
		const asSlug = idToSlug.get(ref);

		if (asSlug !== undefined) {
			return asSlug;
		}

		if (validSlugs.has(ref)) {
			return ref;
		}

		throw new Error(
			`Table "${t.title}" (${t.id}): folders[${i}] = ${JSON.stringify(ref)} is neither a known folder id nor a slug for game ${JSON.stringify(t.game)}`,
		);
	});
}

fs.writeFileSync(tablesPath, `${JSON.stringify(tables, null, "\t")}\n`);
console.log(`Wrote ${tablesPath} (${tables.length} tables; folder refs are slugs).`);
