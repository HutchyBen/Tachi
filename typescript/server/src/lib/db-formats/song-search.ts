import type { GameGroup } from "tachi-common";

import DB from "#services/pg/db";
import { EscapeForILIKE } from "#utils/misc";
import { sql } from "kysely";

/** Hard cap on song hits per `game_group` (FTS + trgm combined). */
export const MAX_SONG_SEARCH_RESULTS_PER_GAME = 100;

/** Use trigram / ILIKE supplement when the query is this short or FTS returns nothing. */
const SHORT_QUERY_LEN = 3;

export type SongSearchRow = {
	artist: string;
	data: unknown;
	id: string;
	legacy_id: number;
	rank: number;
	title: string;
};

/**
 * Indexed song search: PostgreSQL FTS (tsvector) plus optional pg_trgm / ILIKE fallback
 * (Zenith-style — no full-table load, no huge IN lists).
 */
export async function SearchSongsForGameFtsAndTrgm(
	game: GameGroup,
	search: string,
	limit: number,
): Promise<Array<SongSearchRow>> {
	const q = search.trim();

	if (q.length === 0) {
		return [];
	}

	const cap = Math.min(Math.max(1, limit), MAX_SONG_SEARCH_RESULTS_PER_GAME);

	const { rows: ftsRows } = await sql<SongSearchRow>`
		SELECT
			id,
			legacy_id,
			title,
			artist,
			data,
			(ts_rank_cd(textsearch, websearch_to_tsquery('simple', ${q})))::float8 AS rank
		FROM song
		WHERE game_group = ${game}
			AND textsearch @@ websearch_to_tsquery('simple', ${q})
		ORDER BY rank DESC
		LIMIT ${cap}
	`.execute(DB);

	const needTrgm =
		ftsRows.length < cap && (q.length <= SHORT_QUERY_LEN || ftsRows.length === 0);

	if (!needTrgm) {
		return ftsRows;
	}

	const excludeIds = ftsRows.map((r) => r.id);
	const trgmLimit = cap - ftsRows.length;
	const likeEsc = EscapeForILIKE(q.toLowerCase());
	const pat = `%${likeEsc}%`;

	const { rows: trgmRows } =
		excludeIds.length === 0
			? await sql<SongSearchRow>`
				SELECT
					id,
					legacy_id,
					title,
					artist,
					data,
					GREATEST(
						similarity(lower(title), lower(${q})),
						similarity(lower(artist), lower(${q})),
						similarity(lower(fts_document), lower(${q}))
					)::float8 AS rank
				FROM song
				WHERE game_group = ${game}
					AND (
						title ILIKE ${pat}
						OR artist ILIKE ${pat}
						OR fts_document ILIKE ${pat}
					)
				ORDER BY rank DESC
				LIMIT ${trgmLimit}
			`.execute(DB)
			: await sql<SongSearchRow>`
				SELECT
					id,
					legacy_id,
					title,
					artist,
					data,
					GREATEST(
						similarity(lower(title), lower(${q})),
						similarity(lower(artist), lower(${q})),
						similarity(lower(fts_document), lower(${q}))
					)::float8 AS rank
				FROM song
				WHERE game_group = ${game}
					AND id NOT IN (${sql.join(excludeIds)})
					AND (
						title ILIKE ${pat}
						OR artist ILIKE ${pat}
						OR fts_document ILIKE ${pat}
					)
				ORDER BY rank DESC
				LIMIT ${trgmLimit}
			`.execute(DB);

	const byId = new Map<string, SongSearchRow>();

	for (const r of ftsRows) {
		byId.set(r.id, r);
	}

	for (const r of trgmRows) {
		const existing = byId.get(r.id);

		if (!existing || r.rank > existing.rank) {
			byId.set(r.id, r);
		}
	}

	return [...byId.values()].sort((a, b) => b.rank - a.rank).slice(0, cap);
}

/**
 * Loads search_term and alt_title rows for a bounded set of song PKs (e.g. search hits).
 */
export async function LoadSongChildrenForPgIds(
	songIds: string[],
): Promise<Map<string, { altTitles: string[]; searchTerms: string[] }>> {
	if (songIds.length === 0) {
		return new Map();
	}

	const [searchTermRows, altTitleRows] = await Promise.all([
		DB.selectFrom("song_search_term")
			.select(["song_id", "search_term"])
			.where("song_id", "in", songIds)
			.execute(),
		DB.selectFrom("song_alt_title")
			.select(["song_id", "alt_title"])
			.where("song_id", "in", songIds)
			.execute(),
	]);

	const termsBySong = new Map<string, string[]>();
	const altsBySong = new Map<string, string[]>();

	for (const r of searchTermRows) {
		let list = termsBySong.get(r.song_id);

		if (!list) {
			list = [];
			termsBySong.set(r.song_id, list);
		}

		list.push(r.search_term);
	}

	for (const r of altTitleRows) {
		let list = altsBySong.get(r.song_id);

		if (!list) {
			list = [];
			altsBySong.set(r.song_id, list);
		}

		list.push(r.alt_title);
	}

	const out = new Map<string, { altTitles: string[]; searchTerms: string[] }>();

	for (const id of songIds) {
		out.set(id, {
			searchTerms: termsBySong.get(id) ?? [],
			altTitles: altsBySong.get(id) ?? [],
		});
	}

	return out;
}
