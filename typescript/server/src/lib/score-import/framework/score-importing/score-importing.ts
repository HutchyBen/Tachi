import type { ScoreImportJob } from "#lib/score-import/worker/types";

import { AppendLogCtx, type KtLogger } from "#lib/logger/log.js";
import db from "#services/mongo/db";
import { ClassToObject } from "#utils/misc";

import type { ConverterFnSuccessReturn, ConverterFunction } from "../../import-types/common/types";
import type { DryScore } from "../common/types";

import {
	type ChartDocument,
	type GameGroup,
	GetGPTString,
	type ImportProcessingInfo,
	type ImportTypes,
	type integer,
	type ScoreDocument,
	type SongDocument,
} from "../../../../../../common/src";
import {
	type AmbiguousTitleFailure,
	type ConverterFailure,
	IsConverterFailure,
	type SongOrChartNotFoundFailure,
} from "../common/converter-failures";
import { OrphanScore } from "../orphans/orphans";
import { HydrateScore } from "./hydrate-score";
import { GetScoreQueueMaybe, InsertQueue, QueueScoreInsert } from "./insert-score";
import { CreateScoreID } from "./score-id";
import { ValidateScore } from "./validate-score";

/**
 * Processes the iterable data into the Tachi database.
 * @param userID - The user this score import was for.
 * @param iterableData - The data to iterate upon.
 * @param ConverterFunction - The function needed to convert the data into an IntermediateScore
 * @param context - Any context the Converter may need in order to make decisions.
 * @returns An array of ImportProcessInfo objects.
 */
export async function ImportAllIterableData<D, C>(
	userID: integer,
	importType: ImportTypes,
	iterableData: AsyncIterable<D> | Iterable<D>,
	ConverterFunction: ConverterFunction<D, C>,
	context: C,
	game: GameGroup,
	log: KtLogger,
	job: ScoreImportJob | undefined,
): Promise<Array<ImportProcessingInfo>> {
	log.verbose("Getting Blacklist...");

	// @optimisable: could filter harder with score.game and score.playtype
	// stuff.
	const blacklist = (
		await db["score-blacklist"].find({
			userID,
		})
	).map((e) => e.scoreID);

	log.verbose(`Starting Data Processing...`);

	const processedResults = [];

	let i = 0;

	// for await is used here as iterableData may be an async iterable
	// An example would be making an api request after exhausting
	// the first set of data.
	for await (const data of iterableData) {
		processedResults.push(
			await ImportIterableDatapoint(
				userID,
				importType,
				data,
				ConverterFunction,
				context,
				game,
				blacklist,
				logger,
			),
		);

		i++;

		if (job) {
			void job.updateProgress({ description: `Imported ${i} scores.` });
		}
	}

	// We need to filter out nulls, which we don't care for (these are neither successes or failures)

	log.verbose(`Finished Importing Data (${processedResults.length} datapoints).`);
	log.debug(`Removing null returns...`);

	const datapoints = processedResults.filter((e) => e !== null) as Array<ImportProcessingInfo>;

	log.debug(`Removed null from results.`);

	log.verbose(`received ${datapoints.length} returns, from ${processedResults.length} data.`);

	// Flush the score queue out after finishing most of the import. This ensures no scores get left in the
	// queue.
	const emptied = await InsertQueue(userID);

	if (emptied !== 0 && emptied !== null) {
		log.verbose(`Emptied ${emptied} documents from score queue.`);
	}

	return datapoints;
}

/**
 * Processes a single data object into one or many ImportProcessingInfo objects.
 * @param userID - The user this score is from.
 * @param data - The data to process.
 * @param ConverterFunction - The processor function that takes the data and returns the partialScore(s)
 * @param context - Any context the processor might need that it can not infer from the data object.
 * @returns An array of ImportProcessingInfo objects, or a single ImportProcessingInfo object
 */
