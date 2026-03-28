import { log } from "#lib/log/log.js";
import { TestingIIDXEamusementCSV27 } from "#test-utils/test-data";
import t from "tap";

import { CSVParseError, NaiveCSVParse } from "./naive-csv-parser";

t.test("#ParseCSV", (t) => {
	t.test("Valid Basic CSV", (t) => {
		const headers = ["header1", "header2", "header3"];
		const rows = [
			["a", "b", "c"],
			["d", "e", "f"],
		];

		const headersStr = headers.join(",");
		const rowsStr = rows.map((r) => r.join(",")).join("\n");

		const csvBuffer = Buffer.from(`${headersStr}\n${rowsStr}`);

		const { rawHeaders, rawRows } = NaiveCSVParse(csvBuffer, log);

		t.strictSame(rawHeaders, headers);
		t.strictSame(rawRows, rows);

		t.end();
	});

	t.test("Valid Evil CSV", (t) => {
		const headers = ["header1", '"header2"', 'hea"der3'];
		const rows = [
			["a ", "bbbbbbbbbbbbbbbbbbbbbbbbbbb", ""],
			["d", '"', "冥"],
		];

		const headersStr = headers.join(",");
		const rowsStr = rows.map((r) => r.join(",")).join("\n");

		const csvBuffer = Buffer.from(`${headersStr}\n${rowsStr}\n`);

		const { rawHeaders, rawRows } = NaiveCSVParse(csvBuffer, log);

		t.strictSame(rawHeaders, headers);
		t.strictSame(rawRows, rows);

		t.end();
	});

	t.test("IIDX CSV", (t) => {
		const { rawHeaders, rawRows } = NaiveCSVParse(TestingIIDXEamusementCSV27, log);

		t.equal(rawHeaders.length, 41);
		t.equal(rawRows.length, 1257);

		t.ok(
			rawRows.every((e) => e.length === 41),
			`All Rows are of the correct size (41)`,
		);

		t.end();
	});

	t.test("Malicious Headers", (t) => {
		// these headers are valid, because we don't check the contents
		// only that it has the right amt of headers
		const headerStr = `${"a,".repeat(26)}a`;

		const TooShort = Buffer.from(`${headerStr}\n${"a,".repeat(3)}a`);

		t.throws(
			() => NaiveCSVParse(TooShort, log),
			new CSVParseError("Row 1 has an invalid amount of cells (4, expected 27)"),
		);

		const TooLong = Buffer.from(`${headerStr}\n${"a,".repeat(50)}a`);

		t.throws(
			() => NaiveCSVParse(TooLong, log),
			new CSVParseError("Row 1 has an invalid amount of cells (51, expected 27)"),
		);

		t.end();
	});

	t.test("Misshaped Rows", (t) => {
		const LongHeaders = Buffer.from(`${"a".repeat(1000)},a`);

		t.throws(
			() => NaiveCSVParse(LongHeaders, log),
			new CSVParseError("Headers were longer than 1000 characters long."),
		);

		const TooManyHeaders = Buffer.from(`${"a,".repeat(50)}a`);

		t.throws(
			() => NaiveCSVParse(TooManyHeaders, log),
			new CSVParseError("Too many CSV headers."),
		);

		t.end();
	});

	t.end();
});
