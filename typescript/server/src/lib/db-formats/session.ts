import { ISO8601ToUnixMilliseconds } from "#utils/time";
import { type Selection } from "kysely";
import { type GPTString, type SessionDocument, V3ToGamePT } from "tachi-common";
import { type Database } from "tachi-db";

export const SELECT_SESSION_CALENDAR = [
	"session.id",
	"session.name",
	"session.description",
	"session.highlight",
	"session.time_started",
	"session.time_ended",
	"session.game",
] as const;

export type SessionCalendarDocument = Pick<
	SessionDocument,
	"sessionID" | "name" | "desc" | "highlight" | "timeStarted" | "timeEnded" | "game" | "playtype"
>;

export function ToSessionCalendarDocument(
	row: Selection<Database, "session", (typeof SELECT_SESSION_CALENDAR)[number]>,
): SessionCalendarDocument {
	const { game, playtype } = V3ToGamePT(row.game as GPTString);

	return {
		sessionID: row.id,
		name: row.name,
		desc: row.description,
		highlight: row.highlight,
		timeStarted: ISO8601ToUnixMilliseconds(row.time_started),
		timeEnded: ISO8601ToUnixMilliseconds(row.time_ended),
		game,
		playtype,
	};
}
