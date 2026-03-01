import { type JSONAttributeDiff } from "#util/misc";
import {
	type BMSCourseDocument,
	type ChartDocument,
	type FolderDocument,
	type GameGroup,
	type GoalDocument,
	type GPTString,
	type GPTStrings,
	type GPTStringToGame,
	type QuestDocument,
	type QuestlineDocument,
	type SongDocument,
	type TableDocument,
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
					chart: ChartDocument<"bms:7K" | "bms:14K">;
					song: SongDocument<"bms">;
			  }
		>;
	};
} & BMSCourseDocument;

export type TableWithRelated = {
	__related: {
		folders: {
			[folderID: string]: FolderDocument | undefined;
		};
	};
} & TableDocument;

export type QuestlineWithRelated = {
	__related: {
		quests: {
			[questID: string]: QuestDocument | undefined;
		};
	};
} & QuestlineDocument;

export type QuestWithRelated = {
	__related: {
		goals: {
			[goalID: string]: GoalDocument | undefined;
		};
	};
} & QuestDocument;

export type ChartWithRelated<T extends GPTString = GPTString> = {
	__related: {
		song: SongDocument<GPTStringToGame[T]> | undefined;
	};
} & ChartDocument<T>;

type SongSeedsWithRelated = {
	[G in GameGroup as `songs-${G}.json`]: Array<SongDocument<G>>;
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
	"folders.json": Array<FolderDocument>;

	"goals.json": Array<GoalDocument>;
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
