import {
	allSupportedGameGroups,
	GAME_GROUP_CONFIGS,
	GAME_PT_CONFIGS,
	type GameGroup,
	v3AllGames,
	type V3Game,
	V3ToGPTString,
} from "tachi-common";
import { z, type ZodType } from "zod";

export type AllCollections =
	| "bms-course-lookup.json"
	| "folders.json"
	| "goals.json"
	| "questlines.json"
	| "quests.json"
	| "tables.json"
	| `charts-${V3Game}.json`
	| `songs-${GameGroup}.json`;

export const V3_GAME_SCHEMA = z.enum(v3AllGames as [V3Game, ...Array<V3Game>]);
export const V3_GAME_GROUP_SCHEMA = z.enum(
	allSupportedGameGroups as [GameGroup, ...Array<GameGroup>],
);

export const V3_TACHI_ID = (prefix: string) =>
	z.string().regex(new RegExp(`^${prefix}[0-9a-f]{19}$`, "u"));

export const V3_FOLDER_SCHEMA = z.strictObject({
	title: z.string(),
	game: V3_GAME_SCHEMA,
	id: V3_TACHI_ID("F"),
	legacyFolderID: z.string(),
	inactive: z.boolean(),
	searchTerms: z.array(z.string()),
	versionFilter: z.array(z.string()).optional(),
	where: z.string(),
	slug: z.string().optional(),
});

export const V3_TABLE_SCHEMA = z.strictObject({
	game: V3_GAME_SCHEMA,
	id: V3_TACHI_ID("T"),
	legacyTableID: z.string(),
	inactive: z.boolean(),
	title: z.string(),
	description: z.string(),
	slug: z.string().optional(),
	default: z.boolean(),
	folders: z.array(z.string()),
});

export const V3_BMS_COURSE_LOOKUP_SCHEMA = z.strictObject({
	md5sums: z.string(),
	title: z.string(),
	set: z.string(),
	playtype: z.string(),
	value: z.string(),
});

// TODO(zk): impl
export const V3_QUEST_SCHEMA = z.any();
export const V3_QUESTLINE_SCHEMA = z.any();
export const V3_GOAL_SCHEMA = z.any();

export const V3_SONG_SCHEMAS: Record<`songs-${GameGroup}.json`, ZodType> = Object.fromEntries(
	allSupportedGameGroups.map((gameGroup) => [
		`songs-${gameGroup}.json` as const,
		z.strictObject({
			id: V3_TACHI_ID("S"),
			legacySongID: z.number(),
			title: z.string(),
			artist: z.string(),
			altTitles: z.array(z.string()),
			searchTerms: z.array(z.string()),
			data: GAME_GROUP_CONFIGS[gameGroup].songData,
		}),
	]),
) as unknown as Record<`songs-${GameGroup}.json`, ZodType>;
// ^ object.fromEntries is hardcoded to [k: string]
// even when k is a subset of string

export const V3_CHART_SCHEMAS: Record<`charts-${V3Game}.json`, ZodType> = Object.fromEntries(
	v3AllGames.map((game) => [
		`charts-${game}.json` as const,
		z.strictObject({
			id: V3_TACHI_ID("C"),
			// TODO(zk): Game specific?
			difficulty: z.string(),
			isPrimary: z.boolean(),
			legacyChartID: z.string(),
			level: z.string(),
			levelNum: z.number(),
			songID: V3_TACHI_ID("S"),
			versions: z.array(z.string()),
			data: GAME_PT_CONFIGS[V3ToGPTString(game)].chartData,
		}),
	]),
) as unknown as Record<`charts-${V3Game}.json`, ZodType>;

export const V3_SCHEMAS: Record<AllCollections, ZodType> = {
	"bms-course-lookup.json": V3_BMS_COURSE_LOOKUP_SCHEMA,
	"folders.json": V3_FOLDER_SCHEMA,
	"tables.json": V3_TABLE_SCHEMA,
	"quests.json": V3_QUEST_SCHEMA,
	"questlines.json": V3_QUESTLINE_SCHEMA,
	"goals.json": V3_GOAL_SCHEMA,

	...V3_SONG_SCHEMAS,
	...V3_CHART_SCHEMAS,
};
