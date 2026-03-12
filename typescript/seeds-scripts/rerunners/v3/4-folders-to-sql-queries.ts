import { ReadCollection, WriteCollection } from "../../util";

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
 * Given a SQL expression and an operator object like { "~gte": 7, "~lt": 7.5 },
 * produce an array of SQL conditions (e.g. ["expr >= 7", "expr < 7.5"]).
 * The expression is cast to ::numeric when the values are numbers.
 * Also handles { "~in": [...] } → expr IN (...) and { "~not": {...} } → NOT (...).
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

			// Range / equality on a JSONB scalar
			const expr = `chart.data->>'${field}'`;

			if (typeof val === "object" && val !== null) {
				conds.push(...rangeConditions(expr, val as Record<string, unknown>));
			} else if (typeof val === "number") {
				conds.push(`${expr} = ${val}`);
			} else {
				conds.push(`${expr} = ${sqlStr(String(val))}`);
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
						...rangeConditions(
							`s.data->>'${field}'`,
							fieldVal as Record<string, unknown>,
						),
					);
				} else {
					conds.push(`s.data->>'${field}' = ${sqlStr(String(fieldVal))}`);
				}
			}

			continue;
		}

		throw new Error(`Unknown song filter key: ${key}`);
	}

	return conds.join(" AND ");
}

// ── Main ──────────────────────────────────────────────────────────────────────

const folders = ReadCollection("folders.json");

for (const entry of folders) {
	// if (entry.where) {
	// continue;
	// }
	//
	if (entry.type === "charts") {
		const { where, versionFilter } = convertChartFilter(entry.data as Record<string, unknown>);

		entry.where = where;

		if (versionFilter !== undefined) {
			entry.versionFilter = versionFilter;
		}
	} else if (entry.type === "songs") {
		entry.where = convertSongFilter(entry.data as Record<string, unknown>);
	} else if (entry.type === "static") {
		throw new Error("Static folders are no longer used.");
	} else {
		throw new Error(`Unknown folder type: ${entry.type}`);
	}
}

WriteCollection("folders.json", folders);
console.log(`folders.json: added "where" to ${folders.length} entries`);
