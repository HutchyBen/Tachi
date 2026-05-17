import Muted from "#components/util/Muted";
import { type CellsRenderFN, type QuestlineWithRelated } from "#types/seeds";
import { StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { FormatGame, type V3Game } from "tachi-common";

import { type Header } from "../components/TachiTable";

export const SeedsQuestlineHeaders: Header<QuestlineWithRelated>[] = [
	["ID", "ID", StrSOV((x) => x.questlineID)],
	["Name", "Name", StrSOV((x) => x.name)],
	["Game", "Game", StrSOV((x) => x.game)],
	["Quests", "Quests"],
];

export const SeedsQuestlineSearchFns: SearchFunctions<QuestlineWithRelated> = {
	name: (x) => x.name,
	questlineID: (x) => x.questlineID,
	desc: (x) => x.desc,
	game: (x) => x.game,
	gpt: (x) => FormatGame(x.game as V3Game),
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
		<td>{FormatGame(data.game as V3Game)}</td>
		<td className="text-start">
			<div style={{ maxHeight: "200px", overflowY: "auto" }}>
				{data.quests.map((e) => {
					const quest = data.__related.quests[e];

					return (
						<div key={e}>
							{quest ? (
								<span>
									{quest.name} ({FormatGame(quest.game as V3Game)})
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
