import { SELECT_QUESTLINE, ToQuestlineDocument } from "#lib/db-formats/questline";
import DB from "#services/pg/db";
import {
	type GameGroup,
	GamePTToV3,
	type MONGO_QuestlineDocument,
	type Playtype,
} from "tachi-common";

/**
 * All questlines for a game/playtype, with `quests` ordered by `questline_quest.sort_order`.
 */
export async function GetQuestlinesForGamePlaytype(
	game: GameGroup,
	playtype: Playtype,
): Promise<Array<MONGO_QuestlineDocument>> {
	const v3Game = GamePTToV3(game, playtype);

	const qlRows = await DB.selectFrom("questline")
		.select(SELECT_QUESTLINE)
		.where("questline.game", "=", v3Game)
		.execute();

	if (qlRows.length === 0) {
		return [];
	}

	const questlineIds = qlRows.map((r) => r.questline_id);

	const qqRows = await DB.selectFrom("questline_quest")
		.select(["questline_quest.questline_id", "questline_quest.quest_id", "questline_quest.sort_order"])
		.where("questline_quest.questline_id", "in", questlineIds)
		.orderBy("questline_quest.questline_id")
		.orderBy("questline_quest.sort_order")
		.execute();

	const byQuestline = new Map<string, Array<string>>();

	for (const row of qqRows) {
		const list = byQuestline.get(row.questline_id) ?? [];

		list.push(row.quest_id);
		byQuestline.set(row.questline_id, list);
	}

	return qlRows.map((row) => ToQuestlineDocument(row, byQuestline.get(row.questline_id) ?? []));
}

/**
 * One questline by id, scoped to game/playtype. `quests` are ordered by `questline_quest.sort_order`.
 */
export async function GetQuestlineById(
	game: GameGroup,
	playtype: Playtype,
	questlineID: string,
): Promise<MONGO_QuestlineDocument | undefined> {
	const v3Game = GamePTToV3(game, playtype);

	const row = await DB.selectFrom("questline")
		.select(SELECT_QUESTLINE)
		.where("questline.id", "=", questlineID)
		.where("questline.game", "=", v3Game)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	const qqRows = await DB.selectFrom("questline_quest")
		.select("questline_quest.quest_id")
		.where("questline_quest.questline_id", "=", questlineID)
		.orderBy("questline_quest.sort_order")
		.execute();

	return ToQuestlineDocument(
		row,
		qqRows.map((r) => r.quest_id),
	);
}
