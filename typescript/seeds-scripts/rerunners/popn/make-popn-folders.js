import { Command } from "commander";

import { GetGamePTConfig } from "../../../common/src/index.ts";
import { CreateFolderID, MutateCollection } from "../../util.js";

const tableMainFolders = [];
const tableAllFolders = [];

const program = new Command();
program.requiredOption("-v, --version <version>");

program.parse(process.argv);
const options = program.opts();

const fmtVersion = GetGamePTConfig("popn", "9B").versions[options.version];

MutateCollection("folders.json", (folders) => {
	for (let i = 0; i < 3; i++) {
		const lb = 10 * i === 0 ? 1 : 10 * i;
		const ub = 10 * (i + 1) - 1;

		const folder = {
			data: {
				levelNum: {
					"~gte": lb,
					"~lte": ub,
				},
				versions: options.version,
			},
			game: "popn",
			inactive: false,
			playtype: "9B",
			searchTerms: [],
			title: `Level ${lb}-${ub} (${fmtVersion})`,
			type: "charts",
		};

		const folderID = CreateFolderID(folder.data, "popn", "9B");

		folder.folderID = folderID;

		tableMainFolders.push(folderID);
		folders.push(folder);
	}

	for (let i = 1; i <= 50; i++) {
		const folder = {
			data: {
				level: i.toString(),
				versions: options.version,
			},
			game: "popn",
			inactive: false,
			playtype: "9B",
			searchTerms: [],
			title: `Level ${i} (${fmtVersion})`,
			type: "charts",
		};

		const folderID = CreateFolderID(folder.data, "popn", "9B");

		folder.folderID = folderID;

		if (i > 30) {
			tableMainFolders.push(folderID);
		}

		tableAllFolders.push(folderID);

		folders.push(folder);
	}

	return folders;
});

MutateCollection("tables.json", (tables) => {
	tables.push({
		default: false,
		description: `All pop'n ${fmtVersion} levels individually.`,
		folders: tableAllFolders,
		game: "popn",
		inactive: false,
		playtype: "9B",
		tableID: `popn-9B-${options.version}-alllevels`,
		title: `Pop'n Music ${fmtVersion} All Levels`,
	});

	tables.push({
		default: false,
		description: `All pop'n ${fmtVersion} levels, with some folders joined together.`,
		folders: tableMainFolders,
		game: "popn",
		inactive: false,
		playtype: "9B",
		tableID: `popn-9B-${options.version}-levels`,
		title: `Pop'n Music ${fmtVersion} Levels`,
	});

	return tables;
});
