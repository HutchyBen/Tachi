import type { KtLogger } from "#lib/log/log";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import { staticAssertUnreachable } from "#utils/misc";
import {
	FindBMSChartOnHash,
	FindChartOnInGameIDPrimary,
	FindChartOnInGameIDVersion,
	FindChartOnInGameStrIDPrimary,
	FindChartOnInGameStrIDVersion,
	FindChartWithPTDF,
	FindChartWithPTDFVersion,
	FindITGChartOnHash,
	FindPopnChartOnHashSHA256,
	FindSDVXChartOnInGameID,
	FindSDVXChartOnInGameIDVersion,
	FindUSCChartOnSHA1Playtype,
	SongHasAnyChart,
} from "#utils/queries/charts";
import {
	FindDDRSongOnDDRSongHash,
	FindSongOnID,
	FindSongOnTitleInsensitive,
} from "#utils/queries/songs";
import {
	type BatchManualScore,
	type Difficulties,
	FormatGameGroup,
	GetGamePTConfig,
	type GPTString,
	type MatchTypeResolver,
	type MatchTypeResolverWithDifficulty,
	type MONGO_ChartDocument,
	type MONGO_SongDocument,
	type MongoProvidedMetrics,
	type Playtypes,
	type Versions,
} from "tachi-common";

import type { DryScore } from "../../../framework/common/types";
import type { ConverterFunction } from "../types";
import type { BatchManualContext } from "./types";

import {
	InternalFailure,
	InvalidScoreFailure,
	SongOrChartNotFoundFailure,
} from "../../../framework/common/converter-failures";
import {
	AssertStrAsDifficulty,
	AssertStrAsPositiveInt,
} from "../../../framework/common/string-asserts";

// only public because used in tests; ts has no way of doing that
// lol
export function BatchManualScoreToResolver(
	data: BatchManualScore,
	context: BatchManualContext,
): MatchTypeResolver {
	// already validated by prudence
	const resolver: MatchTypeResolver = {
		// @ts-expect-error already validated by prudence
		difficulty: data.difficulty,
		identifier: data.identifier,
		matchType: data.matchType,
		artist: data.artist,
		version: context.version,
		game: context.game,
		playtype: context.playtype,
	};

	return resolver;
}

/**
 * Creates a ConverterFn for the BatchManualScore format. This curries
 * the importType into the function, so the right failures can be
 * returned.
 * @returns A BatchManualScore Converter.
 */
export const ConverterBatchManual: ConverterFunction<BatchManualScore, BatchManualContext> = async (
	data,
	context,
	importType,
	log,
) => {
	const { game, playtype } = context;

	const resolver = BatchManualScoreToResolver(data, context);

	const got = await ResolveSongAndChart(resolver, log);

	if (got === null) {
		throw new SongOrChartNotFoundFailure(
			`Cannot find chart ${resolver.matchType}:${resolver.identifier}.`,
			importType,
			data,
			context,
		);
	}

	const { song, chart } = got;

	let service = context.service;

	if (importType === "ir/direct-manual") {
		service = `${service} (DIRECT-MANUAL)`;
	} else if (importType === "file/batch-manual") {
		service = `${service} (BATCH-MANUAL)`;
	}

	// create the metrics for this score.
	// @ts-expect-error this is filled out in a second, promise!
	const metrics: MongoProvidedMetrics[GPTString] = {};

	const config = GetGamePTConfig(game, playtype);

	for (const key of Object.keys(config.providedMetrics)) {
		// @ts-expect-error hacky type messery
		metrics[key] = data[key];
	}

	const dryScore: DryScore = {
		game,
		service,
		comment: data.comment ?? null,
		importType,

		// For backwards compatibility reasons, an explicitly passed timeAchieved of 0 should be interpreted as null.
		timeAchieved: data.timeAchieved === 0 ? null : (data.timeAchieved ?? null),
		scoreData: {
			...metrics,
			judgements: data.judgements ?? {},

			// if hitMeta is provided and optional is not provided, use hitMeta.
			// this is for compatibility with old import methods.
			optional: data.optional ?? data.hitMeta ?? {},
		},
		scoreMeta: data.scoreMeta ?? {},
	};

	return {
		chart,
		song,
		dryScore,
	};
};

