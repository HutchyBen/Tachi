import { ReadCollection, WriteCollection } from "../../util";

const courses = ReadCollection("bms-course-lookup.json");
let modified = 0;

for (const entry of courses) {
	if (entry.game !== undefined && entry.playtype === undefined) {
		continue;
	}

	if (entry.playtype === undefined) {
		throw new Error(`Entry missing both playtype and game: ${JSON.stringify(entry)}`);
	}

	entry.game = entry.playtype === "7K" ? "bms-7k" : "bms-14k";
	delete entry.playtype;
	modified++;
}

WriteCollection("bms-course-lookup.json", courses);
console.log(`bms-course-lookup.json: migrated ${modified} entries`);
