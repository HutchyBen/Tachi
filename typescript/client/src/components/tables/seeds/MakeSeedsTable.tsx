import DebugContent from "#components/util/DebugContent";
import { type CellsRenderFN, type ChangeIndicator } from "#types/seeds";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";

import SeedsIndicatorCell from "../cells/SeedsIndicatorCell";
import DropdownRow from "../components/DropdownRow";
import TachiTable, { type Header } from "../components/TachiTable";
import { EmptyHeader } from "../headers/IndicatorHeader";

export default function MakeSeedsTable<T>({
	dataset,
	headers: _headers,
	Cells,
	indicate = null,
	searchFns,
	entryName,
}: {
	Cells: CellsRenderFN<T>;
	dataset: T[];
	entryName: string;
	headers: Header<T>[];
	indicate?: ChangeIndicator;
	searchFns: SearchFunctions<T>;
}) {
	// clone headers so as to not mutate global state
	const headers = _headers.slice(0);

	if (indicate) {
		headers.unshift(EmptyHeader);
	}

	return (
		<TachiTable
			dataset={dataset}
			entryName={entryName}
			headers={headers}
			rowFunction={(data) => (
				<DropdownRow dropdown={<DebugContent data={{ ...data, __related: undefined }} />}>
					{indicate && <SeedsIndicatorCell indicate={indicate} />}
					<Cells data={data} />
				</DropdownRow>
			)}
			searchFunctions={searchFns}
		/>
	);
}
