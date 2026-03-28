import type { FilterQuery } from "mongodb";

import type {
	AnyClasses,
	Classes,
	Difficulties,
	ExtractedClasses,
	GameGroup,
	GPTString,
	GPTStrings,
	GPTStringToGame,
	GPTStringToPlaytype,
	integer,
	Judgements,
	MONGO_ChartDocumentData,
	MONGO_SongDocumentData,
	MongoDerivedMetrics as MongoDerivedMetrics,
	MongoOptionalMetrics as MongoOptionalMetrics,
	MongoProvidedMetrics as MongoProvidedMetrics,
	OptionalEnumIndexes,
	PgDerivedMetrics,
	PgOptionalMetrics,
	PgProvidedMetrics,
	Playtype,
	Playtypes,
	Preferences,
	ProfileRatingAlgorithms,
	ScoreEnumIndexes,
	ScoreMeta,
	ScoreRatingAlgorithms,
	SessionRatingAlgorithms,
	UserAuthLevels,
	V3Game,
	V3GameToGPTString,
	Versions,
} from "../types";
import type { APIPermissions } from "./api";
import type { ImportTypes } from "./import-types";
import type { BaseNotification, NotificationBody } from "./notifications";

export interface IObjectID {
	readonly toHexString: () => string;
	readonly toString: () => string;
}

export interface MONGO_CounterDocument {
	counterName: string;
	value: integer;
}

export interface MONGO_ChartFolderLookupDocument {
	chartID: string;
	folderID: string;
}

export interface MONGO_BaseGoalDocument<GPT extends GPTString> {
	game: GameGroup;
	playtype: Playtype;
	name: string;
	goalID: string;
	criteria: GoalCountCriteria<GPT> | GoalSingleCriteria<GPT>;
}

interface GoalCriteria<_GPT extends GPTString> {
	// vvv this basically doesn't work as it starts thinking this might be a symbol
	// causing a myriad of annoying errors.
	// key: keyof DerivedMetrics[GPT] | keyof ProvidedMetrics[GPT];

	// doing this silly hack instead.
	key: string;

	value: number;
}

export interface GoalSingleCriteria<GPT extends GPTString> extends GoalCriteria<GPT> {
	mode: "single";
}

/**
 * Criteria for a score to match this criteria - this is a "count" mode, which means that
 * atleast N scores have to match this criteria. This is for things like folders.
 */
export interface GoalCountCriteria<GPT extends GPTString> extends GoalCriteria<GPT> {
	mode: "absolute" | "proportion";
	countNum: number;
}

/**
 * Goal Document - Single. A goal document that is only for one specific chart.
 */
export interface MONGO_GoalDocumentSingle<GPT extends GPTString = GPTString>
	extends MONGO_BaseGoalDocument<GPT> {
	charts: {
		data: string;
		type: "single";
	};
}

/**
 * Goal Document - Multi. A goal document whos set of charts is the array of
 * chartIDs inside "charts".
 */
export interface MONGO_GoalDocumentMulti<GPT extends GPTString = GPTString>
	extends MONGO_BaseGoalDocument<GPT> {
	charts: {
		data: Array<string>;
		type: "multi";
	};
}

/**
 * Goal Document - Folder. A goal document whos set of charts is derived from
 * the folderID inside "charts".
 */
export interface MONGO_GoalDocumentFolder<GPT extends GPTString = GPTString>
	extends MONGO_BaseGoalDocument<GPT> {
	charts: {
		data: string;
		type: "folder";
	};
}

export type MONGO_GoalDocument<GPT extends GPTString = GPTString> =
	| MONGO_GoalDocumentFolder<GPT>
	| MONGO_GoalDocumentMulti<GPT>
	| MONGO_GoalDocumentSingle<GPT>;

interface BaseInviteCodeDocument {
	createdBy: integer;
	code: string;
	createdAt: number;
}

export type MONGO_InviteCodeDocument = (
	| { consumed: false; consumedAt: null; consumedBy: null }
	| { consumed: true; consumedAt: number; consumedBy: integer }
) &
	BaseInviteCodeDocument;

export interface SessionInfoReturn {
	sessionID: string;
	type: "Appended" | "Created";
}

interface SessionScorePBInfo {
	scoreID: string;
	isNewScore: false;

	// metric -> difference between previous PB.
	deltas: Record<string, number>;
}

interface SessionScoreNewInfo {
	scoreID: string;
	isNewScore: true;
}

export type SessionScoreInfo = SessionScoreNewInfo | SessionScorePBInfo;

