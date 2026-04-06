import type { KtLogger } from "#lib/log/log";
import type { ScoreImportJob } from "#lib/score-import/worker/types";

import { LoadImportDocumentById } from "#lib/db-formats/import-document";
import { clearPbDirtyForUser } from "#lib/jobs/drain-dirty-queues";
import { runWithImportContext } from "#lib/score-import/framework/import-run-context";
import {
	deleteImportRun,
	ensureImportStub,
} from "#lib/score-import/framework/pg/ensure-import-stub";
import { finalizeImportToPostgres } from "#lib/score-import/framework/pg/finalize-import-pg";
import { observeScoreImportDuration } from "#server/prometheus";
import DB from "#services/pg/db";
import { GetMillisecondsSince } from "#utils/misc";
import { GetUserWithID } from "#utils/user";
import {
	type GameGroup,
	GetGameGroupConfig,
	type ImportProcessingInfo,
	type ImportTypes,
	type integer,
	type MONGO_UserDocument,
	type Playtype,
} from "tachi-common";

import type { ConverterFunction, ImportInputParser } from "../../import-types/common/types";
import type { ClassProvider } from "../calculated-data/types";
import type { ChartIDPlaytypeMap, ScorePlaytypeMap } from "../common/types";

import { Converters } from "../../import-types/converters";
import { InternalFailure } from "../common/converter-failures";
import { CreateScoreLogger } from "../common/import-logger";
import { GetAndUpdateUsersGoals } from "../goals/goals";
import { CheckAndSetOngoingImportLock, UnsetOngoingImportLock } from "../import-locks/lock";
import { ProcessPBs } from "../pb/process-pbs";
import { UpdateUsersQuests } from "../quests/quests";
import { CreateSessions } from "../sessions/sessions";
import { UpdateUsersGamePlaytypeStats } from "../ugpt-stats/update-ugpt-stats";
import ScoreImportFatalError from "./score-import-error";
import { ImportAllIterableData } from "./score-importing";

/**
 * Performs a Score Import.
 *
 * If a job is passed, progress will be set throughout the job.
 */
