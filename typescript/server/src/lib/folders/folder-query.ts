import type { Database } from "tachi-db";

import { log } from "#lib/log/log.js";
import { type Kysely, sql } from "kysely";

/**
 * Folder membership SQL (see tests in `folders.test.ts`).
 * Does not import the global `DB` module — safe for scripts that only set `POSTGRES_URL`.
 */
export async function BuildFolderQuery(folderID: string, db: Kysely<Database>) {
	const folder = await db
		.selectFrom("folder")
		.select(["folder.game", "folder.where", "folder.version_filter"])
		.where("folder.id", "=", folderID)
		.executeTakeFirst();

	if (!folder) {
		throw new Error(`Folder with ID '${folderID}' not found.`);
	}

	const interpolateWhereRaw = sql.raw(folder.where);

	// Folder rows are per-game, but `folder.where` often omits `chart.game` (e.g. only
	// `chart.level = '11'`). Restrict to this folder's game so scans use chart(game, level*).
	const gameScope = sql`AND chart.game = ${folder.game}`;

	// JOIN song so predicates can use `s.` (song-type folders from `4-folders-to-sql-queries.ts`).
	if (folder.version_filter) {
		const vf = folder.version_filter;

		return {
			folderQuery: sql`
				SELECT
					chart.id
				FROM
					chart
					INNER JOIN
						song
						ON song.id = chart.song_id
				WHERE
					${interpolateWhereRaw}
					${gameScope}

				AND chart.versions && ARRAY[${sql.join(vf.map((v) => sql`${v}`))}]::text[]
			`,
		};
	}

	return {
		folderQuery: sql`
			SELECT
				chart.id
			FROM
				chart
				INNER JOIN
					song
					ON song.id = chart.song_id
			WHERE
				${interpolateWhereRaw}
				${gameScope}
		`,
	};
}

export async function GetFolderChartIDs(folderID: string, db: Kysely<Database>) {
	const { folderQuery } = await BuildFolderQuery(folderID, db);

	try {
		const res = await folderQuery.execute(db);
		const rows = res.rows as Array<{ id: string }>;

		return rows.map((e) => e.id);
	} catch (err) {
		let compiledSql: string | undefined;
		let compiledParameters: unknown[] | undefined;
		try {
			const compiled = folderQuery.compile(db);
			compiledSql = compiled.sql;
			compiledParameters = Array.from(compiled.parameters);
		} catch (compileErr) {
			log.error(
				{ err, compileErr, folderId: folderID },
				"GetFolderChartIDs: failed while compiling query for error logging",
			);
		}

		log.error(
			{ err, folderId: folderID, sql: compiledSql, parameters: compiledParameters },
			"GetFolderChartIDs: folder chart query failed (e.g. during folder_chart_lookup rebuild)",
		);

		throw err;
	}
}
