import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sqlStr(value: string): string {
	// Escape single quotes for SQL string literals.
	return `'${value.replace(/'/gu, "''")}'`;
}

const RANGE_OPS: Record<string, string> = {
	"~gte": ">=",
	"~gt": ">",
	"~lt": "<",
	"~lte": "<=",
};

/**
 * Range / inequality on `chart.data->>'field'` or `song.data->>'field'`.
 * `->>` returns text; compare to numbers with `::numeric` or Postgres errors (e.g. text >= int).
 */
function rangeConditions(expr: string, ops: Record<string, unknown>): Array<string> {
	const conds: Array<string> = [];

	for (const [op, val] of Object.entries(ops)) {
		if (op === "~in") {
			if (!Array.isArray(val)) {
				throw new Error(`~in value must be an array, got: ${JSON.stringify(val)}`);
			}

			const list = val.map((v: unknown) => sqlStr(String(v))).join(", ");

			conds.push(`${expr} IN (${list})`);
			continue;
		}

		if (op === "~not") {
			if (typeof val !== "object" || val === null) {
				throw new Error(
					`~not value must be an operator object, got: ${JSON.stringify(val)}`,
				);
			}

			const inner = rangeConditions(expr, val as Record<string, unknown>);

			conds.push(`NOT (${inner.join(" AND ")})`);
			continue;
		}

		const sqlOp = RANGE_OPS[op];

		if (!sqlOp) {
			throw new Error(`Unknown operator: ${op}`);
		}

		if (typeof val === "number") {
			conds.push(`${expr} ${sqlOp} ${val}`);
		} else {
			conds.push(`${expr} ${sqlOp} ${sqlStr(String(val))}`);
		}
	}

	return conds;
}

/**
 * JSONB `data->>'field'` is text. For numeric comparisons, use `::numeric` on the LHS.
 * `~in` stays as text equality to string literals.
 */
function rangeConditionsJsonField(
	tableAlias: "chart" | "song",
	field: string,
	ops: Record<string, unknown>,
): Array<string> {
	const alias = tableAlias === "chart" ? "chart" : "s";
	const textExpr = `${alias}.data->>'${field}'`;
	const numExpr = `(${alias}.data->>'${field}')::numeric`;
	const conds: Array<string> = [];

	for (const [op, val] of Object.entries(ops)) {
		if (op === "~in") {
			if (!Array.isArray(val)) {
				throw new Error(`~in value must be an array, got: ${JSON.stringify(val)}`);
			}

			const list = val.map((v: unknown) => sqlStr(String(v))).join(", ");

			conds.push(`${textExpr} IN (${list})`);
			continue;
		}

		if (op === "~not") {
			if (typeof val !== "object" || val === null) {
				throw new Error(
					`~not value must be an operator object, got: ${JSON.stringify(val)}`,
				);
			}

			const inner = rangeConditionsJsonField(
				tableAlias,
				field,
				val as Record<string, unknown>,
			);

			conds.push(`NOT (${inner.join(" AND ")})`);
			continue;
		}

		const sqlOp = RANGE_OPS[op];

		if (!sqlOp) {
			throw new Error(`Unknown operator: ${op}`);
		}

		if (typeof val === "number") {
			conds.push(`${numExpr} ${sqlOp} ${val}`);
		} else {
			conds.push(`${numExpr} ${sqlOp} ${sqlStr(String(val))}`);
		}
	}

	return conds;
}

// ── Chart filter ──────────────────────────────────────────────────────────────

const CHART_FIELD_MAP: Record<string, string> = {
	level: "chart.level",
	levelNum: "chart.level_num",
	difficulty: "chart.difficulty",
	isPrimary: "chart.is_primary",
};

interface ChartFilterResult {
	where: string;
	versionFilter: Array<string> | undefined;
}

