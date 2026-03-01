import TableValueGetters from "#lookups";
import { type BMSTableEntryMD5, LoadBMSTable } from "bms-table-loader";
import { BMS_TABLES, type Playtypes } from "tachi-common";

import type { BMSTablesDataset } from "./types";

export interface TableRes {
	table: BMSTablesDataset;
	charts: Array<BMSTableEntryMD5>;
}

export default async function GetTableData(
	forPlaytype: Playtypes["bms"],
): Promise<Array<TableRes>> {
	const out = [];

	for (const table of BMS_TABLES.filter(
		(e) => e.name in TableValueGetters && e.playtype === forPlaytype,
	)) {
		// eslint-disable-next-line no-await-in-loop
		const bmsTable = await LoadBMSTable(table.url);

		out.push({
			table,
			charts: bmsTable.body
				.filter((e) => e.checksum.type === "md5")
				.map((e) => e.content) as Array<BMSTableEntryMD5>,
		});
	}

	return out;
}
