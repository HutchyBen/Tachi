import Muted from "#components/util/Muted";
import { type CellsRenderFN, type QuestlineWithRelated } from "#types/seeds";
import { StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import {
	type GameGroup,
	LEGACY_FormatGameGroupPT,
	type LEGACY_Playtypes,
} from "tachi-common";

import { type Header } from "../components/TachiTable";

export const SeedsQuestlineHeaders: Header<QuestlineWithRelated>[] = [
	["ID", "ID", StrSOV((x) => x.questlineID)],
	["Name", "Name", StrSOV((x) => x.name)],
	["GPT", "GPT", StrSOV((x) => x.game)],
	["Quests", "Quests"],
];

export const SeedsQuestlineSearchFns: SearchFunctions<QuestlineWithRelated> = {
	name: (x) => x.name,
	questlineID: (x) => x.questlineID,
	desc: (x) => x.desc,
	game: (x) => x.game,
	gpt: (x) =>
		LEGACY_FormatGameGroupPT(
			x.game as GameGroup,
			x.playtype as LEGACY_Playtypes[typeof x.game],
		),
	quests: (x) =>
		Object.values(x.__related.quests)
			.filter((e) => e !== undefined)
			.map((e) => e!.name)
			.join("\n"),
};

export const SeedsQuestlineCells: CellsRenderFN<QuestlineWithRelated> = ({ data }) => (
	<>
		<td>
			<code>{data.questlineID}</code>
		</td>
		<td>
			<strong>{data.name}</strong>
			<br />
			<Muted>{data.desc}</Muted>
		</td>
		<td>
			{LEGACY_FormatGameGroupPT(
				data.game as GameGroup,
				data.playtype as LEGACY_Playtypes[typeof data.game],
			)}
		</td>
		<td className="text-start">
			<div style={{ maxHeight: "200px", overflowY: "auto" }}>
				{data.quests.map((e) => {
					const quest = data.__related.quests[e];

					return (
						<div key={e}>
							{quest ? (
								<span>
									{quest.name} (
									{LEGACY_FormatGameGroupPT(
										quest.game as GameGroup,
										quest.playtype as LEGACY_Playtypes[typeof quest.game],
									)}
									)
								</span>
							) : (
								<span className="text-danger">UNKNOWN QUEST {e}</span>
							)}
						</div>
					);
				})}
			</div>
		</td>
	</>
);
