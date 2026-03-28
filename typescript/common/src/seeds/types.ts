import type {
	GameGroup,
	GPTStrings,
	MONGO_BMSCourseDocument,
	MONGO_ChartDocument,
	MONGO_FolderDocument,
	MONGO_GoalDocument,
	MONGO_QuestDocument,
	MONGO_QuestlineDocument,
	MONGO_SongDocument,
	MONGO_TableDocument,
} from "../types";

import { allSupportedGameGroups } from "../config/config";

// lazy, but kinda cool macros.
// note that TS won't let you do this multiple times within an object
// so, we have to join them ourselves. Ah well, not that bad.
type ChartDBSeeds = {
	[G in GameGroup as `charts-${G}.json`]: Array<MONGO_ChartDocument<GPTStrings[G]>>;
};

type SongDBSeeds = {
	[G in GameGroup as `songs-${G}.json`]: Array<MONGO_SongDocument<G>>;
};

interface OtherDBSeeds {
	"bms-course-lookup.json": Array<MONGO_BMSCourseDocument>;
	"folders.json": Array<MONGO_FolderDocument>;
	"goals.json": Array<MONGO_GoalDocument>;
	"questlines.json": Array<MONGO_QuestlineDocument>;
	"quests.json": Array<MONGO_QuestDocument>;
	"tables.json": Array<MONGO_TableDocument>;
}

export type AllDatabaseSeeds = ChartDBSeeds & OtherDBSeeds & SongDBSeeds;

// Nifty trick to enforce that we always specify all database seeds :)
const CURRENT_DATABASE_SEEDS: Record<keyof OtherDBSeeds, true> = {
	"bms-course-lookup.json": true,
	"folders.json": true,
	"goals.json": true,
	"questlines.json": true,
	"quests.json": true,
	"tables.json": true,
};

const moreOnes: Array<string> = [];

for (const game of allSupportedGameGroups) {
	moreOnes.push(`songs-${game}.json`, `charts-${game}.json`);
}

export const DatabaseSeedNames = [...Object.keys(CURRENT_DATABASE_SEEDS), ...moreOnes] as Array<
	keyof AllDatabaseSeeds
>;
