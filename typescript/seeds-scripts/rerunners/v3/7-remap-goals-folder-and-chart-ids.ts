/**
 * After charts + folders gained Postgres-style ids (`id` plus `legacyChartID` /
 * `legacyFolderID`), `goals.json` may still reference legacy chart hashes and legacy
 * folder ids inside `charts.data`. Remap those references, recalculate `goalID` hashes
 * (same `{ charts, criteria, game }` convention as ../../util CreateGoalID), rewrite
 * `quests.json` goal refs when ids change, and write `goal-id-remap.json` so
 * mongo→postgres can translate subscriptions.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

import { CreateGoalID } from "../../util";

type GoalCharts =
	| { data: Array<string>; type: "multi" }
	| { data: string; folderSlug?: string; type: "folder" }
	| { data: string; type: "single" };

interface GoalSeed {
	charts: GoalCharts;
	criteria:
		| {
				countNum: number;
				key: string;
				mode: "absolute" | "proportion";
				value: number;
		  }
		| {
				key: string;
				mode: "single";
				value: number;
		  };
	game: string;
	goalID: string;
	name: string;
	playtype: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = path.join(__dirname, "../../../../db/seeds");

const LEGACY_CHART_HEX_RE = /^[0-9a-f]{40}$/u;

function readJsonArray<T>(filePath: string): Array<T> {
	return JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<T>;
}

function buildChartLegacyToIdMaps(): {
	canonicalChartIds: Set<string>;
	legacyToSeedId: Map<string, string>;
} {
	const legacyToSeedId = new Map<string, string>();
	const canonicalChartIds = new Set<string>();

	for (const name of fs.readdirSync(SEEDS_DIR)) {
		if (!/^charts-/u.test(name) || !name.endsWith(".json")) {
			continue;
		}

		const charts = readJsonArray<{ id: string; legacyChartID?: string }>(
			path.join(SEEDS_DIR, name),
		);

		for (const c of charts) {
			canonicalChartIds.add(c.id);
			const leg = c.legacyChartID;

			if (leg) {
				legacyToSeedId.set(leg.toLowerCase(), c.id);
			}
		}
	}

	return { canonicalChartIds, legacyToSeedId };
}

function buildFolderLegacyToIdMaps(): {
	canonicalFolderIds: Set<string>;
	legacyToSeedId: Map<string, string>;
} {
	const legacyToSeedId = new Map<string, string>();
	const canonicalFolderIds = new Set<string>();
	const folders = readJsonArray<{
		id: string;
		legacyFolderID: string;
	}>(path.join(SEEDS_DIR, "folders.json"));

	for (const f of folders) {
		canonicalFolderIds.add(f.id);

		const leg = f.legacyFolderID;

		if (leg !== undefined && leg !== "") {
			legacyToSeedId.set(leg.trim(), f.id);
		}
	}

	return { canonicalFolderIds, legacyToSeedId };
}

function resolveChartGoalRef(
	candidate: string,
	legacyToSeedId: Map<string, string>,
	canonicalChartIds: Set<string>,
	context: string,
	legacyHexRe: RegExp,
): string {
	const t = candidate.trim();
	const lowered = t.toLowerCase();

	if (canonicalChartIds.has(t)) {
		return t;
	}

	const migrated = legacyToSeedId.get(lowered);

	if (migrated !== undefined) {
		return migrated;
	}

	if (!legacyHexRe.test(t)) {
		console.warn(
			`${context}: chart ref ${JSON.stringify(t)} not in canonical set and not a known legacy SHA — leaving as-is`,
		);

		return t;
	}

	throw new Error(`${context}: unknown legacy chart SHA ${JSON.stringify(t)}`);
}

function resolveFolderGoalRef(
	candidate: string,
	legacyToSeedId: Map<string, string>,
	canonicalFolderIds: Set<string>,
	context: string,
): string {
	const t = candidate.trim();

	if (canonicalFolderIds.has(t)) {
		return t;
	}

	const migrated = legacyToSeedId.get(t);

	if (migrated !== undefined) {
		return migrated;
	}

	throw new Error(`${context}: unknown folder reference ${JSON.stringify(t)}`);
}

function remapChartsBlock(
	charts: GoalCharts,
	context: string,
	legacyHexRe: RegExp,
	legacyToSeedChart: Map<string, string>,
	canonicalChartIds: Set<string>,
	legacyToSeedFolder: Map<string, string>,
	canonicalFolderIds: Set<string>,
): GoalCharts {
	switch (charts.type) {
		case "single":
			return {
				...charts,
				data: resolveChartGoalRef(
					charts.data,
					legacyToSeedChart,
					canonicalChartIds,
					context,
					legacyHexRe,
				),
			};
		case "multi":
			return {
				...charts,
				data: charts.data.map((cid, i) =>
					resolveChartGoalRef(
						cid,
						legacyToSeedChart,
						canonicalChartIds,
						`${context} [multi ${i}]`,
						legacyHexRe,
					),
				),
			};
		case "folder":
			return {
				...charts,
				data: resolveFolderGoalRef(
					charts.data,
					legacyToSeedFolder,
					canonicalFolderIds,
					context,
				),
			};
	}
}

const translateMap = new Map<string, string>();

const goalsPath = path.join(SEEDS_DIR, "goals.json");
const goals = readJsonArray<GoalSeed>(goalsPath);

const { canonicalChartIds, legacyToSeedId: chartLegacy } = buildChartLegacyToIdMaps();
const { canonicalFolderIds, legacyToSeedId: folderLegacy } = buildFolderLegacyToIdMaps();

for (const goal of goals) {
	const oldId = goal.goalID;

	goal.charts = remapChartsBlock(
		goal.charts,
		`goal ${JSON.stringify(goal.name)} (${oldId})`,
		LEGACY_CHART_HEX_RE,
		chartLegacy,
		canonicalChartIds,
		folderLegacy,
		canonicalFolderIds,
	);

	const newId = CreateGoalID(goal.charts, goal.criteria, goal.game);

	goal.goalID = newId;

	if (newId !== oldId) {
		translateMap.set(oldId, newId);
	}
}

console.log(`goals.json: remapped chart/folder refs; ${translateMap.size} goal IDs will change`);

fs.writeFileSync(goalsPath, `${JSON.stringify(goals, null, "\t")}\n`);

type QuestSeed = {
	desc: string;
	game: string;
	name: string;
	playtype: string;
	questData: Array<{
		desc?: string;
		goals: Array<{ goalID: string; note?: string }>;
		title: string;
	}>;
	questID: string;
};

const questsPath = path.join(SEEDS_DIR, "quests.json");
const quests = readJsonArray<QuestSeed>(questsPath);

let questsUpdated = 0;

for (const quest of quests) {
	let touched = false;

	for (const qd of quest.questData) {
		for (let i = 0; i < qd.goals.length; i++) {
			const gRef = qd.goals[i];
			const nextId = translateMap.get(gRef.goalID);

			if (nextId !== undefined && nextId !== gRef.goalID) {
				qd.goals[i] = { ...gRef, goalID: nextId };
				touched = true;
			}
		}
	}

	if (touched) {
		questsUpdated++;
	}
}

fs.writeFileSync(questsPath, `${JSON.stringify(quests, null, "\t")}\n`);
console.log(`quests.json: updated goal refs on ${questsUpdated} quests`);

const remapPath = path.join(SEEDS_DIR, "goal-id-remap.json");
fs.writeFileSync(remapPath, `${JSON.stringify(Object.fromEntries(translateMap), null, "\t")}\n`);

console.log(`goal-id-remap.json: wrote ${translateMap.size} translations`);

const repoRoot = path.resolve(SEEDS_DIR, "..", "..");
const biome = path.join(repoRoot, "node_modules", ".bin", "biome");
const biomeResult = spawnSync(biome, ["format", "--write", goalsPath, questsPath, remapPath], {
	cwd: repoRoot,
	stdio: "inherit",
});

if (biomeResult.status !== 0) {
	throw new Error(`biome format exited ${biomeResult.status}`);
}
