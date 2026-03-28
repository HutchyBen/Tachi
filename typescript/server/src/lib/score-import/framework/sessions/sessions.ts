import { ONE_HOUR } from "#lib/constants/time";
import { AppendLogCtx, type KtLogger, log } from "#lib/log/log";
import MONGODB_KILL from "#services/mongo/db";
import { GetChartForIDGuaranteed } from "#utils/db";
import { GetScoresFromSession } from "#utils/session";
import crypto from "crypto";
import {
	type GameGroup,
	GetGamePTConfig,
	GetGPTString,
	GetScoreMetricConf,
	GetScoreMetrics,
	type integer,
	type MONGO_ScoreDocument,
	type MONGO_SessionDocument,
	type Playtype,
	type SessionInfoReturn,
	type SessionScoreInfo,
} from "tachi-common";

import type { ScorePlaytypeMap } from "../common/types";

import { CreateSessionCalcData } from "../calculated-data/session";
import { CreatePBDoc, type PBScoreDocumentNoRank } from "../pb/create-pb-doc";
import { GenerateRandomSessionName } from "./name-generation";

const TWO_HOURS = ONE_HOUR * 2;

export async function CreateSessions(
	userID: integer,
	game: GameGroup,
	scorePtMap: ScorePlaytypeMap,
	log: KtLogger,
) {
	const allSessionInfo = [];

	/* eslint-disable no-await-in-loop */
	for (const [playtype, scores] of Object.entries(scorePtMap)) {
		const sessionInfo = await LoadScoresIntoSessions(
			userID,
			scores,
			game,
			playtype as Playtype,
			log,
		);

		allSessionInfo.push(...sessionInfo);
	}
	/* eslint-enable no-await-in-loop */

	return allSessionInfo;
}

/**
 * Compares a score and the previous PB the user had and returns the difference
 * as a SessionScoreInfo object.
 */
function ScoreToSessionScoreInfo(
	score: MONGO_ScoreDocument,
	previousPB: PBScoreDocumentNoRank | undefined,
): SessionScoreInfo {
	if (!previousPB) {
		return {
			scoreID: score.scoreID,
			isNewScore: true,
		};
	}

	const gptConfig = GetGamePTConfig(score.game, score.playtype);

	const deltas: Record<string, number> = {};

	const scoreMetrics = GetScoreMetrics(gptConfig, ["DECIMAL", "ENUM", "INTEGER"]);

	for (const metric of scoreMetrics) {
		const conf = GetScoreMetricConf(gptConfig, metric)!;

		if (conf.type === "ENUM") {
			deltas[metric] =
				// @ts-expect-error shush
				score.scoreData.enumIndexes[metric] - previousPB.scoreData.enumIndexes[metric];
		} else {
			// @ts-expect-error shush
			deltas[metric] = score.scoreData[metric] - previousPB.scoreData[metric];
		}
	}

	return {
		scoreID: score.scoreID,
		isNewScore: false,
		deltas,
	};
}

/**
 * Return info about how this session's scores stack up against the owner's PBs at the
 * time.
 */
export async function GetSessionScoreInfo(
	session: MONGO_SessionDocument,
): Promise<Array<SessionScoreInfo>> {
	const scores = await MONGODB_KILL.scores.find({
		scoreID: { $in: session.scoreIDs },
	});

	const gptString = GetGPTString(session.game, session.playtype);

	const promises = [];

	for (const score of scores) {
		promises.push(
			GetChartForIDGuaranteed(score.game, score.chartID).then((chart) =>
				CreatePBDoc(gptString, session.userID, chart, log, session.timeStarted).then((pb) =>
					ScoreToSessionScoreInfo(score, pb),
				),
			),
		);
	}

	const scoreInfo = await Promise.all(promises);

	return scoreInfo;
}

export function CreateSessionID() {
	return `Q${crypto.randomBytes(20).toString("hex")}`;
}

function UpdateExistingSession(
	existingSession: MONGO_SessionDocument,
	newScoreIDs: Array<string>,
	oldScores: Array<MONGO_ScoreDocument>,
	newScores: Array<MONGO_ScoreDocument>,
) {
	const allScores = [...oldScores, ...newScores];

	const calculatedData = CreateSessionCalcData(
		GetGPTString(existingSession.game, existingSession.playtype),
		allScores,
	);

	existingSession.calculatedData = calculatedData;
	existingSession.scoreIDs = [...existingSession.scoreIDs, ...newScoreIDs];

	if (newScores[0]!.timeAchieved! < existingSession.timeStarted) {
		existingSession.timeStarted = newScores[0]!.timeAchieved!;
	}

	if (newScores[newScores.length - 1]!.timeAchieved! > existingSession.timeEnded) {
		existingSession.timeEnded = newScores[newScores.length - 1]!.timeAchieved!;
	}

	return existingSession;
}

