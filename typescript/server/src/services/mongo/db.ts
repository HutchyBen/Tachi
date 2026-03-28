import type { OrphanScoreDocument } from "#lib/score-import/import-types/common/types";
import type { MigrationDocument, PrivateUserInfoDocument } from "#utils/types";

import monk, { type ICollection, type TMiddleware } from "monk";
import {
	allSupportedGameGroups,
	type FolderChartLookup,
	type GameGroup,
	type GPTStrings,
	type integer,
	type MONGO_APITokenDocument,
	type MONGO_BMSCourseDocument,
	type MONGO_CGCardInfo,
	type MONGO_ChartDocument,
	type MONGO_ClassAchievementDocument,
	type MONGO_CounterDocument,
	type MONGO_FervidexSettingsDocument,
	type MONGO_FolderDocument,
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_ImportDocument,
	type MONGO_ImportTimingsDocument,
	type MONGO_ImportTrackerDocument as MONGO_ImportTrackerDocument,
	type MONGO_InviteCodeDocument,
	type MONGO_KaiAuthDocument,
	type MONGO_KsHookSettingsDocument,
	type MONGO_MytCardInfo,
	type MONGO_NotificationDocument,
	type MONGO_OrphanChartDocument,
	type MONGO_PBScoreDocument,
	type MONGO_QuestDocument,
	type MONGO_QuestlineDocument,
	type MONGO_QuestSubscriptionDocument,
	type MONGO_RecentlyViewedFolderDocument,
	type MONGO_ScoreDocument,
	type MONGO_SessionDocument,
	type MONGO_SongDocument,
	type MONGO_TableDocument,
	type MONGO_TachiAPIClientDocument,
	type MONGO_UGPTSettingsDocument,
	type MONGO_UserDocument,
	type MONGO_UserGameStats,
	type MONGO_UserGameStatsSnapshotDocument,
	type MONGO_UserNameChangeDocument,
	type MONGO_UserSettingsDocument,
} from "tachi-common";

// ^ These rules are disabled for good reason. We have to deal with some very nonsensical types here
// so we just disable these rules. I know, it sucks, but we'll live.
import { ONE_MINUTE, ONE_SECOND } from "#lib/constants/time";
import { log } from "#lib/log/log";
import { Env, ServerConfig } from "#lib/setup/config";
import { GetMillisecondsSince } from "#utils/misc";

let dbName = ServerConfig.MONGO_DATABASE_NAME;

/* istanbul ignore next */
if (Env.NODE_ENV === "test") {
	dbName = `testingdb`;
}

log.info({ bootInfo: true }, `Connecting to database ${Env.MONGO_URL}/${dbName}...`);
const dbtime = process.hrtime.bigint();

export const monkDB = monk(`${Env.MONGO_URL}/${dbName}`, {
	// Various things cause bizarre issues with mongodb connections. Windows+Docker especially so.
	// 5 minutes is excessive, but believe it or not, some setups are exceeding 2 minutes!
	serverSelectionTimeoutMS: ONE_MINUTE * 5,

	// in local dev, don't **ever** add _id onto objects you're inserting
	// in production, this might have a performance hit.
	forceServerObjectId: Env.NODE_ENV === "test",
});

/* istanbul ignore next */
monkDB
	.then(() => {
		log.info(
			{
				bootInfo: true,
			},
			`Database connection successful: took ${GetMillisecondsSince(dbtime)}ms`,
		);
	})
	.catch((err) => {
		log.fatal(`Failed to connect to database: ${err}`);

		// can't connect. kill self after 1 second.
		setTimeout(() => {
			process.exit(1);
		}, ONE_SECOND);
	});

/**
 * Removes _id from the returns of find/findOne. Note that this function is littered with eslint-disables
 * due to it working with some pretty wobbly types.
 */
const RemoveIDFromFindReturnsMiddleware: TMiddleware = () => (next) => (args: any, method) => {
	if ((method === "find" || method === "findOne") && !args.options.projectID) {
		if (args.options.projection) {
			args.options.projection._id = 0;
		} else {
			args.options.projection = { _id: 0 };
		}
	}

	return next(args, method);
};

// a bug in monks types means that :any has to be used here. Maybe we'll make a PR for this?
const StripIDFromDBInsertsMiddleware: TMiddleware = () => (next) => (args: any, method) => {
	if (method === "insert") {
		if (Array.isArray(args.data)) {
			for (const d of args.data) {
				delete d._id;
			}
		} else {
			delete args.data._id;
		}
	}

	return next(args, method);
};

monkDB.addMiddleware(StripIDFromDBInsertsMiddleware);
monkDB.addMiddleware(RemoveIDFromFindReturnsMiddleware);

export async function CloseMongoConnection() {
	await monkDB.close();
}

// Typescript incorrectly casts this into songs[string] => songdocument,
// Force cast it out.
const songs = Object.fromEntries(
	allSupportedGameGroups.map((e) => [e, monkDB.get<MONGO_SongDocument>(`songs-${e}`)]),
) as unknown as {
	[G in GameGroup]: ICollection<MONGO_SongDocument<G>>;
};

