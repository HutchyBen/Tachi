import { type CellsRenderFN } from "#types/seeds";
import { FlattenValue, StringifyKeyChain } from "#util/misc";
import { StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { FormatGame, type GoalDocument } from "tachi-common";

import { type Header } from "../components/TachiTable";

export const SeedsGoalsHeaders: Header<GoalDocument>[] = [
	["ID", "ID", StrSOV((x) => x.goalID)],
	["Name", "Name", StrSOV((x) => x.name)],
	["GPT", "GPT", StrSOV((x) => x.game)],
	["Charts", "Charts"],
	["Criteria", "Criteria"],
];

export const SeedsGoalSearchFns: SearchFunctions<GoalDocument> = {
	name: (x) => x.name,
	goalID: (x) => x.goalID,
	game: (x) => x.game,
	gpt: (x) => FormatGame(x.game),
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

export const SeedsGoalCells: CellsRenderFN<GoalDocument> = ({ data }: { data: GoalDocument }) => (
	<>
		<td>
			<code>{data.goalID}</code>
		</td>
		<td>
			<strong>{data.name}</strong>
		</td>
		<td>{FormatGame(data.game)}</td>
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