export async function ResolveSongAndChart(
	resolver: MatchTypeResolver,
	log: KtLogger,
): Promise<{ chart: MONGO_ChartDocument; song: MONGO_SongDocument } | null> {
	const { game, playtype } = resolver;

	const config = GetGamePTConfig(game, playtype);

	if (!config.supportedMatchTypes.includes(resolver.matchType)) {
		// special, more helpful error message
		if (game === "sdvx" && resolver.matchType === "inGameID") {
			throw new InvalidScoreFailure(
				`Cannot use matchType ${resolver.matchType} for ${FormatGameGroup(
					game,
					playtype,
				)}. Use 'sdvxInGameID' instead.`,
			);
		}

		throw new InvalidScoreFailure(
			`Cannot use matchType ${resolver.matchType} for ${FormatGameGroup(
				game,
				playtype,
			)}. Expected any of ${config.supportedMatchTypes.join(", ")}.`,
		);
	}

	const matchType = resolver.matchType;
	switch (matchType) {
		case "bmsChartHash": {
			const chart = await FindBMSChartOnHash(resolver.identifier);

			if (!chart) {
				return null;
			}

			if (chart.playtype !== playtype) {
				throw new InvalidScoreFailure(
					`Chart ${chart.chartID}'s playtype was ${chart.playtype}, but this was not equal to the import playtype of ${playtype}.`,
				);
			}

			const song = await FindSongOnID(game, chart.songID);

			if (!song) {
				log.error(`BMS songID ${chart.songID} has charts but no parent song.`);
				throw new InternalFailure(
					`BMS songID ${chart.songID} has charts but no parent song.`,
				);
			}

			return { chart, song };
		}

		case "itgChartHash": {
			const chart = await FindITGChartOnHash(resolver.identifier);

			if (!chart) {
				return null;
			}

			const song = await FindSongOnID(game, chart.songID);

			if (!song) {
				log.error(`ITG songID ${chart.songID} has charts but no parent song.`);
				throw new InternalFailure(
					`ITG songID ${chart.songID} has charts but no parent song.`,
				);
			}

			return { song, chart };
		}

		case "popnChartHash": {
			if (playtype !== "9B") {
				throw new InvalidScoreFailure(`Invalid playtype '${playtype}', expected 9B.`);
			}

			const chart = await FindPopnChartOnHashSHA256(resolver.identifier, playtype);

			if (!chart) {
				return null;
			}

			const song = await FindSongOnID(game, chart.songID);

			if (!song) {
				log.error(`Pop'n songID ${chart.songID} has charts but no parent song.`);
				throw new InternalFailure(
					`Pop'n songID ${chart.songID} has charts but no parent song.`,
				);
			}

			return { song, chart };
		}

		case "tachiSongID": {
			const songID = AssertStrAsPositiveInt(
				resolver.identifier,
				"Invalid songID - must be a stringified positive integer.",
			);

			const song = await FindSongOnID(game, songID);

			if (!song) {
				return null;
			}

			const chart = await ResolveChartFromSong(song, resolver);

			if (!chart) {
				return null;
			}

			return { song, chart };
		}

		case "songTitle": {
			const song = await FindSongOnTitleInsensitive(
				game,
				resolver.identifier,
				resolver.artist,
			);

			if (!song) {
				return null;
			}

			const chart = await ResolveChartFromSong(song, resolver);

			if (!chart) {
				return null;
			}

			return { song, chart };
		}

		case "sdvxInGameID": {
			let chart: MONGO_ChartDocument | null;

			const identifier = Number(resolver.identifier);

			const config = GetGamePTConfig("sdvx", "Single");

			if (config.difficulties.type === "DYNAMIC") {
				log.error(
					{
						config,
					},
					`SDVX has 'DYNAMIC' difficulties set. This is completely unexpected.`,
				);
				throw new ScoreImportFatalError(
					500,
					`SDVX has 'DYNAMIC' difficulties set. This is completely unexpected.`,
				);
			}

			if (
				!config.difficulties.order.includes(resolver.difficulty) &&
				resolver.difficulty !== "ANY_INF"
			) {
				throw new InvalidScoreFailure(
					`Invalid difficulty '${
						resolver.difficulty
					}', Expected any of ${config.difficulties.order.join(", ")} or ANY_INF`,
				);
			}

			const diff = resolver.difficulty as "ANY_INF" | Difficulties["sdvx:Single"];

			if (resolver.version) {
				if (!Object.keys(config.versions).includes(resolver.version)) {
					throw new InvalidScoreFailure(
						`Unsupported version ${resolver.version}. Expected any of ${Object.keys(
							config.versions,
						).join(", ")}.`,
					);
				}

				chart = await FindSDVXChartOnInGameIDVersion(
					identifier,
					diff,
					resolver.version as Versions["sdvx:Single"],
				);
			} else {
				chart = await FindSDVXChartOnInGameID(identifier, diff);
			}

			if (!chart) {
				return null;
			}

			const song = await FindSongOnID("sdvx", chart.songID);

			if (!song) {
				log.error(`Song-Chart desync on ${chart.songID}.`);
				throw new InternalFailure(`Failed to get song for a chart that exists.`);
			}

			return { song, chart };
		}

		case "inGameID": {
			const identifier = Number(resolver.identifier);

			const difficulty = AssertStrAsDifficulty(resolver.difficulty, game, resolver.playtype);

			let chart: MONGO_ChartDocument | null;

			if (resolver.version) {
				chart = await FindChartOnInGameIDVersion(
					game,
					identifier,
					resolver.playtype,
					difficulty,
					resolver.version,
				);
			} else {
				chart = await FindChartOnInGameIDPrimary(
					game,
					identifier,
					resolver.playtype,
					difficulty,
				);
			}

			if (!chart) {
				return null;
			}

			const song = await FindSongOnID(game, chart.songID);

			if (!song) {
				log.error(`Song-Chart desync on ${chart.songID}.`);
				throw new InternalFailure(`Failed to get song for a chart that exists.`);
			}

			return { song, chart };
		}

		case "inGameStrID": {
			const difficulty = AssertStrAsDifficulty(resolver.difficulty, game, resolver.playtype);

			let chart: MONGO_ChartDocument | null;

			if (resolver.version) {
				chart = await FindChartOnInGameStrIDVersion(
					game,
					resolver.identifier,
					resolver.playtype,
					difficulty,
					resolver.version,
				);
			} else {
				chart = await FindChartOnInGameStrIDPrimary(
					game,
					resolver.identifier,
					resolver.playtype,
					difficulty,
				);
			}

			if (!chart) {
				return null;
			}

			const song = await FindSongOnID(game, chart.songID);

			if (!song) {
				log.error(`Song-Chart desync on ${chart.songID}.`);
				throw new InternalFailure(`Failed to get song for a chart that exists.`);
			}

			return { song, chart };
		}

		case "uscChartHash": {
			if (game !== "usc") {
				throw new InvalidScoreFailure(`uscChartHash matchType can only be used on USC.`);
			}

			if (playtype !== "Controller" && playtype !== "Keyboard") {
				throw new InvalidScoreFailure(`Invalid playtype, expected Keyboard or Controller.`);
			}

			const chart = await FindUSCChartOnSHA1Playtype(resolver.identifier, playtype);

			if (!chart) {
				return null;
			}

			const song = await FindSongOnID(game, chart.songID);

			if (!song) {
				log.error(`Song-Chart desync on ${chart.songID}.`);
				throw new InternalFailure(`Failed to get song for a chart that exists.`);
			}

			return { song, chart };
		}

		case "ddrSongHash": {
			if (game !== "ddr") {
				throw new InvalidScoreFailure(`ddrSongHash matchType can only be used on DDR.`);
			}

			const difficulty = AssertStrAsDifficulty(resolver.difficulty, game, resolver.playtype);

			const song = await FindDDRSongOnDDRSongHash(resolver.identifier);

			if (!song) {
				return null;
			}

			if (!(await SongHasAnyChart("ddr", song.id))) {
				log.error(`Song-Chart desync on ${song.id}.`);
				throw new InternalFailure(`Failed to get chart for a song that exists.`);
			}

			let chart: MONGO_ChartDocument | null;

			type DDRGPT = `ddr:${Playtypes["ddr"]}`;

			if (resolver.version) {
				chart = await FindChartWithPTDFVersion(
					"ddr",
					song.id,
					resolver.playtype as Playtypes["ddr"],
					difficulty,
					resolver.version as Versions[DDRGPT],
				);
			} else {
				chart = await FindChartWithPTDF(
					"ddr",
					song.id,
					resolver.playtype as Playtypes["ddr"],
					difficulty,
				);
			}

			if (!chart) {
				return null;
			}

			return { song, chart };
		}

		default: {
			staticAssertUnreachable(matchType);
		}
	}
}

export async function ResolveChartFromSong(
	song: MONGO_SongDocument,
	resolver: MatchTypeResolverWithDifficulty,
) {
	const game = resolver.game;

	if (!resolver.difficulty) {
		throw new InvalidScoreFailure(
			`Missing 'difficulty' field, but was necessary for this lookup.`,
		);
	}

	const difficulty = AssertStrAsDifficulty(resolver.difficulty, game, resolver.playtype);

	let chart;

	if (resolver.version) {
		chart = await FindChartWithPTDFVersion(
			game,
			song.id,
			resolver.playtype,
			difficulty,
			resolver.version,
		);
	} else {
		chart = await FindChartWithPTDF(game, song.id, resolver.playtype, difficulty);
	}

	if (!chart) {
		return null;
	}

	return chart;
}