const charts = Object.fromEntries(
	allSupportedGameGroups.map((e) => [e, monkDB.get<MONGO_ChartDocument>(`charts-${e}`)]),
) as unknown as {
	[G in GameGroup]: ICollection<MONGO_ChartDocument<GPTStrings[G]>>;
};

const MONGODB_KILL = {
	// i have to handwrite this out for TS... :(
	// dont worry, it was all macro'd.
	songs,
	charts,

	// intended for when you want to query arbitrary chart/song documents.
	anyCharts: charts as Record<GameGroup, ICollection<MONGO_ChartDocument>>,
	anySongs: songs as Record<GameGroup, ICollection<MONGO_SongDocument>>,

	scores: monkDB.get<MONGO_ScoreDocument>("scores"),
	"personal-bests": monkDB.get<MONGO_PBScoreDocument>("personal-bests"),
	folders: monkDB.get<MONGO_FolderDocument>("folders"),
	"folder-chart-lookup": monkDB.get<FolderChartLookup>("folder-chart-lookup"),
	goals: monkDB.get<MONGO_GoalDocument>("goals"),
	"goal-subs": monkDB.get<MONGO_GoalSubscriptionDocument>("goal-subs"),
	quests: monkDB.get<MONGO_QuestDocument>("quests"),
	"quest-subs": monkDB.get<MONGO_QuestSubscriptionDocument>("quest-subs"),
	users: monkDB.get<MONGO_UserDocument>("users"),
	imports: monkDB.get<MONGO_ImportDocument>("imports"),
	"import-timings": monkDB.get<MONGO_ImportTimingsDocument>("import-timings"),
	sessions: monkDB.get<MONGO_SessionDocument>("sessions"),
	invites: monkDB.get<MONGO_InviteCodeDocument>("invites"),
	counters: monkDB.get<MONGO_CounterDocument>("counters"),
	"game-stats": monkDB.get<MONGO_UserGameStats>("game-stats"),
	"kai-auth-tokens": monkDB.get<MONGO_KaiAuthDocument>("kai-auth-tokens"),
	"cg-card-info": monkDB.get<MONGO_CGCardInfo>("cg-card-info"),
	"myt-card-info": monkDB.get<MONGO_MytCardInfo>("myt-card-info"),

	"bms-course-lookup": monkDB.get<MONGO_BMSCourseDocument>("bms-course-lookup"),
	"api-tokens": monkDB.get<MONGO_APITokenDocument>("api-tokens"),
	"orphan-scores": monkDB.get<OrphanScoreDocument>("orphan-scores"),
	"import-locks": monkDB.get<{ locked: boolean; lockedAt: integer | null; userID: integer }>(
		"import-locks",
	),
	tables: monkDB.get<MONGO_TableDocument>("tables"),
	"invite-locks": monkDB.get<{ locked: boolean; userID: integer }>("invite-locks"),
	"game-settings": monkDB.get<MONGO_UGPTSettingsDocument>("game-settings"),
	"game-stats-snapshots": monkDB.get<MONGO_UserGameStatsSnapshotDocument>("game-stats-snapshots"),
	"user-settings": monkDB.get<MONGO_UserSettingsDocument>("user-settings"),
	"user-private-information": monkDB.get<PrivateUserInfoDocument>("user-private-information"),
	"api-clients": monkDB.get<MONGO_TachiAPIClientDocument>("api-clients"),

	// i've inlined this one because i don't see it appearing anywhere else.
	"oauth2-auth-codes": monkDB.get<{ code: string; createdOn: number; userID: integer }>(
		"oauth2-auth-codes",
	),

	"fer-settings": monkDB.get<MONGO_FervidexSettingsDocument>("fer-settings"),
	"kshook-sv6c-settings": monkDB.get<MONGO_KsHookSettingsDocument>("kshook-sv6c-settings"),
	"orphan-chart-queue": monkDB.get<MONGO_OrphanChartDocument>("orphan-chart-queue"),
	"password-reset-codes": monkDB.get<{
		code: string;
		createdOn: number;
		userID: integer;
	}>("password-reset-codes"),
	"class-achievements": monkDB.get<MONGO_ClassAchievementDocument>("class-achievements"),
	"score-blacklist": monkDB.get<{ score: MONGO_ScoreDocument; scoreID: string; userID: integer }>(
		"score-blacklist",
	),
	"verify-email-codes": monkDB.get<{ code: string; email: string; userID: integer }>(
		"verify-email-codes",
	),
	"recent-folder-views": monkDB.get<MONGO_RecentlyViewedFolderDocument>("recent-folder-views"),
	questlines: monkDB.get<MONGO_QuestlineDocument>("questlines"),
	migrations: monkDB.get<MigrationDocument>("migrations"),
	notifications: monkDB.get<MONGO_NotificationDocument>("notifications"),
	"import-trackers": monkDB.get<MONGO_ImportTrackerDocument>("import-trackers"),
	"user-name-changes": monkDB.get<MONGO_UserNameChangeDocument>("user-name-changes"),
};

export type StaticDatabases = Exclude<
	keyof typeof MONGODB_KILL,
	"anyCharts" | "anySongs" | "charts" | "songs"
>;

export type Databases = `charts-${GameGroup}` | `songs-${GameGroup}` | StaticDatabases;

export default MONGODB_KILL;
