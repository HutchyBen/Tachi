import { log } from "#lib/log/log";
import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import { MockMulterFile } from "#test-utils/mock-multer";
import { TestingSDVXEamusementCSV } from "#test-utils/test-data";
import { describe, expect, it } from "vitest";

import type { SDVXEamusementCSVData } from "./types";

import ParseEamusementSDVXCSV from "./parser";

describe("ParseEamusementSDVXCSV", () => {
	it("parses the fixture CSV", () => {
		const file = MockMulterFile(TestingSDVXEamusementCSV, "score.csv");

		const { iterable, gameGroup } = ParseEamusementSDVXCSV(file, {}, log);

		expect(gameGroup).toBe("sdvx");

		const iterableData = iterable as Array<SDVXEamusementCSVData>;

		expect(iterableData.length).toBe(204);
	});

	it("rejects rows with wrong cell counts", () => {
		const buffer = Buffer.from(`${"a,".repeat(10)}a\n${"a,".repeat(3)}a`);

		const file = MockMulterFile(buffer, "score.csv");

		expect(() => ParseEamusementSDVXCSV(file, {}, log)).toThrow(ScoreImportFatalError);
		expect(() => ParseEamusementSDVXCSV(file, {}, log)).toThrow(
			"Row 1 has an invalid amount of cells (4, expected 11)",
		);
	});

	it("rejects CSV with wrong header count", () => {
		const buffer = Buffer.from(`${"a,".repeat(15)}a\n`.repeat(3));

		const file = MockMulterFile(buffer, "score.csv");

		expect(() => ParseEamusementSDVXCSV(file, {}, log)).toThrow(ScoreImportFatalError);
		expect(() => ParseEamusementSDVXCSV(file, {}, log)).toThrow(
			"Invalid CSV provided. CSV does not have the correct number of headers.",
		);
	});
});
