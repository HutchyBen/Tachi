/**
 * Normalise `game` on `goals.json`, `quests.json`, and `questlines.json` to canonical {@link V3Game}
 * strings (aligned with Folder/Table migration in `3-migrate-folders-tables.ts`).
 *
 * Accepted shapes:
 * - Mongo-era **game group** + **playtype** → {@link LEGACY_GetGPTString} + {@link LEGACY_GPTStringToGame}.
 * - Already a **V3Game** string (passthrough).
 * - Colon **GPT strings** (`sdvx:Single`, …) → {@link LEGACY_GPTStringToGame}.
 *
 * Strips stale `playtype` when consumed or when `game` is already a V3 string. Runs before
 * `7-remap-goals-folder-and-chart-ids.ts` so goalID hashes use the corrected game.
 */

import {
	ALL_GAMES,
	type GameGroup,
	LEGACY_GetGPTString,
	type LEGACY_GPTString,
	LEGACY_GPTStringToGame,
	type LEGACY_Playtype,
	type V3Game,
} from "tachi-common";

import { ReadCollection, WriteCollection } from "../../util";

function isV3GameString(s: string): s is V3Game {
	return (ALL_GAMES as readonly string[]).includes(s);
}

function migrateSeedDocGame(entry: Record<string, unknown>, label: string): boolean {
	const rawGame = entry.game;

	if (typeof rawGame !== "string") {
		throw new Error(`${label}: expected string game, got ${JSON.stringify(rawGame)}`);
	}

	let changed = false;
	const hadPlaytypeKey = Object.hasOwn(entry, "playtype");

	const ptRaw = entry.playtype;
	const nonemptyPt =
		ptRaw !== undefined && ptRaw !== null && !(typeof ptRaw === "string" && ptRaw === "");

	let v3: V3Game;

	if (nonemptyPt) {
		v3 = LEGACY_GPTStringToGame(
			LEGACY_GetGPTString(rawGame as GameGroup, String(ptRaw) as LEGACY_Playtype),
		);
		delete entry.playtype;
		changed = rawGame !== v3 || hadPlaytypeKey;
	} else if (isV3GameString(rawGame)) {
		v3 = rawGame;
		if (hadPlaytypeKey) {
			delete entry.playtype;
			changed = true;
		}
	} else {
		const fromGptColon = LEGACY_GPTStringToGame(rawGame as LEGACY_GPTString);

		if (fromGptColon !== undefined && isV3GameString(fromGptColon)) {
			v3 = fromGptColon;
			changed = rawGame !== v3 || hadPlaytypeKey;
		} else {
			throw new Error(
				`${label}: could not migrate game ${JSON.stringify(rawGame)} to a V3Game ` +
					`(expected V3 string, GPT string such as 'sdvx:Single', or game group plus playtype)`,
			);
		}

		if (hadPlaytypeKey) {
			delete entry.playtype;
		}
	}

	entry.game = v3;

	return changed;
}

function migrateCollection(name: string, rowLabelPrefix: string): number {
	let changedRows = 0;
	const rows = ReadCollection(name) as Array<Record<string, unknown>>;

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]!;
		const human =
			rowLabelPrefix +
			String(row.name ?? row.questID ?? row.questlineID ?? `index ${String(i)}`);

		if (migrateSeedDocGame(row, human)) {
			changedRows++;
		}
	}

	WriteCollection(name, rows);

	return changedRows;
}

const goalsChanged = migrateCollection("goals.json", "goals.json ");
const questsChanged = migrateCollection("quests.json", "quests.json ");
const questlinesChanged = migrateCollection("questlines.json", "questlines.json ");

console.log(`goals.json: normalised game on ${String(goalsChanged)} goals`);
console.log(`quests.json: normalised game on ${String(questsChanged)} quests`);
console.log(`questlines.json: normalised game on ${String(questlinesChanged)} questlines`);
console.log(
	`done: ${String(goalsChanged + questsChanged + questlinesChanged)} total entries updated`,
);
