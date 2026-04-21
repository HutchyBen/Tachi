import { type JSONAttributeDiff } from "#util/misc";
import {
	type GameGroup,
	type SEEDS_BMSCourseDocument,
	type SEEDS_ChartDocument,
	type SEEDS_FolderDocument,
	type SEEDS_GoalDocument,
	type SEEDS_QuestDocument,
	type SEEDS_QuestlineDocument,
	type SEEDS_SongDocument,
	type SEEDS_TableDocument,
	type SongDocument,
	type V3Game,
} from "tachi-common";

// To render seeds with their tables properly, we need to conjoin our data with
// any other relevant info. These are used for rendering tables.
export type BMSCourseWithRelated = {
	__related: {
		/**
		 * Entry data is just a string in the case where the chart doesn't exist in
		 * the seeds. This string is just the MD5 of the chart that was expected.
		 */
		entries: Array<
			| string
			| {
					chart: SEEDS_ChartDocument<"bms-7k" | "bms-14k">;
					song: SongDocument<"bms">;
			  }
		>;
	};
} & SEEDS_BMSCourseDocument;

export type TableWithRelated = {
	__related: {
		/** Keys match `tables.json` folder slug strings (per game). */
		folders: {
			[folderSlug: string]: SEEDS_FolderDocument | undefined;
		};
	};
} & SEEDS_TableDocument;

export type QuestlineWithRelated = {
	__related: {
		quests: {
			[questID: string]: SEEDS_QuestDocument | undefined;
		};
	};
} & SEEDS_QuestlineDocument;

export type QuestWithRelated = {
	__related: {
		goals: {
			[goalID: string]: SEEDS_GoalDocument | undefined;
		};
	};
} & SEEDS_QuestDocument;

export type ChartWithRelated<T extends V3Game = V3Game> = {
	__related: {
		song: SongDocument | undefined;
	};
} & SEEDS_ChartDocument<T>;

type SongSeedsWithRelated = {
	[G in GameGroup as `songs-${G}.json`]: Array<SEEDS_SongDocument<G>>;
};

type ChartSeedsWithRelated = {
	[G in V3Game as `charts-${G}.json`]: Array<ChartWithRelated<G>>;
};

/**
 * A lookup type for turning database seeds into their corresponding datasets.
 * This involves things like adding __related song and chart info, which is useful
 * for rendering.
 */
export type DatabaseSeedsWithRelated = {
	"bms-course-lookup.json": Array<BMSCourseWithRelated>;

	// intentional: folders don't need to be joined with anything.
	"folders.json": Array<SEEDS_FolderDocument>;

	"goals.json": Array<SEEDS_GoalDocument>;
	"questlines.json": Array<QuestlineWithRelated>;
	"quests.json": Array<QuestWithRelated>;
	"tables.json": Array<TableWithRelated>;
} & ChartSeedsWithRelated &
	SongSeedsWithRelated;

export type ChangeIndicator = "ADDED" | "MODIFIED" | "REMOVED" | null;

export type DiffSeedsCollection<T> = {
	base: T;
	diff: JSONAttributeDiff[];
	head: T;
};

export type CellsRenderFN<T> = (d: { compress?: boolean; data: T }) => JSX.Element;