export async function ImportIterableDatapoint<D, C>(
	userID: integer,
	importType: ImportTypes,
	data: D,
	ConverterFunction: ConverterFunction<D, C>,
	context: C,
	game: GameGroup,
	blacklist: Array<string>,
	log: KtLogger,
): Promise<ImportProcessingInfo | null> {
	try {
		const cfnReturn = await ConverterFunction(data, context, importType, logger);

		const res = await ProcessSuccessfulConverterReturn(userID, cfnReturn, blacklist, logger);

		return res;
	} catch (e) {
		const err = e as ConverterFailure | Error;

		// if this isn't a converterFailure, it's just a general error.
		// Some sort of internal issue?
		if (!IsConverterFailure(err)) {
			log.error(`Unknown error thrown from converter, Ignoring.`, {
				err,
			});
			return {
				success: false,
				type: "InternalError",
				message: "An internal service error has occured.",
				content: {},
			};
		}

		// otherwise, let's handle all the error types.
		// Originally, we handled this by using `instanceof` to check what class
		// instance the failure type was. This was neat, but typescript has some
		// questionable bugs with respect to maintaining prototype chains.
		// Even though it's uglier, we instead use a stringly-typed union.
		switch (err.failureType) {
			case "SongOrChartNotFound": {
				const dnfErr = err as SongOrChartNotFoundFailure<ImportTypes>;

				log.info(`SongOrChartNotFoundFailure: ${dnfErr.message}`, {
					err: ClassToObject(dnfErr),
					hideFromConsole: ["cfnReturn"],
				});

				log.debug("Inserting orphan...", { cfnReturn: dnfErr });

				const insertOrphan = await OrphanScore(
					dnfErr.importType,
					userID,
					dnfErr.data,
					dnfErr.converterContext,
					dnfErr.message,
					game,
					logger,
				);

				if (insertOrphan.success) {
					log.debug("Orphan inserted successfully.", {
						orphanID: insertOrphan.orphanID,
					});
					return {
						success: false,
						type: "SongOrChartNotFound",
						message: dnfErr.message,
						content: {
							context: dnfErr.converterContext,
							data: dnfErr.data,
							orphanID: insertOrphan.orphanID,
						},
					};
				}

				log.debug(`Orphan already exists.`, { orphanID: insertOrphan.orphanID });

				return {
					success: false,
					type: "OrphanExists",
					message: err.message,
					content: {
						orphanID: insertOrphan.orphanID,
					},
				};
			}

			case "InvalidScore": {
				log.info(`InvalidScoreFailure: ${err.message}`, {
					err: ClassToObject(err),
					hideFromConsole: ["cfnReturn"],
				});
				return {
					success: false,
					type: "InvalidDatapoint",
					message: err.message,
					content: {},
				};
			}

			case "Internal": {
				log.error(`Internal error occured.`, { err: ClassToObject(err) });
				return {
					success: false,
					type: "InternalError",

					// could return cfnReturn.message here, but we might want to hide the details of the crash.
					message: "An internal error has occured.",
					content: {},
				};
			}

			case "AmbiguousTitle": {
				const atErr = err as AmbiguousTitleFailure;

				log.info(`AmbiguousTitleFailure: ${err.message}`, { err: ClassToObject(err) });

				return {
					type: "AmbiguousTitle",
					success: false,
					message: err.message,
					content: {
						title: atErr.title,
					},
				};
			}

			case "SkipScore":
				return null;

			default: {
				log.warn(`Unknown error returned as ConverterFailure, Ignoring.`, {
					err: ClassToObject(err),
				});
				return {
					success: false,
					type: "InternalError",
					message: "An internal service error has occured.",
					content: {},
				};
			}
		}
	}
}

export async function ProcessSuccessfulConverterReturn(
	userID: integer,
	cfnReturn: ConverterFnSuccessReturn,
	blacklist: Array<string>,
	log: KtLogger,
	forceImmediateImport = false,
): Promise<ImportProcessingInfo | null> {
	const result = await HydrateCheckAndInsertScore(
		userID,
		cfnReturn.dryScore,
		cfnReturn.chart,
		cfnReturn.song,
		blacklist,
		logger,
		forceImmediateImport,
	);

	// This used to be a ScoreExists error. However, we never actually care about
	// handling ScoreExists errors (they're nobodies issue)
	// so instead, the function will just return null, and we pass that on here.
	if (result === null) {
		return null;
	}

	log.debug(`Successfully imported score: ${result.scoreID}`);

	return {
		success: true,
		type: "ScoreImported",
		message: `Imported score ${result.scoreID}.`,
		content: {
			score: result,
		},
	};
}

/**
 * Hydrates, validates and inserts a score to the Tachi database.
 * @param userID - The user this score is from.
 * @param dryScore - The score that is to be hydrated and inserted.
 * @param chart - The chart this score is on.
 * @param song - The song this score is on.
 * @param blacklist - A list of ScoreIDs to never write to the database.
 *
 * @param force - Whether to immediately insert the score into the database
 * or not.
 */
async function HydrateCheckAndInsertScore(
	userID: integer,
	dryScore: DryScore,
	chart: ChartDocument,
	song: SongDocument,
	blacklist: Array<string>,
	importlog: KtLogger,
	force = false,
): Promise<ScoreDocument | null> {
	const gptString = GetGPTString(dryScore.game, chart.playtype);

	const scoreID = CreateScoreID(gptString, userID, dryScore, chart.chartID, importLogger);

	// sub-context the logger so the below logs are more accurate
	const logger = AppendLogCtx(scoreID, importLogger);

	if (blacklist.length && blacklist.includes(scoreID)) {
		log.verbose("Skipped score, as it was on the blacklist.");
		return null;
	}

	const existingScore = await db.scores.findOne(
		{
			scoreID,
		},
		{
			// micro-optimisation - mongoDB is significantly faster when returning less fields
			// since we only care about whether we have a score or not here, we can minimise returned
			// fields.
			projection: {
				_id: 1,
			},
		},
	);

	if (existingScore) {
		log.verbose(`Skipped score.`);
		return null;
	}

	// If this users score queue
	if (GetScoreQueueMaybe(userID)?.scoreIDSet.has(scoreID) === true) {
		log.verbose(`Skipped score.`);
		return null;
	}

	const score = HydrateScore(userID, dryScore, chart, song, scoreID, logger);

	ValidateScore(score, chart);

	let res;

	if (force) {
		res = await db.scores.insert(score);
	} else {
		res = await QueueScoreInsert(score);
	}

	// this is a last resort for avoiding doubled imports
	if (res === null) {
		log.verbose(`Skipped score - Race Condition protection triggered.`);
		return null;
	}

	return score;
}
