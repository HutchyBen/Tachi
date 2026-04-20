import { type BMSCourseWithRelated, type CellsRenderFN } from "#types/seeds";
import { StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { FormatChart, GetBMSCourseIndex } from "tachi-common";

import { type Header } from "../components/TachiTable";

export const SeedsBMSCourseLookupHeaders: Header<BMSCourseWithRelated>[] = [
	["Title", "Title", StrSOV((x) => x.title)],
	["Charts", "Charts", StrSOV((x) => x.title)],
	[
		"Set (Index)",
		"Set (Idx)",
		(a, b) => {
			const a2 = `${a.game} ${a.set}`;
			const b2 = `${b.game} ${b.set}`;

			if (a2 === b2) {
				return GetBMSCourseIndex(a) - GetBMSCourseIndex(b);
			}

			return a2.localeCompare(b2);
		},
	],
];

export const SeedsBMSCourseLookupSearchFns: SearchFunctions<BMSCourseWithRelated> = {
	title: (x) => x.title,
	set: (x) => `${x.game} ${x.set}`,
	md5: (x) => x.md5sums,
	value: (x) => x.value,
	game: (x) => x.game,
	// don't ask
	// it gets all the songtitles and joins them
	song: (x) =>
		x.__related.entries
			.map((e) => {
				if (typeof e === "string") {
					return `UNKNOWN CHART (${e})`;
				}

				return FormatChart(e.chart);
			})
			.join("\n"),
};

export const SeedsBMSCourseLookupCells: CellsRenderFN<BMSCourseWithRelated> = ({
	data,
	compress,
}) => (
	<>
		<td>
			<strong>{data.title}</strong>
		</td>
		<td className="text-start">
			{data.__related.entries.map((e, i) => (
				<div className="d-flex w-100" key={i}>
					{typeof e === "string" ? (
						<span className="text-danger">UNKNOWN CHART</span>
					) : (
						<span>{FormatChart(e.chart)} </span>
					)}

					{!compress && (
						<div className="ms-auto" key={i}>
							<code>{typeof e === "string" ? e : e.chart.data.hashMD5}</code>
						</div>
					)}
				</div>
			))}
		</td>
		<td>
			{data.game} {data.set} ({data.value})
		</td>
	</>
);
