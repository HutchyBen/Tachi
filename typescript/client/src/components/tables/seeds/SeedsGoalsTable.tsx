import { type CellsRenderFN } from "#types/seeds";
import { FlattenValue, StringifyKeyChain } from "#util/misc";
import { StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { FormatGameGroup, type MONGO_GoalDocument } from "tachi-common";

import { type Header } from "../components/TachiTable";

export const SeedsGoalsHeaders: Header<MONGO_GoalDocument>[] = [
	["ID", "ID", StrSOV((x) => x.goalID)],
	["Name", "Name", StrSOV((x) => x.name)],
	["GPT", "GPT", StrSOV((x) => `${x.game} ${x.playtype}`)],
	["Charts", "Charts"],
	["Criteria", "Criteria"],
];

export const SeedsGoalSearchFns: SearchFunctions<MONGO_GoalDocument> = {
	name: (x) => x.name,
	goalID: (x) => x.goalID,
	game: (x) => x.game,
	playtype: (x) => x.playtype,
	gpt: (x) => FormatGameGroup(x.game, x.playtype),
	type: (x) => x.charts.type,
	charts: (x) =>
		FlattenValue(x.charts)
			.map((e) => `${StringifyKeyChain(e.keychain)} ${e.value}`)
			.join("\n"),
	criteria: (x) =>
		FlattenValue(x.criteria)
			.map((e) => `${StringifyKeyChain(e.keychain)} ${e.value}`)
			.join("\n"),
};

export const SeedsGoalCells: CellsRenderFN<MONGO_GoalDocument> = ({
	data,
}: {
	data: MONGO_GoalDocument;
}) => (
	<>
		<td>
			<code>{data.goalID}</code>
		</td>
		<td>
			<strong>{data.name}</strong>
		</td>
		<td>{FormatGameGroup(data.game, data.playtype)}</td>
		<td>
			<div className="text-start">
				{FlattenValue(data.charts).map((e) => (
					<>
						{StringifyKeyChain(e.keychain)} = {String(e.value)}
						<br />
					</>
				))}
			</div>
		</td>
		<td>
			<div className="text-start">
				{FlattenValue(data.criteria).map((e) => (
					<>
						{StringifyKeyChain(e.keychain)} = {String(e.value)}
						<br />
					</>
				))}
			</div>
		</td>
	</>
);
