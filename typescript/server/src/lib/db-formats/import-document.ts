import type { Game, Import, ImportTracker } from "tachi-db";

import DB from "#services/pg/db";
import { ISO8601ToUnixMilliseconds } from "#utils/time";
import {
	type ClassDelta,
	GetGPTString,
	type GPTString,
	type ImportTypes,
	type MONGO_ImportDocument,
	type MONGO_ImportTrackerDocument,
	V3ToGamePT,
} from "tachi-common";

function mongoImportDocumentFromParts(
	base: Import,
	games: Array<{ game: Game }>,
	errors: Array<{ message: string; type: string }>,
	classes: Array<{ game: Game; new: string; prev: string | null; set: string }>,
	sessions: Array<{ session_id: string; type: string }>,
	scoreIds: Array<string>,
): MONGO_ImportDocument {
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
		scoreIDs: scoreIds,
		game: base.game_group,
		playtypes: [...playtypeSet] as MONGO_ImportDocument["playtypes"],
		errors: errors.map((e) => ({ message: e.message, type: e.type })),
		createdSessions,
		importType: base.import_type as ImportTypes,
		classDeltas,
		goalInfo: [],
		questInfo: [],
		userIntent: base.user_intent,
	};
}

function parseStoredTrackerError(err: unknown): { message: string; statusCode?: number } {
	if (err === null || err === undefined) {
		return { message: "Unknown error" };
	}

	const obj =
		typeof err === "string"
			? (JSON.parse(err) as Record<string, unknown>)
			: (err as Record<string, unknown>);

	return {
		message: typeof obj.message === "string" ? obj.message : "Unknown error",
		statusCode: typeof obj.statusCode === "number" ? obj.statusCode : undefined,
	};
}

/**
 * Maps a Postgres `import_tracker` row to the API {@link MONGO_ImportTrackerDocument} shape.
 * Rows with `error` set are {@link ImportTrackerFailed}; otherwise {@link ImportTrackerOngoing}.
 */
export function ToImportTrackerDocument(row: ImportTracker): MONGO_ImportTrackerDocument {
	const base = {
		timeStarted: ISO8601ToUnixMilliseconds(row.time_started),
		importID: row.import_id,
		userID: row.user_id,
		importType: row.import_type as ImportTypes,
		userIntent: row.user_intent,
	};

	if (row.error === null || row.error === undefined) {
		return { ...base, type: "ONGOING" };
	}

	return {
		...base,
		type: "FAILED",
		error: parseStoredTrackerError(row.error),
	};
}

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
			.select(["message", "type"])
			.where("import_id", "=", importID)
			.execute(),
		DB.selectFrom("import_class")
			.select(["game", "new", "prev", "set"])
			.where("import_id", "=", importID)
			.execute(),
		DB.selectFrom("import_session")
			.select(["session_id", "type"])
			.where("import_id", "=", importID)
			.execute(),
		DB.selectFrom("score").select("id").where("import_id", "=", importID).execute(),
	]);

	return mongoImportDocumentFromParts(
		base,
		games,
		errors,
		classes,
		sessions,
		scoreIds.map((s) => s.id),
	);
}

export async function ListRecentImportDocuments(opts: {
	importType?: ImportTypes;
	limit: number;
	userId?: number;
	userIntent?: boolean;
}): Promise<MONGO_ImportDocument[]> {
	let q = DB.selectFrom("import").selectAll();

	if (opts.userId !== undefined) {
		q = q.where("user_id", "=", opts.userId);
	}

	if (opts.importType !== undefined) {
		q = q.where("import_type", "=", opts.importType);
	}

	if (opts.userIntent !== undefined) {
		q = q.where("user_intent", "=", opts.userIntent);
	}

	const bases = await q.orderBy("time_finished", "desc").limit(opts.limit).execute();

	if (bases.length === 0) {
		return [];
	}

	const ids = bases.map((b) => b.id);

	const [games, errors, classes, sessions, scoreRows] = await Promise.all([
		DB.selectFrom("import_game").select(["id", "game"]).where("id", "in", ids).execute(),
		DB.selectFrom("import_error")
			.select(["import_id", "message", "type"])
			.where("import_id", "in", ids)
			.execute(),
		DB.selectFrom("import_class")
			.select(["import_id", "game", "new", "prev", "set"])
			.where("import_id", "in", ids)
			.execute(),
		DB.selectFrom("import_session")
			.select(["import_id", "session_id", "type"])
			.where("import_id", "in", ids)
			.execute(),
		DB.selectFrom("score").select(["id", "import_id"]).where("import_id", "in", ids).execute(),
	]);

	const gamesByImport = new Map<string, Array<{ game: Game }>>();

	for (const row of games) {
		const arr = gamesByImport.get(row.id) ?? [];

		arr.push({ game: row.game });
		gamesByImport.set(row.id, arr);
	}

	const errorsByImport = new Map<string, Array<{ message: string; type: string }>>();

	for (const row of errors) {
		const arr = errorsByImport.get(row.import_id) ?? [];

		arr.push({ message: row.message, type: row.type });
		errorsByImport.set(row.import_id, arr);
	}

	const classesByImport = new Map<
		string,
		Array<{ game: Game; new: string; prev: string | null; set: string }>
	>();

	for (const row of classes) {
		const arr = classesByImport.get(row.import_id) ?? [];

		arr.push({
			game: row.game,
			new: row.new,
			prev: row.prev,
			set: row.set,
		});
		classesByImport.set(row.import_id, arr);
	}

	const sessionsByImport = new Map<string, Array<{ session_id: string; type: string }>>();

	for (const row of sessions) {
		const arr = sessionsByImport.get(row.import_id) ?? [];

		arr.push({ session_id: row.session_id, type: row.type });
		sessionsByImport.set(row.import_id, arr);
	}

	const scoreIdsByImport = new Map<string, string[]>();

	for (const row of scoreRows) {
		if (row.import_id === null) {
			continue;
		}

		const arr = scoreIdsByImport.get(row.import_id) ?? [];

		arr.push(row.id);
		scoreIdsByImport.set(row.import_id, arr);
	}

	return bases.map((base) =>
		mongoImportDocumentFromParts(
			base,
			gamesByImport.get(base.id) ?? [],
			errorsByImport.get(base.id) ?? [],
			classesByImport.get(base.id) ?? [],
			sessionsByImport.get(base.id) ?? [],
			scoreIdsByImport.get(base.id) ?? [],
		),
	);
}

export async function ListFailedImportTrackers(opts: {
	importType?: ImportTypes;
	limit: number;
	userId?: number;
	userIntent?: boolean;
}): Promise<MONGO_ImportTrackerDocument[]> {
	let q = DB.selectFrom("import_tracker").selectAll().where("error", "is not", null);

	if (opts.userId !== undefined) {
		q = q.where("user_id", "=", opts.userId);
	}

	if (opts.importType !== undefined) {
		q = q.where("import_type", "=", opts.importType);
	}

	if (opts.userIntent !== undefined) {
		q = q.where("user_intent", "=", opts.userIntent);
	}

	const rows = await q.orderBy("time_started", "desc").limit(opts.limit).execute();

	return rows.map((row) => ToImportTrackerDocument(row));
}

export async function GetImportTrackerByImportId(
	importID: string,
): Promise<MONGO_ImportTrackerDocument | undefined> {
	const row = await DB.selectFrom("import_tracker")
		.selectAll()
		.where("import_id", "=", importID)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	return ToImportTrackerDocument(row);
}

type SessionInfoType = MONGO_ImportDocument["createdSessions"][number]["type"];