export interface MONGO_SessionDocument<GPT extends GPTString = GPTString> {
	userID: integer;
	sessionID: string;
	scoreIDs: Array<string>;
	name: string;
	desc: string | null;
	game: GameGroup;
	playtype: Playtype;

	timeInserted: integer;
	timeEnded: integer;
	timeStarted: integer;
	calculatedData: Partial<Record<SessionRatingAlgorithms[GPT], number | null>>;
	highlight: boolean;
}

interface ImportErrContent {
	type: string;
	message: string;
}

export interface MONGO_ImportDocument {
	userID: integer;
	timeStarted: number;
	timeFinished: number;

	// Contains an array of GPTString, which dictates what (game:playtype)s were involved in this import.
	gptStrings: Array<GPTString>;
	importID: string;
	scoreIDs: Array<string>;
	game: GameGroup;
	playtypes: Array<Playtypes[GameGroup]>;
	errors: Array<ImportErrContent>;

	// TODO(zk): Incoherent and wrong comment
	// For performance reasons, imports only show what sessions they created, rather than what sessions they didn't.
	// This is just an array of sessionIDs, to keep things normalised. May be empty.
	createdSessions: Array<SessionInfoReturn>;
	importType: ImportTypes;
	classDeltas: Array<ClassDelta>;
	goalInfo: Array<GoalImportInfo>;
	questInfo: Array<QuestImportInfo>;

	/**
	 * Whether the user deliberately imported this through an action (i.e. uploaded a file personally) [true]
	 * or was imported on their behalf through a service (i.e. fervidex)
	 */
	userIntent: boolean;
}

export interface MONGO_ImportTimingsDocument {
	importID: string;
	timestamp: number;
	total: number;

	/**
	 * Relative times - these are the times for each section
	 * divided by how much data they had to process.
	 */
	rel: Omit<ImportTimingSections, "goal" | "parse" | "quest" | "ugs">;

	/**
	 * Absolute times - these are the times for each section.
	 */
	abs: ImportTimingSections;
}

interface ImportTimingSections {
	parse: number;
	import: number;
	importParse: number;
	session: number;
	pb: number;
	ugs: number;
	goal: number;
	quest: number;
}

export type GoalImportStat = Pick<
	MONGO_GoalSubscriptionDocument,
	"achieved" | "outOf" | "outOfHuman" | "progress" | "progressHuman"
>;

export interface GoalImportInfo {
	goalID: string;
	old: GoalImportStat;
	new: GoalImportStat;
}

export type QuestImportStat = Pick<MONGO_QuestSubscriptionDocument, "achieved" | "progress">;

export interface QuestImportInfo {
	questID: string;
	old: QuestImportStat;
	new: QuestImportStat;
}

export type MONGO_GoalSubscriptionDocument = {
	game: GameGroup;
	goalID: string;
	lastInteraction: integer | null;
	outOf: number;
	outOfHuman: string;
	playtype: Playtype;
	progress: number | null;
	progressHuman: string;
	userID: integer;
	// Was this goal assigned "standalone"? I.e. a user explicitly subscribed to this.
	// instead of it being a result of a quest subscription.
	wasAssignedStandalone: boolean;

	wasInstantlyAchieved: boolean;
} & (
	| {
			achieved: false;
			timeAchieved: null;
	  }
	| {
			achieved: true;
			timeAchieved: integer;
	  }
);

export interface QuestGoalReference {
	goalID: string;
	note?: string;
}

export interface QuestSection {
	title: string;
	desc?: string;
	goals: Array<QuestGoalReference>;
}

export interface MONGO_QuestDocument {
	game: GameGroup;
	playtype: Playtype;
	name: string;
	desc: string;
	questData: Array<QuestSection>;
	questID: string;
}

export interface MONGO_QuestlineDocument {
	questlineID: string;
	name: string;
	desc: string;
	game: GameGroup;
	playtype: Playtype;
	quests: Array<string>;
}

export type UserBadges = "alpha" | "beta" | "contributor" | "dev-team" | "significant-contributor";

export interface MONGO_UserDocument {
	username: string;
	usernameLowercase: string;
	id: integer;
	socialMedia: {
		discord?: string | null;
		github?: string | null;
		steam?: string | null;
		twitch?: string | null;
		twitter?: string | null;
		youtube?: string | null;
	};
	joinDate: integer;
	lastSeen: integer;
	about: string;
	status: string | null;
	customPfpLocation: string | null;
	customBannerLocation: string | null;
	badges: Array<UserBadges>;
	authLevel: UserAuthLevels;
	isSupporter?: boolean;
}

