import type { GPTServerImplementation } from "#game-implementations/types";

import { CreatePBMergeFor } from "#game-implementations/utils/pb-merge";
import { ProfileSumBestN } from "#game-implementations/utils/profile-calc";
import { SessionAvgBest10For } from "#game-implementations/utils/session-calc";
import { type PbDocumentJoinRow, ToPbScoreDocument } from "#lib/db-formats/pb";
import DB from "#services/pg/db";
import { IsNullish } from "#utils/misc";
import { sql } from "kysely";
import { p } from "prudence";
import { Jubility } from "rg-stats";
import {
	FmtNum,
	type GameGroup,
	GamePTToV3,
	GetGrade,
	type integer,
	JUBEAT_GBOUNDARIES,
	type MONGO_PBScoreDocument,
	type Playtype,
	type Versions,
} from "tachi-common";

import { GoalFmtScore, GoalOutOfFmtScore, GradeGoalFormatter } from "./_common";

/**
 * Best PB per (song, jubility difficulty bucket): BSC / ADV / EXT maps HARD * and normal
 * difficulties together, then globally sorts by jubility and takes the top `limit` rows.
 */
export async function GetBestJubilityOnSongs(
	songIDs: Array<integer>,
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	limit: integer,
): Promise<Array<MONGO_PBScoreDocument>> {
	if (songIDs.length === 0) {
		return [];
	}

	const v3Game = GamePTToV3(game, playtype);

	const rows = await sql<PbDocumentJoinRow>`
		WITH base AS (
			SELECT
				pb.row_id,
				(pb.calculated_data::jsonb->>'jubility')::double precision AS jubility_val,
				song.legacy_id AS song_legacy_id,
				chart.difficulty
			FROM pb
			INNER JOIN chart ON chart.id = pb.chart_id
			INNER JOIN song ON song.id = chart.song_id
			WHERE pb.user_id = ${userID}
				AND chart.game = ${v3Game}
				AND song.legacy_id in (${sql.join(songIDs)})
		),
		bucketed AS (
			SELECT
				base.row_id,
				base.jubility_val,
				base.song_legacy_id,
				CASE
					WHEN base.difficulty IN ('HARD BSC', 'BSC') THEN 'BSC'
					WHEN base.difficulty IN ('HARD ADV', 'ADV') THEN 'ADV'
					WHEN base.difficulty IN ('HARD EXT', 'EXT') THEN 'EXT'
					ELSE NULL
				END AS jubility_bucket
			FROM base
		),
		filtered AS (
			SELECT
				bucketed.row_id,
				ROW_NUMBER() OVER (
					PARTITION BY bucketed.song_legacy_id, bucketed.jubility_bucket
					ORDER BY bucketed.jubility_val DESC NULLS LAST
				) AS rn
			FROM bucketed
			WHERE bucketed.jubility_bucket IS NOT NULL
		)
		SELECT
			pb.row_id,
			pb.user_id,
			pb.chart_id,
			pb.lens,
			pb.data,
			pb.derived_data,
			pb.calculated_data,
			pb.ranking_value,
			pb.ranking_value_tb1,
			pb.ranking_value_tb2,
			pb.ranking_value_tb3,
			pb.ranking_value_tb4,
			pb.ranking_value_tb5,
			pb.highlight,
			pb.time_achieved,
			chart.legacy_id as chart_legacy_id,
			song.legacy_id as song_legacy_id,
			chart.game as chart_game,
			chart.is_primary as is_primary
		FROM pb
		INNER JOIN chart ON chart.id = pb.chart_id
		INNER JOIN song ON song.id = chart.song_id
		INNER JOIN filtered f ON f.row_id = pb.row_id AND f.rn = 1
		ORDER BY (pb.calculated_data::jsonb->>'jubility')::double precision DESC NULLS LAST
		LIMIT ${limit}
	`.execute(DB);

	return Promise.all(rows.rows.map((row) => ToPbScoreDocument(row)));
}

const CURRENT_JUBEAT_HOT_VERSION: Versions["jubeat:Single"] = "ave";

export async function GetPBsForJubility(userID: integer) {
	const hotSongRows = await DB.selectFrom("song")
		.select("legacy_id")
		.where("game_group", "=", "jubeat")
		.where(
			sql<boolean>`(song.data::jsonb->>'displayVersion') = ${sql.lit(CURRENT_JUBEAT_HOT_VERSION)}`,
		)
		.execute();

	const hotSongIDs = hotSongRows.map((r) => r.legacy_id);

	const coldSongRows = await DB.selectFrom("song")
		.select("legacy_id")
		.where("game_group", "=", "jubeat")
		.where(
			sql<boolean>`(song.data::jsonb->>'displayVersion') IS DISTINCT FROM ${sql.lit(CURRENT_JUBEAT_HOT_VERSION)}`,
		)
		.execute();

	const coldSongIDs = coldSongRows.map((r) => r.legacy_id);

	const [bestHotScores, bestScores] = await Promise.all([
		GetBestJubilityOnSongs(hotSongIDs, userID, "jubeat", "Single", 30),
		GetBestJubilityOnSongs(coldSongIDs, userID, "jubeat", "Single", 30),
	]);

	return { bestHotScores, bestScores };
}

