import Muted from "#components/util/Muted";
import { type CellsRenderFN, type DiffSeedsCollection } from "#types/seeds";
import { HeadersToDiffHeaders, SearchFnsToDiffSearchFns } from "#util/seeds";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { Col } from "react-bootstrap";

import SeedsDiffCell from "../cells/SeedsDiffCell";
import SeedsIndicatorCell from "../cells/SeedsIndicatorCell";
import DropdownRow from "../components/DropdownRow";
import TachiTable, { type Header } from "../components/TachiTable";

/**
 * Given all the necessary parts of a normal seeds table, render a table showing
 * its diffs instead.
 */
export default function MakeSeedsDiffTable<T>({
	headers,
	dataset,
	searchFns,
	entryName,
	Cells,
}: {
	Cells: CellsRenderFN<T>;
	dataset: DiffSeedsCollection<T>[];
	entryName: string;
	headers: Header<T>[];
	searchFns: SearchFunctions<T>;
}) {
	return (
		<TachiTable
			dataset={dataset}
			entryName={entryName}
			headers={HeadersToDiffHeaders(headers)}
			rowFunction={(x) => <DiffRow Cells={Cells} data={x} />}
			searchFunctions={SearchFnsToDiffSearchFns(searchFns)}
		/>
	);
}

function DiffRow<T>({ data, Cells }: { Cells: CellsRenderFN<T>; data: DiffSeedsCollection<T> }) {
	return (
		<DropdownRow
			dropdown={
				<div className="row">
					<Col className="mt-2" xs={12}>
						<table className="table">
							<thead>
								<tr>
									<td colSpan={100}>Old Entry</td>
								</tr>
							</thead>
							<tbody>
								<tr>
									<Cells data={data.base} />
								</tr>
							</tbody>
						</table>
						<br />
						<Muted>
							(This is what the row looked like before changes were applied.)
						</Muted>
					</Col>
				</div>
			}
		>
			<SeedsIndicatorCell indicate="MODIFIED" />
			<Cells compress data={data.head} />
			<SeedsDiffCell diffs={data.diff} />
		</DropdownRow>
	);
}