export interface MONGO_SpecificUserGameStats<GPT extends GPTString> {
	userID: integer;
	game: GPTStringToGame[GPT];
	playtype: GPTStringToPlaytype[GPT];
	ratings: Partial<Record<ProfileRatingAlgorithms[GPT], number | null>>;
	classes: Partial<ExtractedClasses[GPT]>;
}

/**
 * GPT agnostic stats for a game. This type is easier to work with than the
 * specificUserGameStats one for general cases.
 */
export interface MONGO_UserGameStats {
	userID: integer;
	game: GameGroup;
	playtype: Playtype;
	ratings: Partial<Record<ProfileRatingAlgorithms[GPTString], number | null>>;
	classes: AnyClasses;
}

export interface ChartTierlistInfo {
	text: string;
	value: number;
	individualDifference?: boolean;
}

export interface MONGO_ChartDocument<GPT extends GPTString = GPTString> {
	/** Postgres `chart.id` — canonical in API URLs and JSON. */
	chartID: string;
	/** Legacy Mongo-era chart id (`chart.legacy_id` in Postgres). Required when loaded from PG; omit on raw Mongo chart docs. */
	legacyChartId?: string;
	songID: integer;
	level: string;
	levelNum: number;
	isPrimary: boolean;
	difficulty: Difficulties[GPT];
	playtype: GPTStringToPlaytype[GPT];
	data: MONGO_ChartDocumentData[GPT];
	versions: Array<Versions[GPT]>;
}

export interface MONGO_SongDocument<G extends GameGroup = GameGroup> {
	id: integer;
	title: string;
	artist: string;
	searchTerms: Array<string>;
	altTitles: Array<string>;
	data: MONGO_SongDocumentData[G];
}

export interface MONGO_TableDocument {
	tableID: string;
	game: GameGroup;
	playtype: Playtype;
	title: string;
	description: string;
	folders: Array<string>;
	inactive: boolean;
	default: boolean;
}

export interface MONGO_BaseFolderDocument {
	title: string;
	game: GameGroup;
	playtype: Playtype;
	folderID: string;

	/**
	 * This folder has been superceded by another folder,
	 * such as one on a more modern version of the game.
	 */
	inactive: boolean;
	searchTerms: Array<string>;
}

export interface MONGO_FolderSongsDocument extends MONGO_BaseFolderDocument {
	type: "songs";
	data: FilterQuery<MONGO_SongDocument>;
}

export interface MONGO_FolderChartsDocument extends MONGO_BaseFolderDocument {
	type: "charts";
	data: FilterQuery<MONGO_ChartDocument>;
}

export interface MONGO_FolderStaticDocument extends MONGO_BaseFolderDocument {
	type: "static";
	data: Array<string>;
}

export type MONGO_FolderDocument =
	| MONGO_FolderChartsDocument
	| MONGO_FolderSongsDocument
	| MONGO_FolderStaticDocument;

export interface FolderChartLookup {
	chartID: string;
	folderID: string;
}

export type MONGO_QuestSubscriptionDocument = {
	game: GameGroup;
	lastInteraction: integer | null;
	playtype: Playtype;
	progress: integer;
	questID: string;
	userID: integer;
	wasInstantlyAchieved: boolean;
} & (
	| {
			achieved: false;
			timeAchieved: null;
	  }
	| {
			achieved: true;
			timeAchieved: integer;
	  }
);

export type PgScoreData<Game extends V3Game = V3Game> = {
	data: PgScoreProvidedData<Game>;
	derived: PgScoreDerivedData<Game>;
	judgements: PgScoreJudgements<Game>;
};

export type PgScoreProvidedData<Game extends V3Game = V3Game> =
	PgOptionalMetrics[V3GameToGPTString[Game]] & PgProvidedMetrics[V3GameToGPTString[Game]];

export type PgScoreDerivedData<Game extends V3Game = V3Game> =
	PgDerivedMetrics[V3GameToGPTString[Game]];

export type PgScoreJudgements<Game extends V3Game = V3Game> = Partial<
	Record<Judgements[V3GameToGPTString[Game]], integer | null>
>;

export type MONGO_ScoreData<GPT extends GPTString = GPTString> = {
	enumIndexes: ScoreEnumIndexes<GPT>;
	judgements: Partial<Record<Judgements[GPT], integer | null>>;
	optional: {
		enumIndexes: OptionalEnumIndexes<GPT>;
	} & MongoOptionalMetrics[GPT];
} & MongoDerivedMetrics[GPT] &
	MongoProvidedMetrics[GPT];

