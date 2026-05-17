import { InnerQuestSectionGoal } from "#components/targets/quests/Quest";
import Muted from "#components/util/Muted";
import { type CellsRenderFN, type QuestWithRelated } from "#types/seeds";
import { StrSOV } from "#util/sorts";
import { type SearchFunctions } from "#util/ztable/search";
import React from "react";
import { FormatGame, type GoalDocument, type V3Game } from "tachi-common";

import { type Header } from "../components/TachiTable";

export const SeedsQuestsHeaders: Header<QuestWithRelated>[] = [
	["ID", "ID", StrSOV((x) => x.questID)],
	["Name", "Name", StrSOV((x) => x.name)],
	["Game", "Game", StrSOV((x) => x.game)],
	["Goals", "Goals"],
];

export const SeedsQuestSearchFns: SearchFunctions<QuestWithRelated> = {
	name: (x) => x.name,
	questID: (x) => x.questID,
	game: (x) => x.game,
	gpt: (x) => FormatGame(x.game as V3Game),
	goals: (x) =>
		Object.values(x.__related.goals)
			.map((e) => e!.name)
			.join(" "),
};

export const SeedsQuestCells: CellsRenderFN<QuestWithRelated> = ({
	data,
}: {
	data: QuestWithRelated;
}) => (
	<>
		<td>
			<code>{data.questID}</code>
		</td>
		<td>
			<strong>{data.name}</strong>
		</td>
		<td>{FormatGame(data.game as V3Game)}</td>
		<td>
			<div style={{ maxHeight: "200px", overflowY: "auto" }}>
				{data.questData.map((section) => (
					<>
						<h6>{section.title}</h6>
						{section.desc && <Muted>{section.desc}</Muted>}
						{section.goals.map((ref) => {
							const goal = data.__related.goals[ref.goalID];

							if (goal) {
								return (
									<div className="text-start" key={ref.goalID}>
										<InnerQuestSectionGoal goal={goal as GoalDocument} />
										{ref.note && <Muted>{ref.note}</Muted>}
									</div>
								);
							}

							return (
								<>
									<div>UNKNOWN GOAL: {ref.goalID}</div>
								</>
							);
						})}
					</>
				))}
			</div>
		</td>
	</>
);
