import { log } from "#log";
import { LoadBMSTable } from "bms-table-loader";
import {
	BMS_TABLES,
	type BMSTableInfo,
	type FolderDocument,
	type TableDocument,
} from "tachi-common";

import { MutateCollection, ReadCollection } from "../../util";

const existsTables = ReadCollection("tables.json").map((e) => e.tableID);
const existsFolders = ReadCollection("folders.json").map((e) => e.folderID);

async function UpdateTable(tableInfo: BMSTableInfo) {
	const tableID = `bms-${tableInfo.playtype}-${tableInfo.asciiPrefix}`;

	if (existsTables.includes(tableID)) {
		return;
	}

	log.info(`Fetching ${tableInfo.url} (${tableInfo.name})...`);
	const table = await LoadBMSTable(tableInfo.url);
	log.info(`Fetched.`);

	const levels = table.getLevelOrder();

	const folders: Array<FolderDocument> = [];

	for (const level of levels) {
		const f: Omit<FolderDocument, "folderID"> = {
			title: `${tableInfo.prefix}${level}`,
			playtype: tableInfo.playtype,
			game: "bms",
			searchTerms: [],
			type: "charts",
			data: {
				"data¬tableFolders": {
					"~elemMatch": {
						level: level.toString(),
						table: tableInfo.prefix,
					},
				},
			},
			inactive: false,
		};

		const folderID = CreateFolderIDFromFolder(f);

		const realFolder = {
			...f,
			folderID,
		} as FolderDocument;

		if (existsFolders.includes(folderID)) {
			continue;
		}

		folders.push(realFolder);

		log.info(`Inserted new folder ${tableInfo.prefix}${level}.`);
	}

	MutateCollection("folders.json", (f) => {
		f.push(...folders);
		return f;
	});

	MutateCollection("tables.json", (t: Array<TableDocument>) => {
		t.push({
			folders: folders.map((e) => e.folderID),
			game: "bms",
			default: false,
			playtype: tableInfo.playtype,
			inactive: false,
			description: tableInfo.description,
			title: tableInfo.name,
			tableID: tableID,
		});
		return t;
	});

	log.info(`Bumped table ${tableInfo.name}.`);

	log.info(`Checking meta-folder...`);

	const f = {
		title: tableInfo.name,
		playtype: tableInfo.playtype,
		game: "bms",
		searchTerms: [tableInfo.asciiPrefix],
		type: "charts",
		data: {
			"data¬tableFolders¬table": tableInfo.prefix,
		},
		inactive: false,
	};

	const folderID = CreateFolderIDFromFolder(f);

	const realFolder = {
		...f,
		folderID,
	} as FolderDocument;

	// add this to meta table.
	if (!existsFolders.includes(folderID)) {
		MutateCollection("tables.json", (tables) => {
			for (const table of tables) {
				if (table.tableID === `bms-${tableInfo.playtype}-meta`) {
					table.folders.push(folderID);
				}
			}

			return tables;
		});

		MutateCollection("folders.json", (folders) => [...folders, realFolder]);
	}

	log.info(`Done.`);
}

(async () => {
	for (const table of BMS_TABLES) {
		await UpdateTable(table);
	}
})();