export default async function ScoreImportMain<D, C>(
	userID: integer,
	userIntent: boolean,
	importType: ImportTypes,
	InputParser: ImportInputParser<D, C>,
	importID: string,
	providedLogger?: KtLogger,
	job?: ScoreImportJob,
) {
	const user = await GetUserWithID(userID);

	if (!user) {
		throw new InternalFailure(
			`User with ID ${userID} does not exist, but attempted to make an import?`,
		);
	}

	let log;

	if (!providedLogger) {
		// If they weren't given to us -
		// we create an "import log".
		// this holds a reference to the user's name, ID, and type
		// of score import for any future debugging.
		log = CreateScoreLogger(user, importID, importType);
		log.debug("Received import request.");
	} else {
		log = providedLogger;
	}

	const hasNoOngoingImport = await CheckAndSetOngoingImportLock(user.id);

	if (hasNoOngoingImport) {
		log.info(`User ${userID} made an import while they had one ongoing.`);

		// @danger
		// Throwing away an import if the user already has one outgoing is *bad*, as in the case
		// of degraded performance we might just start throwing scores away.
		// Under normal circumstances, there is no scenario where a user would have two ongoing
		// imports at the same time - even if they were using single-score imports on a 5 second
		// chart, as each score import takes only around ~10-15milliseconds.
		throw new ScoreImportFatalError(409, "This user already has an ongoing import.");
	}

	try {
		return await runWithImportContext(importID, async () => {
			await deleteImportRun(importID);

			const timeStarted = Date.now();

			void SetJobProgress(job, "Parsing score data.");

			const parseTimeStart = process.hrtime.bigint();
			const {
				iterable,
				context,
				game,
				classProvider: classProvider,
			} = await InputParser(log);

			const parseTime = GetMillisecondsSince(parseTimeStart);

			log.debug(`Parsing took ${parseTime} milliseconds.`);

			void SetJobProgress(
				job,
				`Parsed Score Data. Took ${parseTime}ms. Importing ${
					Array.isArray(iterable) ? iterable.length : "an unknown amount of"
				} scores.`,
			);

			await ensureImportStub(importID, user.id, game, importType, userIntent);

			const ConverterFunction = Converters[importType] as unknown as ConverterFunction<D, C>;

			const importTimeStart = process.hrtime.bigint();

			let importInfo: Array<ImportProcessingInfo>;

			try {
				importInfo = await ImportAllIterableData(
					user.id,
					importType,
					iterable,
					ConverterFunction,
					context,
					game,
					log,
					job,
					importID,
				);
			} catch (err) {
				await deleteImportRun(importID);
				throw err;
			}

			const importTime = GetMillisecondsSince(importTimeStart);
			const importTimeRel = importTime / Math.max(1, importInfo.length);

			log.debug(`Importing took ${importTime} milliseconds. (${importTimeRel}ms/doc)`);

			void SetJobProgress(job, `Imported scores, took ${importTime} milliseconds. `);

			let post: Awaited<ReturnType<typeof HandlePostImportSteps>>;

			try {
				// Steps 3-8 are handled inside here.
				// This was moved inside here so the score de-orphaning process
				// could hook into importing better
				post = await HandlePostImportSteps(
					importInfo,
					user,
					importType,
					game,
					classProvider,
					log,
					job,
					importID,
				);
			} catch (err) {
				await deleteImportRun(importID);
				throw err;
			}

			const {
				playtypes,
				scoreIDs,
				errors,
				sessionInfo,
				classDeltas,
				goalInfo,
				questInfo,
				relativeTimes: _,
				absoluteTimes,
			} = post;

			const { importParseTime, sessionTime, pbTime, ugsTime, goalTime, questTime } =
				absoluteTimes;

			void SetJobProgress(job, "Finalising Import.");

			const timeFinished = Date.now();

			const logMessage = `Import took: ${timeFinished - timeStarted}ms, with ${
				importInfo.length
			} documents (Fails: ${errors.length}, Successes: ${scoreIDs.length}, Sessions: ${
				sessionInfo.length
			}). Aprx ${(timeFinished - timeStarted) / Math.max(1, importInfo.length)}ms/doc`;

			if (scoreIDs.length > 500) {
				log.info(logMessage);
			} else {
				log.debug(logMessage);
			}

			// --- 9. Finalise Import Document ---
			// Create and Save an import document to the database, and finish everything up!
			await DB.transaction().execute(async (trx) => {
				await finalizeImportToPostgres(trx, {
					importId: importID,
					userId: user.id,
					gameGroup: game,
					importType,
					userIntent,
					service: "Unknown",
					timeStartedMs: timeStarted,
					timeFinishedMs: timeFinished,
					playtypes,
					errors,
					classDeltas,
					createdSessions: sessionInfo,
					goalInfo,
					questInfo,
					timing: {
						parseMs: parseTime,
						importMs: importTime,
						importParseMs: importParseTime,
						sessionMs: sessionTime,
						pbMs: pbTime,
						ugsMs: ugsTime,
						goalMs: goalTime,
						questMs: questTime,
						totalMs: timeFinished - timeStarted,
					},
				});
			});

			observeScoreImportDuration(importType, Date.now() - timeStarted);

			const loaded = await LoadImportDocumentById(importID);

			if (!loaded) {
				throw new InternalFailure(
					`Import ${importID} was finalised but could not be reloaded.`,
				);
			}

			return loaded;
		});
	} finally {
		await UnsetOngoingImportLock(user.id);
	}
}

/**
 * Handles every single processing step after actually loading scores
 * into the database, such as updating goals, reprocessing sessions,
 * and updating a users game stats.
 */