function convertChartFilter(data: Record<string, unknown>): ChartFilterResult {
	const conds: Array<string> = [];
	let versionFilter: Array<string> | undefined;

	for (const [key, val] of Object.entries(data)) {
		// ── versions → extracted to versionFilter, not inlined into where ────
		if (key === "versions") {
			if (typeof val === "string") {
				versionFilter = [val];
			} else if (Array.isArray(val)) {
				versionFilter = val.map(String);
			} else {
				throw new Error(`Unexpected value for "versions": ${JSON.stringify(val)}`);
			}

			continue;
		}

		// ── data¬field (path into JSONB data column) ──────────────────────────
		if (key.includes("\u00ac")) {
			const [, field] = key.split("\u00ac");

			if (!field) {
				throw new Error(`Malformed data¬ key: ${key}`);
			}

			// elemMatch → EXISTS over jsonb_array_elements
			if (typeof val === "object" && val !== null && "~elemMatch" in val) {
				const match = (val as Record<string, unknown>)["~elemMatch"];

				if (typeof match !== "object" || match === null) {
					throw new Error(
						`~elemMatch value must be an object, got: ${JSON.stringify(match)}`,
					);
				}

				const elemConds = Object.entries(match as Record<string, unknown>).map(
					([k, v]) => `elem->>'${k}' = ${sqlStr(String(v))}`,
				);

				conds.push(
					`EXISTS (SELECT 1 FROM jsonb_array_elements(chart.data->'${field}') AS elem WHERE ${elemConds.join(
						" AND ",
					)})`,
				);
				continue;
			}

			// Range / equality on a JSONB scalar (text extract → cast for numeric compares)
			if (typeof val === "object" && val !== null) {
				conds.push(
					...rangeConditionsJsonField("chart", field, val as Record<string, unknown>),
				);
			} else if (typeof val === "number") {
				conds.push(`(chart.data->>'${field}')::numeric = ${val}`);
			} else {
				conds.push(`chart.data->>'${field}' = ${sqlStr(String(val))}`);
			}

			continue;
		}

		// ── mapped top-level chart columns ────────────────────────────────────
		const col = CHART_FIELD_MAP[key];

		if (col) {
			if (typeof val === "object" && val !== null) {
				conds.push(...rangeConditions(col, val as Record<string, unknown>));
			} else if (typeof val === "boolean") {
				conds.push(`${col} = ${val}`);
			} else if (typeof val === "number") {
				conds.push(`${col} = ${val}`);
			} else {
				conds.push(`${col} = ${sqlStr(String(val))}`);
			}

			continue;
		}

		throw new Error(`Unknown chart filter key: ${key}`);
	}

	return { where: conds.join(" AND "), versionFilter };
}

// ── Song filter ───────────────────────────────────────────────────────────────

function convertSongFilter(data: Record<string, unknown>): string {
	const conds: Array<string> = [];

	for (const [key, val] of Object.entries(data)) {
		// The one observed pattern: { "data": { "genre": "LUNATIC" } }
		// "data" refers to the song's JSONB data column.
		if (key === "data") {
			if (typeof val !== "object" || val === null) {
				throw new Error(
					`Expected object for song "data" filter, got: ${JSON.stringify(val)}`,
				);
			}

			for (const [field, fieldVal] of Object.entries(val as Record<string, unknown>)) {
				if (typeof fieldVal === "object" && fieldVal !== null) {
					conds.push(
						...rangeConditionsJsonField(
							"song",
							field,
							fieldVal as Record<string, unknown>,
						),
					);
				} else if (typeof fieldVal === "number") {
					conds.push(`(song.data->>'${field}')::numeric = ${fieldVal}`);
				} else {
					conds.push(`song.data->>'${field}' = ${sqlStr(String(fieldVal))}`);
				}
			}

			continue;
		}

		throw new Error(`Unknown song filter key: ${key}`);
	}

	return conds.join(" AND ");
}

/** When `type` is omitted, song filters are the only shape whose sole top-level key is `data`. */
function inferFolderKindFromFilterData(data: Record<string, unknown>): "charts" | "songs" {
	const keys = Object.keys(data);

	if (keys.length === 1 && keys[0] === "data") {
		return "songs";
	}

	return "charts";
}

// ── Main ──────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOLDERS_JSON = path.join(__dirname, "../../../../db/seeds/folders.json");

const folders = JSON.parse(fs.readFileSync(FOLDERS_JSON, "utf-8")) as Array<
	Record<string, unknown>
>;

for (const entry of folders) {
	const filterData = entry.data as Record<string, unknown> | undefined;

	if (filterData === undefined) {
		if (typeof entry.where !== "string" || entry.where.trim() === "") {
			throw new Error(
				`Folder ${String(entry.id ?? "?")} has no "data" and no non-empty "where".`,
			);
		}

		delete entry.type;
		continue;
	}

	if (Array.isArray(filterData)) {
		throw new Error("Static folders are no longer used.");
	}

	const dataObj = filterData as Record<string, unknown>;
	const explicitType = entry.type as string | undefined;

	let kind: "charts" | "songs";

	if (explicitType === "charts" || explicitType === "songs") {
		kind = explicitType;
	} else if (explicitType === "static") {
		throw new Error("Static folders are no longer used.");
	} else if (explicitType === undefined) {
		kind = inferFolderKindFromFilterData(dataObj);
	} else {
		throw new Error(`Unknown folder type: ${String(explicitType)}`);
	}

	if (kind === "charts") {
		const { where, versionFilter } = convertChartFilter(dataObj);

		entry.where = where;

		if (versionFilter !== undefined) {
			entry.versionFilter = versionFilter;
		}
	} else {
		entry.where = convertSongFilter(dataObj);
	}

	delete entry.data;
	delete entry.type;
}

fs.writeFileSync(FOLDERS_JSON, `${JSON.stringify(folders, null, "\t")}\n`);
console.log(`Wrote ${FOLDERS_JSON} (${folders.length} folders).`);
