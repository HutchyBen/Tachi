export function FindChartWithPTDFVersion(collection, songID, playtype, difficulty, version) {
	return collection.find(
		(chart) =>
			chart.song.id === songID &&
			chart.playtype === playtype &&
			chart.difficulty === difficulty &&
			chart.versions.includes(version),
	);
}

export function FindSongWithTitle(collection, title) {
	return collection.find((e) => e.title === title || e.altTitles.includes(title));
}