export async function HandlePostImportSteps(
	importInfo: Array<ImportProcessingInfo>,
	user: MONGO_UserDocument,
	importType: ImportTypes,
	game: GameGroup,
	classProvider: ClassProvider | null,
	log: KtLogger,
	job: ScoreImportJob | undefined,
	_importId: string,
) {
	// --- 3. ParseImportInfo ---
	// ImportInfo is a relatively complex structure. We need some information from it for subsequent steps
	// such as the list of chartIDs involved in this import.
	const importParseTimeStart = process.hrtime.bigint();
	const { scorePlaytypeMap, errors, scoreIDs, chartIDs } = ParseImportInfo(importInfo);

	const importParseTime = GetMillisecondsSince(importParseTimeStart);
	const importParseTimeRel = importParseTime / Math.max(1, importInfo.length);

	log.debug(`Import Parsing took ${importParseTime} milliseconds. (${importParseTimeRel}ms/doc)`);

	void SetJobProgress(job, "Inserting Sessions.");

	// --- 4. Sessions ---
	// We create (or update existing) sessions here. This uses the aforementioned parsed import info
	// to determine what goes where.
	const sessionTimeStart = process.hrtime.bigint();
	const sessionInfo = await CreateSessions(user.id, game, scorePlaytypeMap, log);

	const sessionTime = GetMillisecondsSince(sessionTimeStart);
	const sessionTimeRel = sessionTime / Math.max(1, sessionInfo.length);

	log.debug(`Session Processing took ${sessionTime} milliseconds (${sessionTimeRel}ms/doc).`);

	void SetJobProgress(job, "Processing scores and updating PBs.");

	const playtypes = Object.keys(scorePlaytypeMap) as Array<Playtype>;

	// --- 5. PersonalBests ---
	// We want to keep an updated reference of a users best score on a given chart.
	// This function also handles conjoining different scores together (such as unioning best lamp and
	// best score).
	const pbTimeStart = process.hrtime.bigint();

	// processing PBs is a playtype-specific action. As such, we need to split chartIDs
	// accordingly
	const chartIDsSeparatedByPlaytype: ChartIDPlaytypeMap = {};

	for (const [playtype, scores] of Object.entries(scorePlaytypeMap)) {
		chartIDsSeparatedByPlaytype[playtype as Playtype] = new Set(scores.map((e) => e.chartID));
	}

	await Promise.all(
		Object.entries(chartIDsSeparatedByPlaytype).map(([playtype, cids]) =>
			ProcessPBs(game, playtype as Playtype, user.id, cids, log),
		),
	);

	await clearPbDirtyForUser(user.id, chartIDs);

	const pbTime = GetMillisecondsSince(pbTimeStart);
	const pbTimeRel = pbTime / Math.max(1, chartIDs.size);

	log.debug(`PB Processing took ${pbTime} milliseconds (${pbTimeRel}ms/doc)`);

	void SetJobProgress(job, "Updating profile statistics.");

	const ugsTimeStart = process.hrtime.bigint();
	const classDeltas = await UpdateUsersGameStats(game, playtypes, user.id, classProvider, log);

	const ugsTime = GetMillisecondsSince(ugsTimeStart);

	log.debug(`UGS Processing took ${ugsTime} milliseconds.`);

	void SetJobProgress(job, "Updating Goals.");

	const goalTimeStart = process.hrtime.bigint();
	const goalInfo = await GetAndUpdateUsersGoals(game, user.id, chartIDs, log);

	const goalTime = GetMillisecondsSince(goalTimeStart);

	log.debug(`Goal Processing took ${goalTime} milliseconds.`);

	void SetJobProgress(job, "Updating Quests.");

	const questTimeStart = process.hrtime.bigint();
	const questInfo = await UpdateUsersQuests(goalInfo, game, playtypes, user.id, log);

	const questTime = GetMillisecondsSince(questTimeStart);

	log.debug(`Quest Processing took ${questTime} milliseconds.`);

	return {
		classDeltas,
		questInfo,
		goalInfo,
		playtypes,
		scoreIDs,
		errors,
		sessionInfo,
		relativeTimes: {
			importParseTimeRel,
			pbTimeRel,
			sessionTimeRel,
		},
		absoluteTimes: {
			importParseTime,
			sessionTime,
			pbTime,
			ugsTime,
			goalTime,
			questTime,
		},
	};
}
/**
 * Calls UpdateUsersGamePlaytypeStats for every playtype in the import.
 * @returns A flattened array of ClassDeltas
 */
async function UpdateUsersGameStats(
	game: GameGroup,
	modifiedPlaytypes: Array<Playtype>,
	userID: integer,
	classProvider: ClassProvider | null,
	log: KtLogger,
) {
	const promises = [];

	// Instead of using the provided playtypes, run the classProvider on all
	// playtypes. This should only happen if a classProvider is provided, and is
	// a hack fix for things like #480.
	const allPlaytypes = GetGameGroupConfig(game).playtypes;

	const playtypes = classProvider ? allPlaytypes : modifiedPlaytypes;

	for (const pt of playtypes) {
		promises.push(UpdateUsersGamePlaytypeStats(game, pt, userID, classProvider, log));
	}

	const r = await Promise.all(promises);

	return r.flat(1);
}

/**
 * Parses the return of ImportProcessingInfo into relevant information
 * for the rest the import.
 * @returns The list of scoreIDs used in the import, the list of errors
 * A set of unique chartIDs involved in the import and the scores mapped
 * on their playtype.
 */
function ParseImportInfo(importInfo: Array<ImportProcessingInfo>) {
	const scorePlaytypeMap: ScorePlaytypeMap = {};

	const scoreIDs = [];
	const errors = [];
	const chartIDs: Set<string> = new Set();

	for (const info of importInfo) {
		if (info.success) {
			scoreIDs.push(info.content.score.scoreID);
			chartIDs.add(info.content.score.chartID);

			if (scorePlaytypeMap[info.content.score.playtype]) {
				scorePlaytypeMap[info.content.score.playtype]!.push(info.content.score);
			} else {
				scorePlaytypeMap[info.content.score.playtype] = [info.content.score];
			}
		} else {
			errors.push({ type: info.type, message: info.message });
		}
	}

	return { scoreIDs, errors, scorePlaytypeMap, chartIDs };
}

function SetJobProgress(job: ScoreImportJob | undefined, description: string) {
	if (job) {
		return job.updateProgress({ description });
	}
}
