import { describe, expect, it } from "vitest";

import { BMS_TABLES } from "./bms-tables";

describe("BMS_TABLES", () => {
	it("should have unique playtype-prefix keys", () => {
		const allKeys = BMS_TABLES.map((e) => `${e.playtype}-${e.prefix}`);

		expect(allKeys).toStrictEqual([...new Set(allKeys)]);
	});
});
