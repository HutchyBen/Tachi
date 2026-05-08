import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { ReadCollection, WriteCollection } from "../../util";

/**
 * BMS / PMS / USC chart `data.tableFolders`: migrate from Mongo-style
 * `[{ table, level }, …]` to `{ [table]: level }` so folder SQL can use
 * `chart.data->'tableFolders'->>'…'` (see `5-folders-to-sql-queries.ts`).
 *
 * Must run **before** `5-folders-to-sql-queries.ts`.
 */
const TABLEFOLDERS_OBJECT_CHART_COLLECTIONS = [
	"charts-bms-7k.json",
	"charts-bms-14k.json",
	"charts-pms-controller.json",
	"charts-pms-keyboard.json",
	"charts-usc-controller.json",
	"charts-usc-keyboard.json",
] as const;

/** Folder `game` values that use object-shaped `chart.data.tableFolders` after this script. */
const TABLEFOLDERS_OBJECT_GAMES = new Set([
	"bms-7k",
	"bms-14k",
	"pms-controller",
	"pms-keyboard",
	"usc-controller",
	"usc-keyboard",
]);

function sqlStr(value: string): string {
	return `'${value.replace(/'/gu, "''")}'`;
}

/**
 * `jsonb_array_elements` does not work on JSON objects - rewrite legacy elemMatch SQL
 * to key lookup (must match `5-folders-to-sql-queries.ts`).
 */
function rewriteFolderWhereTableFoldersElemExists(where: string): string | null {
	const pattern =
		/^EXISTS \(SELECT 1 FROM jsonb_array_elements\(chart\.data->'tableFolders'\) AS elem WHERE elem->>'level' = '((?:''|[^'])*)' AND elem->>'table' = '((?:''|[^'])*)'\)$/u;

	const m = where.match(pattern);

	if (!m) {
		return null;
	}

	const level = m[1].replace(/''/gu, "'");
	const table = m[2].replace(/''/gu, "'");

	return `(chart.data->'tableFolders'->>${sqlStr(table)}) = ${sqlStr(level)}`;
}

function tableFoldersArrayToObject(arr: unknown, chartId: string): Record<string, string> {
	if (!Array.isArray(arr)) {
		throw new Error(`chart ${chartId}: expected tableFolders array, got ${typeof arr}`);
	}

	const out: Record<string, string> = {};

	for (const row of arr) {
		if (row === null || typeof row !== "object") {
			continue;
		}

		const r = row as Record<string, unknown>;

		if (!("table" in r) || !("level" in r)) {
			throw new Error(
				`chart ${chartId}: tableFolders row must have table and level: ${JSON.stringify(row)}`,
			);
		}

		const table = String(r.table);
		const level = r.level;
		const levelStr =
			typeof level === "string" || typeof level === "number" || typeof level === "boolean"
				? String(level)
				: JSON.stringify(level);

		if (Object.hasOwn(out, table) && out[table] !== levelStr) {
			throw new Error(
				`chart ${chartId}: duplicate tableFolders table ${JSON.stringify(table)} with conflicting levels (${JSON.stringify(out[table])} vs ${JSON.stringify(levelStr)})`,
			);
		}

		out[table] = levelStr;
	}

	return out;
}

function transformTableFolders(data: Record<string, unknown>, chartId: string): boolean {
	const tf = data.tableFolders;

	if (tf === undefined) {
		return false;
	}

	if (tf !== null && typeof tf === "object" && !Array.isArray(tf)) {
		return false;
	}

	if (Array.isArray(tf)) {
		data.tableFolders = tableFoldersArrayToObject(tf, chartId);

		return true;
	}

	throw new Error(`chart ${chartId}: expected tableFolders array or object, got ${typeof tf}`);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const name of TABLEFOLDERS_OBJECT_CHART_COLLECTIONS) {
	const data = ReadCollection(name) as Array<Record<string, unknown>>;
	let modified = 0;

	for (const entry of data) {
		const chartId = String(entry.id ?? "?");
		const dataObj = entry.data as Record<string, unknown> | undefined;

		if (!dataObj || typeof dataObj !== "object") {
			continue;
		}

		if (transformTableFolders(dataObj, chartId)) {
			modified++;
		}
	}

	if (modified > 0) {
		WriteCollection(name, data);
		console.log(`${name}: converted tableFolders on ${modified} charts`);
	} else {
		console.log(`${name}: no tableFolders arrays to convert`);
	}
}

// ── folders.json: WHERE clauses that still use jsonb_array_elements on tableFolders ──

const FOLDERS_JSON = path.join(__dirname, "../../../../db/seeds/folders.json");
const folders = JSON.parse(fs.readFileSync(FOLDERS_JSON, "utf-8")) as Array<
	Record<string, unknown>
>;
let foldersRewritten = 0;

for (const entry of folders) {
	const game = entry.game;

	if (typeof game !== "string" || !TABLEFOLDERS_OBJECT_GAMES.has(game)) {
		continue;
	}

	const w = entry.where;

	if (typeof w !== "string") {
		continue;
	}

	const next = rewriteFolderWhereTableFoldersElemExists(w);

	if (next !== null) {
		entry.where = next;
		foldersRewritten++;
	}
}

if (foldersRewritten > 0) {
	fs.writeFileSync(FOLDERS_JSON, `${JSON.stringify(folders, null, "\t")}\n`);
	console.log(
		`folders.json: rewrote ${foldersRewritten} tableFolders WHERE clauses (array elem → object key lookup)`,
	);
} else {
	console.log(`folders.json: no tableFolders array-style WHERE clauses to rewrite`);
}
