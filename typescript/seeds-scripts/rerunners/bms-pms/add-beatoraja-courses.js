const { Command } = require("commander");
const fetch = require("node-fetch");

const { MutateCollection } = require("../../util");

const program = new Command();
program
	.option("-u, --url <header url>")
	.option("-p, --playtype <7K|14K>")
	.option("-s, --set <genocideDan | stslDan | lnDan>")
	.option("-i, --index <start index>");

program.parse(process.argv);
const options = program.opts();

if (
	!options.url ||
	!["7K", "14K"].includes(options.playtype) ||
	!options.set ||
	Number.isNaN(Number(options.index))
) {
	throw new Error(`Missing parameters.`);
}

(async () => {
	const data = await fetch(options.url).then((r) => r.json());

	MutateCollection("bms-course-lookup.json", (courses) => {
		const existingCourses = new Set(courses.map((e) => e.md5sums));

		let i = 0;
		for (const d of data.course[0]) {
			const md5sums = d.md5.join("");
			if (existingCourses.has(md5sums)) {
				continue;
			}

			courses.push({
				md5sums,
				playtype: options.playtype,
				set: options.set,
				title: d.name,
				value: Number(options.index) + i,
			});

			i++;
		}

		return courses;
	});
})();