function CreateSession(
	userID: integer,
	scoreIDs: Array<string>,
	groupScores: Array<MONGO_ScoreDocument>,
	game: GameGroup,
	playtype: Playtype,
): MONGO_SessionDocument {
	const name = GenerateRandomSessionName();

	const calculatedData = CreateSessionCalcData(GetGPTString(game, playtype), groupScores);

	return {
		userID,
		name,
		sessionID: CreateSessionID(),
		desc: null,
		game,
		playtype,
		highlight: false,
		scoreIDs,
		timeInserted: Date.now(),
		timeStarted: groupScores[0]!.timeAchieved!,
		timeEnded: groupScores[groupScores.length - 1]!.timeAchieved!,
		calculatedData,
	};
}

export async function LoadScoresIntoSessions(
	userID: integer,
	importScores: Array<MONGO_ScoreDocument>,
	game: GameGroup,
	playtype: Playtype,
	baseLog: KtLogger,
): Promise<Array<SessionInfoReturn>> {
	const log = AppendLogCtx("Session Generation", baseLog);

	const timestampedScores = [];

	for (const score of importScores) {
		if (score.timeAchieved === null) {
			log.debug(`Ignored score ${score.scoreID}, as it had no timeAchieved.`);

			// ignore scores without timestamps. We can't use these for sessions.
			continue;
		}

		timestampedScores.push(score);
	}

	// If we have nothing to work with, why bother?
	if (timestampedScores.length === 0) {
		log.debug(`Skipped calculating sessions as there were no timestamped scores`);
		return [];
	}

	// sort scores ascendingly.
	timestampedScores.sort((a, b) => a.timeAchieved! - b.timeAchieved!);

	// The "Score Groups" for the array of scores provided.
	// This contains scores split on 2hr margins, which allows for more optimised
	// session db requests.
	const sessionScoreGroups: Array<Array<MONGO_ScoreDocument>> = [];
	let curGroup: Array<MONGO_ScoreDocument> = [];
	let lastTimestamp = 0;

	for (const score of timestampedScores) {
		if (score.timeAchieved! < lastTimestamp + TWO_HOURS) {
			curGroup.push(score);
		} else {
			sessionScoreGroups.push(curGroup);
			curGroup = [score];
		}

		lastTimestamp = score.timeAchieved!;
	}

	// There's no state here where curGroup is empty,
	// so push the group (which is guaranteed to have atleast one score)
	sessionScoreGroups.push(curGroup);

	log.debug(`Created ${sessionScoreGroups.length} groups from timestamped scores.`);

	const sessionInfoReturns: Array<SessionInfoReturn> = [];

	// All async operations inside here *need* to be done in lockstep to avoid colliding sessions.
	// realistically, that shouldn't be possible, but hey.
	/* eslint-disable no-await-in-loop */
	for (const groupScores of sessionScoreGroups) {
		if (groupScores.length === 0) {
			continue;
		}

		const startOfGroup = groupScores[0]!.timeAchieved!;
		const endOfGroup = groupScores[groupScores.length - 1]!.timeAchieved!;

		const scoreIDs = groupScores.map((e) => e.scoreID);

		// Find any sessions with +/-2hrs of this group. This is rather exhaustive, and could result in some issues
		// if this query returns more than one session. We could account for that by smushing sessions together.
		// This is not possible however, so this is now just a known tachi oddity.
		const nearbySession = await MONGODB_KILL.sessions.findOne({
			userID,
			game,
			playtype,
			$or: [
				{ timeStarted: { $gte: startOfGroup - TWO_HOURS, $lt: endOfGroup + TWO_HOURS } },
				{ timeEnded: { $gte: startOfGroup - TWO_HOURS, $lt: endOfGroup + TWO_HOURS } },
			],
		});

		let infoReturn: SessionInfoReturn;

		if (nearbySession) {
			log.debug(
				`Found nearby session for ${userID} (${game} ${playtype}) around ${startOfGroup} ${endOfGroup}.`,
			);

			const oldScores = await GetScoresFromSession(nearbySession);

			const session = UpdateExistingSession(nearbySession, scoreIDs, oldScores, groupScores);

			infoReturn = { sessionID: session.sessionID, type: "Appended" };

			await MONGODB_KILL.sessions.update(
				{
					sessionID: session.sessionID,
				},
				{
					$set: session,
				},
			);
		} else {
			log.debug(
				`Creating new session for ${userID} (${game} ${playtype}) around ${startOfGroup} ${endOfGroup}.`,
			);

			const session = CreateSession(userID, scoreIDs, groupScores, game, playtype);

			infoReturn = { sessionID: session.sessionID, type: "Created" };
			await MONGODB_KILL.sessions.insert(session);
		}

		sessionInfoReturns.push(infoReturn);
	}
	/* eslint-enable no-await-in-loop */

	return sessionInfoReturns;
}