export interface MONGO_ScoreDocument<GPT extends GPTString = GPTString> {
	service: string;
	game: GPTStringToGame[GPT];
	playtype: GPTStringToPlaytype[GPT];
	userID: integer;
	scoreData: MONGO_ScoreData<GPT>;
	scoreMeta: Partial<ScoreMeta[GPT]>;
	calculatedData: Partial<Record<ScoreRatingAlgorithms[GPT], number | null>>;
	timeAchieved: integer | null;
	songID: integer;
	chartID: string;
	isPrimary: boolean;
	highlight: boolean;
	comment: string | null;
	timeAdded: integer;
	scoreID: string;
	importType: ImportTypes | null;
}

export interface PBReference {
	name: string;
	scoreID: string;
}

export interface MONGO_PBScoreDocument<GPT extends GPTString = GPTString> {
	// guaranteed to atleast have one element.
	composedFrom: [PBReference, ...Array<PBReference>];
	rankingData: {
		outOf: integer;
		rank: integer;

		// out of their rivals, what is their position on this chart?
		// note that we don't need to store rivalOutOf, as it's pretty much a constant
		// that can just be read from the UGPT settings.
		// null if the user has no rivals.
		rivalRank: integer | null;
	};
	userID: integer;
	chartID: string;
	game: GameGroup;
	playtype: Playtype;
	songID: integer;
	highlight: boolean;
	isPrimary: boolean;
	timeAchieved: number | null;
	scoreData: MONGO_ScoreData<GPT>;
	calculatedData: Partial<Record<ScoreRatingAlgorithms[GPT], number | null>>;
}

export interface ImportProcessInfoOrphanExists {
	success: false;
	type: "OrphanExists";
	message: string;
	content: {
		orphanID: string;
	};
}

export interface ImportProcessInfoInvalidDatapoint {
	success: false;
	type: "InvalidDatapoint";
	message: string;
	content: Record<string, never>;
}

export interface ImportProcessInfoAmbiguousTitle {
	success: false;
	type: "AmbiguousTitle";
	message: string;
	content: {
		title: string;
	};
}

export interface ImportProcessInfoScoreImported<GPT extends GPTString = GPTString> {
	success: true;
	type: "ScoreImported";
	message: string;
	content: {
		score: MONGO_ScoreDocument<GPT>;
	};
}

export interface ImportProcessInfoInternalError {
	success: false;
	type: "InternalError";
	message: string;
	content: Record<string, never>;
}

export interface ImportProcessInfoSongOrChartNotFound {
	success: false;
	type: "SongOrChartNotFound";
	message: string;
	content: {
		context: unknown;
		// these are too complex to type. Not bothering.
		data: unknown;
		orphanID: string;
	};
}

export type ImportProcessingInfo<GPT extends GPTString = GPTString> =
	| ImportProcessInfoAmbiguousTitle
	| ImportProcessInfoInternalError
	| ImportProcessInfoInvalidDatapoint
	| ImportProcessInfoOrphanExists
	| ImportProcessInfoScoreImported<GPT>
	| ImportProcessInfoSongOrChartNotFound;

export interface ImportStatistics {
	scoreCount: integer;
	msPerScore: number;
	sessionCount: integer;
	msPerSession: number;
	ratingTime: number;
	importID: string;
}

export interface MONGO_KaiAuthDocument {
	userID: integer;
	token: string;
	refreshToken: string;
	service: "EAG" | "FLO" | "MIN";
}

export interface MONGO_CGCardInfo {
	userID: integer;
	service: "dev" | "gan" | "nag";
	cardID: string;

	// are we gonna do maths on it? no. it's a string. don't bother me.
	pin: string;
}

export interface MONGO_MytCardInfo {
	userID: integer;
	cardAccessCode: string; // matches /^[0-9]{20}$/
}

interface BMSCourseInner<GPT extends GPTStrings["bms"], Set extends keyof ExtractedClasses[GPT]> {
	set: Set;
	playtype: GPTStringToPlaytype[GPT];
	value: ExtractedClasses[GPT][Set];
}

/**
 * Used to resolve beatoraja IR courses.
 */
export interface MONGO_BMSCourseDocument
	extends BMSCourseInner<GPTStrings["bms"], keyof ExtractedClasses[GPTStrings["bms"]]> {
	title: string;
	md5sums: string;
}

/**
 * Information about the API Token used to make this request.
 */
export interface MONGO_APITokenDocument {
	userID: integer | null;
	token: string | null;
	identifier: string;
	permissions: Partial<Record<APIPermissions, boolean>>;

	// API Tokens may be created as a result of a Tachi Client flow. This prop optionally
	// stores that.
	fromAPIClient: string | null;
}

export interface MONGO_ImportLockDocument {
	userID: integer;
}

