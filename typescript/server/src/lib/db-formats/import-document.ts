import DB from "#services/pg/db";
import { ISO8601ToUnixMilliseconds } from "#utils/time";
import {
	type ClassDelta,
	GetGPTString,
	type GPTString,
	type ImportTypes,
	type MONGO_ImportDocument,
	V3ToGamePT,
} from "tachi-common";

/**
 * Build a full {@link MONGO_ImportDocument} from normalized Postgres import tables.
 * `goalInfo` / `questInfo` are always empty (historical import_goal / import_quest were not migrated).
 */
export async function LoadImportDocumentById(
	importID: string,
): Promise<MONGO_ImportDocument | undefined> {
	const base = await DB.selectFrom("import")
		.selectAll()
		.where("id", "=", importID)
		.executeTakeFirst();

	if (!base) {
		return undefined;
	}

	const [games, errors, classes, sessions, scoreIds] = await Promise.all([
		DB.selectFrom("import_game").select("game").where("id", "=", importID).execute(),
		DB.selectFrom("import_error")
			.select(["type", "message"])
			.where("import_id", "=", importID)
			.execute(),
		DB.selectFrom("import_class")
			.select(["game", "set", "prev", "new"])
			.where("import_id", "=", importID)
			.execute(),
		DB.selectFrom("import_session")
			.select(["session_id", "type"])
			.where("import_id", "=", importID)
			.execute(),
		DB.selectFrom("score").select("id").where("import_id", "=", importID).execute(),
	]);

	const gptStringSet = new Set<GPTString>();

	for (const g of games) {
		const { game, playtype } = V3ToGamePT(g.game);

		gptStringSet.add(GetGPTString(game, playtype));
	}

	const gptStrings = [...gptStringSet];

	const playtypeSet = new Set(
		games.map((g) => {
			const { playtype } = V3ToGamePT(g.game);

			return playtype;
		}),
	);

	const classDeltas: Array<ClassDelta> = classes.map((c) => {
		const { game, playtype } = V3ToGamePT(c.game);

		return {
			game,
			playtype,
			set: c.set as ClassDelta["set"],
			old: c.prev,
			new: c.new,
		};
	});

	const createdSessions = sessions.map((s) => {
		const t = s.type;

		const cap = t.length > 0 ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;

		return {
			sessionID: s.session_id,
			type: cap as SessionInfoType,
		};
	});

	return {
		userID: base.user_id,
		timeStarted: ISO8601ToUnixMilliseconds(base.time_started),
		timeFinished: ISO8601ToUnixMilliseconds(base.time_finished),
		gptStrings,
		importID: base.id,
		scoreIDs: scoreIds.map((s) => s.id),
		game: base.game_group,
		playtypes: [...playtypeSet] as MONGO_ImportDocument["playtypes"],
		errors: errors.map((e) => ({ type: e.type, message: e.message })),
		createdSessions,
		importType: base.import_type as ImportTypes,
		classDeltas,
		goalInfo: [],
		questInfo: [],
		userIntent: base.user_intent,
	};
}

type SessionInfoType = MONGO_ImportDocument["createdSessions"][number]["type"];
