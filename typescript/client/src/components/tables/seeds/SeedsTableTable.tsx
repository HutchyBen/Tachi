import Muted from "#components/util/Muted";
import { type CellsRenderFN, type TableWithRelated } from "#types/seeds";
import { StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { Badge } from "react-bootstrap";
import { FormatGame } from "tachi-common";

import { type Header } from "../components/TachiTable";

export const SeedsTableHeaders: Header<TableWithRelated>[] = [
	["ID", "ID", StrSOV((x) => x.tableID)],
	["Name", "Name", StrSOV((x) => x.title)],
	["GPT", "GPT", StrSOV((x) => x.game)],
	["Folders", "Folders", StrSOV((x) => x.title)],
];

export const SeedsTableSearchFns: SearchFunctions<TableWithRelated> = {
	title: (x) => x.title,
	tableID: (x) => x.tableID,
	inactive: (x) => x.inactive,
	default: (x) => x.default,
	description: (x) => x.description,
	game: (x) => x.game,
	gpt: (x) => FormatGame(x.game),
	folder: (x) =>
		Object.values(x.__related.folders)
			.filter((e) => e !== undefined)
			.map((e) => e!.title)
			.join("\n"),
};

export const SeedsTableCells: CellsRenderFN<TableWithRelated> = ({ data }) => (
	<>
		<td>
			<code>{data.tableID}</code>
		</td>
		<td>
			<strong>{data.title}</strong>
			<br />
			<Muted>{data.description}</Muted>
			{(data.inactive || data.default) && <br />}
			{data.default && <Badge bg="success">DEFAULT</Badge>}
			{data.inactive && <Badge bg="warning">INACTIVE</Badge>}
		</td>
		<td>{FormatGame(data.game)}</td>
		<td className="text-start">
			<div style={{ maxHeight: "200px", overflowY: "auto" }}>
				{data.folders.map((e) => {
					const folder = data.__related.folders[e];

					return (
						<div key={e}>
							{folder ? (
								<span>
									{folder.title} ({FormatGame(folder.game)})
								</span>
							) : (
								<span className="text-danger">UNKNOWN FOLDER {e}</span>
							)}
						</div>
					);
				})}
			</div>
		</td>
	</>
);