export type ShowcaseStatDetails = ShowcaseStatChart | ShowcaseStatFolder;

export interface ShowcaseStatFolder {
	mode: "folder";
	folderID: string;

	// should be a valid metric for the showcase this game is for
	// this is not checked by the typesystem though. sorry!
	metric: string;
	gte: number;
}

export interface ShowcaseStatChart {
	mode: "chart";
	chartID: string;

	// should be a valid metric for the showcase this game is for
	// this is not checked by the typesystem though. sorry!
	metric: string;
}

export interface MONGO_UGPTSettingsDocument<GPT extends GPTString = GPTString> {
	userID: integer;
	game: GPTStringToGame[GPT];
	playtype: GPTStringToPlaytype[GPT];
	preferences: {
		defaultTable: string | null;
		gameSpecific: Preferences[GPT];
		preferredDefaultEnum: string | null;
		preferredProfileAlg: ProfileRatingAlgorithms[GPT] | null;
		preferredRanking: "global" | "rival" | null;
		preferredScoreAlg: ScoreRatingAlgorithms[GPT] | null;
		preferredSessionAlg: SessionRatingAlgorithms[GPT] | null;
		stats: Array<ShowcaseStatDetails>;
	};
	rivals: Array<integer>;
}

export interface MONGO_UserGameStatsSnapshotDocument<GPT extends GPTString = GPTString>
	extends MONGO_SpecificUserGameStats<GPT> {
	rankings: Record<ProfileRatingAlgorithms[GPT], { outOf: integer; ranking: integer | null }>;
	playcount: integer;
	timestamp: integer;
}

export interface MONGO_UserSettingsDocument {
	userID: integer;
	following: Array<integer>;
	preferences: {
		advancedMode: boolean;
		contentiousContent: boolean;
		deletableScores: boolean;
		developerMode: boolean;
		invisible: boolean;
	};
}

export interface MONGO_TachiAPIClientDocument {
	clientID: string;
	clientSecret: string;
	name: string;
	author: integer;
	requestedPermissions: Array<APIPermissions>;
	redirectUri: string | null;
	webhookUri: string | null;
	apiKeyTemplate: string | null;
	apiKeyFilename: string | null;
}

export interface MONGO_FervidexSettingsDocument {
	userID: integer;
	cards: Array<string> | null;
	forceStaticImport: boolean;
}

export interface MONGO_KsHookSettingsDocument {
	userID: integer;
	forceStaticImport: boolean;
}

export interface MONGO_OrphanChartDocument<GPT extends GPTString = GPTString> {
	gptString: GPT;
	chartDoc: MONGO_ChartDocument<GPT>;
	songDoc: MONGO_SongDocument<GPTStringToGame[GPT]>;
	userIDs: Array<integer>;
}

export interface ClassDelta {
	game: GameGroup;
	set: Classes[GPTString];
	playtype: Playtype;
	old: string | null;
	new: string;
}

export interface MONGO_ClassAchievementDocument<GPT extends GPTString = GPTString> {
	game: GPTStringToGame[GPT];
	playtype: GPTStringToPlaytype[GPT];
	classSet: Classes[GPT];
	classOldValue: string | null;
	classValue: string;
	timeAchieved: number;
	userID: integer;
}

export interface MONGO_RecentlyViewedFolderDocument {
	userID: integer;
	game: GameGroup;
	playtype: Playtypes[GameGroup];
	folderID: string;
	lastViewed: number;
}

export type MONGO_NotificationDocument = {
	body: NotificationBody;
} & BaseNotification;

export interface MONGO_ChallengeSubscriptionDocument {
	chartID: string;
	authorID: integer;
	type: "lamp" | "score";

	game: GameGroup;
	playtype: Playtype;

	userID: integer;
	achieved: boolean;
	achievedAt: number | null;
}

interface BaseImportTracker {
	timeStarted: number;
	importID: string;
	userID: integer;
	importType: ImportTypes;
	userIntent: boolean;
}

export interface ImportTrackerOngoing extends BaseImportTracker {
	type: "ONGOING";
}

export interface ImportTrackerFailed extends BaseImportTracker {
	type: "FAILED";
	error: { message: string; statusCode?: number };
}

/**
 * Tracks the status of an import while it goes through the pipeline or if it fails.
 *
 * Successful imports are removed from the tracking database, and their existence
 * is kept track of via { @see MONGO_ImportDocument }.
 */
export type MONGO_ImportTrackerDocument = ImportTrackerFailed | ImportTrackerOngoing;

export interface MONGO_UserNameChangeDocument {
	userID: integer;
	username: string;
	timestamp: integer;
	previousUsername: string;
}
