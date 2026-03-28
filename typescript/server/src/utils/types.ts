import type { TachiBMSTable } from "#lib/game-specific/custom-bms-tables";
import type {
	GameGroup,
	integer,
	MONGO_ChartDocument,
	MONGO_FolderDocument,
	MONGO_GoalDocument,
	MONGO_GoalSubscriptionDocument,
	MONGO_ImportDocument,
	MONGO_QuestDocument,
	MONGO_QuestlineDocument,
	MONGO_QuestSubscriptionDocument,
	MONGO_ScoreDocument,
	MONGO_SessionDocument,
	MONGO_SongDocument,
	MONGO_TableDocument,
	MONGO_TachiAPIClientDocument,
	MONGO_UserDocument,
	MONGO_UserGameStats,
	MONGO_UserSettingsDocument,
	Playtype,
} from "tachi-common";

// Inject additional properties on express-session
declare module "express-session" {
	interface SessionData {
		tachi: TachiSessionData;
	}
}

declare module "express-serve-static-core" {
	export interface Request {
		// KNOWN BUG IN TS-ESLINT.
		/**
		 * This is a type-safe variant of "req.safeBody".
		 * "req.safeBody" is 'any' by default, which makes it exceptionally difficult
		 * to use in our codebase (due to the strict cadence rules.)
		 */
		safeBody: Record<string, unknown>;
	}
}

export interface TachiSessionData {
	user: MONGO_UserDocument;
	settings: MONGO_UserSettingsDocument;
}

export interface TachiAPIFailResponse {
	success: false;
	description: string;
}

export interface TachiAPISuccessResponse {
	success: true;
	description: string;
	body: Record<string, unknown>;
}

export type TachiAPIReponse = TachiAPIFailResponse | TachiAPISuccessResponse;

/**
 * Clarity type for empty objects - such as in context.
 */
export type EmptyObject = Record<string, never>;

/**
 * Data that may be monkey-patched onto req.tachi. This holds things such as middleware results.
 */
export interface TachiRequestData {
	uscChartDoc?: MONGO_ChartDocument<"usc:Controller" | "usc:Keyboard">;

	beatorajaChartDoc?: MONGO_ChartDocument<
		"bms:7K" | "bms:14K" | "pms:Controller" | "pms:Keyboard"
	>;

	requestedUser?: MONGO_UserDocument;
	requestedUserGameStats?: MONGO_UserGameStats;
	game?: GameGroup;
	playtype?: Playtype;

	chartDoc?: MONGO_ChartDocument;
	songDoc?: MONGO_SongDocument;
	songPgId?: string;
	scoreDoc?: MONGO_ScoreDocument;
	sessionDoc?: MONGO_SessionDocument;
	tableDoc?: MONGO_TableDocument;
	folderDoc?: MONGO_FolderDocument;
	goalDoc?: MONGO_GoalDocument;
	questDoc?: MONGO_QuestDocument;
	goalSubDoc?: MONGO_GoalSubscriptionDocument;
	questSubDoc?: MONGO_QuestSubscriptionDocument;
	questlineDoc?: MONGO_QuestlineDocument;
	importDoc?: MONGO_ImportDocument;

	customBMSTable?: TachiBMSTable;

	apiClientDoc: Omit<MONGO_TachiAPIClientDocument, "clientSecret">;
}

// This is only used on tachi-server, and isn't exposed -- so shouldn't be a part
// of common.
export interface PrivateUserInfoDocument {
	userID: integer;
	password: string;
	email: string;
}

export interface Migration {
	id: string;
	up: () => Promise<unknown>;
	down: () => Promise<unknown>;
}

export type MigrationDocument = {
	migrationID: string;
} & (
	| {
			appliedOn: integer;
			status: "applied";
	  }
	| {
			status: "pending";
	  }
);

// https://www.designcise.com/web/tutorial/how-to-change-readonly-properties-to-be-writable-in-typescript
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// https://stackoverflow.com/questions/61132262/typescript-deep-partial
export type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
		}
	: T;
