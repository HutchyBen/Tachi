const { GetGamePTConfig } = require("../../../common/src");

const { MutateCollection } = require("../../util");

const versions = Object.keys(GetGamePTConfig("chunithm", "Single").versions);

MutateCollection("charts-chunithm.json", (charts) => {
	for (const chart of charts) {
		chart.versions.sort((a, b) => versions.indexOf(a) - versions.indexOf(b));
	}

	return charts;
});
