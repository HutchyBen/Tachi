import { Command } from "commander";
import fs from "fs";
import { type MONGO_GoalDocument, type MONGO_QuestDocument } from "tachi-common";

import { CreateGoalID, CreateQuestID, MutateCollection } from "../util";

const program = new Command();
program.option("-f, --file <quests.json>");

program.parse(process.argv);
const options = program.opts();

// stolen from client/src/types/tachi.ts
type RawQuestDocument = {
	rawQuestData: Array<RawQuestSection>;
} & Omit<MONGO_QuestDocument, "questData" | "questID">;

type RawQuestSection = {
	desc: string;
	rawGoals: Array<RawQuestGoal>;
	title: string;
};

type RawQuestGoal = {
	goal: Pick<MONGO_GoalDocument, "charts" | "criteria" | "name">;
	note?: string;
};

const data = JSON.parse(fs.readFileSync(options.file, "utf-8")) as Array<RawQuestDocument>;

const newGoals: Array<MONGO_GoalDocument> = [];

function HydrateQuest(raw: RawQuestDocument): MONGO_QuestDocument {
	const questData: MONGO_QuestDocument["questData"] = [];

	const { game, playtype } = raw;

	for (const rawQuest of raw.rawQuestData) {
		const goals: Array<{ goalID: string; note?: string }> = [];

		for (const rawGoal of rawQuest.rawGoals) {
			const goalID = CreateGoalID(rawGoal.goal.charts, rawGoal.goal.criteria, game, playtype);

			const newGoal: MONGO_GoalDocument = {
				charts: rawGoal.goal.charts,
				criteria: rawGoal.goal.criteria,
				game,
				playtype,
				goalID,
				name: rawGoal.goal.name,
			} as MONGO_GoalDocument;

			newGoals.push(newGoal);

			goals.push({
				goalID,
				note: rawGoal.note,
			});
		}

		questData.push({
			title: rawQuest.title,
			desc: rawQuest.desc,
			goals,
		});
	}

	return {
		desc: raw.desc,
		name: raw.name,
		game,
		playtype,
		// just 20 random bytes. can't think of much more creative at the moment.
		questID: CreateQuestID(),
		questData,
	};
}

const newQuests = data.map(HydrateQuest);

MutateCollection("quests.json", (quests) => [...quests, ...newQuests]);

MutateCollection("goals.json", (goals) => {
	// don't duplicate goals
	const goalIDs = new Set(goals.map((e) => e.goalID));

	for (const goal of newGoals) {
		if (goalIDs.has(goal.goalID)) {
			continue;
		}

		// don't allow duplicates in incoming goals, either.
		goalIDs.add(goal.goalID);

		goals.push(goal);
	}

	return goals;
});
