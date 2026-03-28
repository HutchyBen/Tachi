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

/** v3 `folders.json` omits `type`; infer from SQL body when needed. */
function folderSeedKindLabel(x: MONGO_FolderDocument): string {
	const ext = x as unknown as { type?: string; where?: string };

	if (typeof ext.type === "string") {
		return ext.type;
	}

	const w = ext.where ?? "";

	if (w.includes("s.data")) {
		return "songs";
	}

	return "charts";
}

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
	type: (x) => folderSeedKindLabel(x),
	query: (x) => {
		const w = (x as { where?: string }).where;

		if (typeof w === "string" && w.length > 0) {
			return w;
		}

		return FlattenValue(x.data)
			.map((e) => `${StringifyKeyChain(e.keychain)} ${e.value}`)
			.join("\n");
	},
};

export const SeedsFolderCells: CellsRenderFN<MONGO_FolderDocument> = ({
	data,
}: {
	data: MONGO_FolderDocument;
}) => {
	const whereSql = (data as unknown as { where?: string }).where;
	const showWhere = typeof whereSql === "string" && whereSql.length > 0;

	return (
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
				TYPE: <b>{folderSeedKindLabel(data)}</b>
				<Divider />
				<div className="text-start">
					{showWhere ? (
						<code className="text-break">{whereSql}</code>
					) : (
						FlattenValue(data.data).map((e, i) => (
							<React.Fragment key={i}>
								{StringifyKeyChain(e.keychain)} = {String(e.value)}
								<br />
							</React.Fragment>
						))
					)}
				</div>
			</td>
		</>
	);
};
