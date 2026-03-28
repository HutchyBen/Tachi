import type { MONGO_ScoreDocument, MONGO_SessionDocument } from "tachi-common";

import MONGODB_KILL from "#services/mongo/db";

/**
 * Returns all the score documents inside a session.
 * @param session The session to retrieve the score documents of.
 */
export function GetScoresFromSession(session: MONGO_SessionDocument) {
	return MONGODB_KILL.scores.find({
		scoreID: { $in: session.scoreIDs },
	});
}

/**
 * Returns the session a score belongs to, if there is one. A score can only be part of one session implicitly.
 * @param score The score to return the associated session of.
 */
export function GetSessionFromScore(score: MONGO_ScoreDocument) {
	return MONGODB_KILL.sessions.findOne({
		scoreIDs: score.scoreID,
	});
}
