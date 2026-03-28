import Divider from "#components/util/Divider";
import Muted from "#components/util/Muted";
import { type CellsRenderFN } from "#types/seeds";
import { FlattenValue, StringifyKeyChain } from "#util/misc";
import { StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { Badge } from "react-bootstrap";
import { FormatGameGroup, type MONGO_FolderDocument } from "tachi-common";

import { type Header } from "../components/TachiTable";

export const SeedsFolderHeaders: Header<MONGO_FolderDocument>[] = [
	["ID", "ID", StrSOV((x) => x.folderID)],
	["Name", "Name", StrSOV((x) => x.title)],
	["GPT", "GPT", StrSOV((x) => `${x.game} ${x.playtype}`)],
	["Query", "Query", StrSOV((x) => x.title)],
];

export const SeedsFolderSearchFns: SearchFunctions<MONGO_FolderDocument> = {
	title: (x) => x.title,
	folderID: (x) => x.folderID,
	inactive: (x) => x.inactive,
	game: (x) => x.game,
	playtype: (x) => x.playtype,
	gpt: (x) => FormatGameGroup(x.game, x.playtype),
	type: (x) => x.type,
	query: (x) =>
		FlattenValue(x.data)
			.map((e) => `${StringifyKeyChain(e.keychain)} ${e.value}`)
			.join("\n"),
};

export const SeedsFolderCells: CellsRenderFN<MONGO_FolderDocument> = ({
	data,
}: {
	data: MONGO_FolderDocument;
}) => (
	<>
		<td>
			<code>{data.folderID}</code>
		</td>
		<td>
			<strong>{data.title}</strong>
			{data.searchTerms && data.searchTerms.length !== 0 && (
				<>
					<br />
					<Muted>{data.searchTerms.join(", ")}</Muted>
				</>
			)}
			{data.inactive && (
				<>
					<br />
					<Badge bg="warning">INACTIVE</Badge>
				</>
			)}
		</td>
		<td>{FormatGameGroup(data.game, data.playtype)}</td>
		<td>
			TYPE: <b>{data.type}</b>
			<Divider />
			<div className="text-start">
				{FlattenValue(data.data).map((e) => (
					<>
						{StringifyKeyChain(e.keychain)} = {String(e.value)}
						<br />
					</>
				))}
			</div>
		</td>
	</>
);
