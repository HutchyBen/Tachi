import t from "tap";

import { BMS_TABLES } from "./bms-tables";

t.test("BMS Tables should be unique.", (t) => {
	const allKeys = BMS_TABLES.map((e) => `${e.playtype}-${e.prefix}`);

	t.strictSame(allKeys, [...new Set(allKeys)], "There should be no duplicate table prefixes.");

	t.end();
});
