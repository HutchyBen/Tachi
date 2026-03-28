import { type CellsRenderFN } from "#types/seeds";
import { FlattenValue, StringifyKeyChain } from "#util/misc";
import { NumericSOV, StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { type GameGroup, type MONGO_SongDocument } from "tachi-common";

import ObjCell from "../cells/ObjCell";
import TitleCell from "../cells/TitleCell";
import { type Header } from "../components/TachiTable";

export function MakeSeedsSongsControls(game: GameGroup): {
	Cells: CellsRenderFN<MONGO_SongDocument>;
	headers: Header<MONGO_SongDocument>[];
	searchFns: SearchFunctions<MONGO_SongDocument>;
} {
	return {
		headers: [
			["ID", "ID", NumericSOV((x) => x.id)],
			["Title", "Title", StrSOV((x) => x.title)],
			["Data", "Data"],
		],
		searchFns: {
			artist: (x) => x.artist,
			title: (x) => x.title,
			songID: (x) => x.id,
			searchTerms: (x) => x.searchTerms.join(", "),
			altTitles: (x) => x.altTitles.join(", "),
			data: (x) =>
				FlattenValue(x.data)
					.map((e) => `${StringifyKeyChain(e.keychain)} ${e.value}`)
					.join("\n"),
		},
		Cells: ({ data }) => (
			<>
				<td>{data.id}</td>
				<TitleCell game={game} showAltTitles showSearchTerms song={data} />
				<ObjCell data={data.data} />
			</>
		),
	};
}
