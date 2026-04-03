import type { MONGO_QuestlineDocument } from "tachi-common";
import { V3ToGamePT } from "tachi-common";
import { type Selection } from "kysely";
import { type Database } from "tachi-db";

export const SELECT_QUESTLINE = [
	"questline.id as questline_id",
	"questline.game as questline_game",
	"questline.name as questline_name",
	"questline.description as questline_description",
] as const;

export type QuestlineRow = Selection<Database, "questline", (typeof SELECT_QUESTLINE)[number]>;

export function ToQuestlineDocument(
	row: QuestlineRow,
	questIdsOrdered: Array<string>,
): MONGO_QuestlineDocument {
	const { game, playtype } = V3ToGamePT(row.questline_game);

	return {
		questlineID: row.questline_id,
		name: row.questline_name,
		desc: row.questline_description,
		game,
		playtype,
		quests: questIdsOrdered,
	};
}
