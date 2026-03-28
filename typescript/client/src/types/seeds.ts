import { type JSONAttributeDiff } from "#util/misc";
import {
	type GameGroup,
	type GPTString,
	type GPTStrings,
	type GPTStringToGame,
	type MONGO_BMSCourseDocument,
	type MONGO_ChartDocument,
	type MONGO_FolderDocument,
	type MONGO_GoalDocument,
	type MONGO_QuestDocument,
	type MONGO_QuestlineDocument,
	type MONGO_SongDocument,
	type MONGO_TableDocument,
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
					chart: MONGO_ChartDocument<"bms:7K" | "bms:14K">;
					song: MONGO_SongDocument<"bms">;
			  }
		>;
	};
} & MONGO_BMSCourseDocument;

export type TableWithRelated = {
	__related: {
		folders: {
			[folderID: string]: MONGO_FolderDocument | undefined;
		};
	};
} & MONGO_TableDocument;

export type QuestlineWithRelated = {
	__related: {
		quests: {
			[questID: string]: MONGO_QuestDocument | undefined;
		};
	};
} & MONGO_QuestlineDocument;

export type QuestWithRelated = {
	__related: {
		goals: {
			[goalID: string]: MONGO_GoalDocument | undefined;
		};
	};
} & MONGO_QuestDocument;

export type ChartWithRelated<T extends GPTString = GPTString> = {
	__related: {
		song: MONGO_SongDocument<GPTStringToGame[T]> | undefined;
	};
} & MONGO_ChartDocument<T>;

type SongSeedsWithRelated = {
	[G in GameGroup as `songs-${G}.json`]: Array<MONGO_SongDocument<G>>;
};

type ChartSeedsWithRelated = {
	[G in GameGroup as `charts-${G}.json`]: Array<ChartWithRelated<GPTStrings[G]>>;
};

/**
 * A lookup type for turning database seeds into their corresponding datasets.
 * This involves things like adding __related song and chart info, which is useful
 * for rendering.
 */
export type DatabaseSeedsWithRelated = {
	"bms-course-lookup.json": Array<BMSCourseWithRelated>;

	// intentional: folders don't need to be joined with anything.
	"folders.json": Array<MONGO_FolderDocument>;

	"goals.json": Array<MONGO_GoalDocument>;
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