async function CalculateJubility(
	_game: GameGroup,
	_playtype: Playtype,
	userID: integer,
): Promise<number> {
	const { bestHotScores, bestScores } = await GetPBsForJubility(userID);

	let jubility = 0;

	jubility = jubility + bestHotScores.reduce((a, e) => a + (e.calculatedData.jubility ?? 0), 0);
	jubility = jubility + bestScores.reduce((a, e) => a + (e.calculatedData.jubility ?? 0), 0);

	return jubility;
}

export const JUBEAT_IMPL: GPTServerImplementation<"jubeat:Single"> = {
	chartSpecificValidators: {
		musicRate: (rate, chart) => {
			switch (chart.difficulty) {
				case "BSC":
				case "ADV":
				case "EXT":
					return p.isBetween(0, 100)(rate);

				case "HARD BSC":
				case "HARD ADV":
				case "HARD EXT":
					return p.isBetween(0, 120)(rate);
			}
		},
	},
	scoreDeriver: (scoreData, _chart) => ({
		grade: GetGrade(JUBEAT_GBOUNDARIES, scoreData.score),
	}),
	scoreCalcs: (scoreData, _derivedData, chart) => ({
		jubility: Jubility.calculate(scoreData.score, scoreData.musicRate, chart.levelNum),
	}),
	pbRankingValues: (pb) => ({
		ranking: pb.scoreData.musicRate,
		tb1: pb.scoreData.score,
		tb2: pb.scoreData.enumIndexes.lamp,
		tb3: null,
		tb4: null,
		tb5: null,
	}),
	sessionCalcs: (arr) => ({
		jubility: SessionAvgBest10For("jubility")(arr),
	}),
	profileCalcs: async (game, playtype, userID) => {
		const [jubility, naiveJubility] = await Promise.all([
			CalculateJubility(game, playtype, userID),
			ProfileSumBestN("jubility", 60)(game, playtype, userID),
		]);

		return { jubility, naiveJubility };
	},
	classDerivers: (ratings) => {
		const jubility = ratings.jubility;

		if (IsNullish(jubility)) {
			return { colour: null };
		}

		if (jubility >= 9500) {
			return { colour: "GOLD" };
		} else if (jubility >= 8500) {
			return { colour: "ORANGE" };
		} else if (jubility >= 7000) {
			return { colour: "PINK" };
		} else if (jubility >= 5500) {
			return { colour: "PURPLE" };
		} else if (jubility >= 4000) {
			return { colour: "VIOLET" };
		} else if (jubility >= 2500) {
			return { colour: "BLUE" };
		} else if (jubility >= 1500) {
			return { colour: "LIGHT_BLUE" };
		} else if (jubility >= 750) {
			return { colour: "GREEN" };
		} else if (jubility >= 250) {
			return { colour: "YELLOW_GREEN" };
		}

		return { colour: "BLACK" };
	},
	goalCriteriaFormatters: {
		musicRate: (v) => `Get a music rate of ${v.toFixed(1)}% on`,
		score: GoalFmtScore,
	},
	goalProgressFormatters: {
		score: (pb) => FmtNum(pb.scoreData.score),
		musicRate: (pb) => `${pb.scoreData.musicRate.toFixed(1)}%`,
		lamp: (pb) => pb.scoreData.lamp,
		grade: (pb, gradeIndex) =>
			GradeGoalFormatter(
				JUBEAT_GBOUNDARIES,
				pb.scoreData.grade,
				pb.scoreData.score,
				JUBEAT_GBOUNDARIES[gradeIndex]!.name,
			),
	},
	goalOutOfFormatters: {
		musicRate: (v) => `${v.toFixed(1)}%`,
		score: GoalOutOfFmtScore,
	},

	// musicRate is the default prop
	// but we want the user's best score to count aswell.
	pbMergeFunctions: [
		CreatePBMergeFor("largest", "enumIndexes.lamp", "Best Lamp", (base, score) => {
			base.scoreData.lamp = score.scoreData.lamp;
		}),
		CreatePBMergeFor("largest", "score", "Best Score", (base, score) => {
			base.scoreData.score = score.scoreData.score;
			base.scoreData.grade = score.scoreData.grade;
		}),
	],
	defaultMergeRefName: "Best Music Rate",
	scoreValidators: [
		(s) => {
			if (s.scoreData.lamp === "EXCELLENT" && s.scoreData.score !== 1_000_000) {
				return `An EXCELLENT lamp must be accompanied with a score of 1 million.`;
			}

			if (s.scoreData.lamp !== "EXCELLENT" && s.scoreData.score === 1_000_000) {
				return `A score of 1 million must be accompanied with an EXCELLENT lamp.`;
			}
		},
		(s) => {
			let { good, great, miss, poor } = s.scoreData.judgements;

			great ??= 0;
			good ??= 0;
			poor ??= 0;
			miss ??= 0;

			if (s.scoreData.lamp === "EXCELLENT") {
				if (good + great + miss + poor > 0) {
					return "An EXCELLENT lamp can't have any non-perfect judgements.";
				}
			}

			if (s.scoreData.lamp === "FULL COMBO") {
				if (miss > 0) {
					return "A FULL COMBO cannot have any misses.";
				}
			}
		},
		(s) => {
			if (s.scoreData.score < 700_000 && s.scoreData.lamp !== "FAILED") {
				return "A score of <700k must be a fail.";
			}

			if (s.scoreData.score >= 700_000 && s.scoreData.lamp === "FAILED") {
				return "A score >=700k must be a clear.";
			}
		},
	],
};
