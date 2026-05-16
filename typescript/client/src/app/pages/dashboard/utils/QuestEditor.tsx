/**
 * Quest & Questline Editor
 *
 * Three-panel layout:
 *   Left  — Quest list + "New Quest" inline form
 *   Centre — Selected quest editor (EditableQuest)
 *   Right  — Questline composer
 *
 * Everything is saved to localStorage under LOCAL_QUEST_KEY / LOCAL_QUESTLINE_KEY.
 * Export produces separate quests.json and questlines.json files.
 */

import useSetSubheader from "#components/layout/header/useSetSubheader";
import EditableQuest from "#components/targets/quests/editor/EditableQuest";
import Divider from "#components/util/Divider";
import EditableText from "#components/util/EditableText";
import Icon from "#components/util/Icon";
import Muted from "#components/util/Muted";
import { TachiConfig } from "#lib/config";
import { type RawQuestDocument, type RawQuestlineDocument } from "#types/tachi";
import { ChangeAtPosition, DeleteInPosition } from "#util/misc";
import { p, type PrudenceSchema } from "prudence";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Col, Form, Modal, Row } from "react-bootstrap";
import {
	FormatGame,
	type GameGroup,
	FormatPrError,
	GetGameGroupConfig,
	LEGACY_GameGroupPTToGame,
	type LEGACY_GPTString,
	type LEGACY_Playtype,
	type V3Game,
} from "tachi-common";

// ─── localStorage keys ────────────────────────────────────────────────────────

const LOCAL_QUEST_KEY = "LOCAL_QUESTS";
const LOCAL_QUESTLINE_KEY = "LOCAL_QUESTLINES";

// ─── Validation schemas ───────────────────────────────────────────────────────

const PR_LOCAL_QUESTS_SCHEMA: PrudenceSchema = {
	json: [
		{
			game: p.isIn(TachiConfig.GAME_GROUPS),
			playtype: (self, parent) => {
				const gameConfig = GetGameGroupConfig(parent.game as GameGroup);

				if (!(gameConfig.playtypes as ReadonlyArray<unknown>).includes(self)) {
					return `Invalid playtype '${String(self)}' for ${String(parent.game)}`;
				}

				return true;
			},
			name: "string",
			desc: "string",
			rawQuestData: [
				{
					title: "string",
					desc: p.optional("string"),
					rawGoals: [
						{
							goal: {
								name: "string",
								charts: p.or(
									{ type: p.is("folder"), data: "string" },
									{ type: p.is("multi"), data: ["string"] },
									{ type: p.is("single"), data: "string" },
								),
								criteria: p.or(
									{ mode: p.is("single"), key: "string", value: "number" },
									{
										mode: p.isIn("absolute", "proportion"),
										countNum: p.isPositive,
										key: "string",
										value: "number",
									},
								),
							},
							note: p.optional("string"),
						},
					],
				},
			],
		},
	],
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadLocalQuests(): Array<RawQuestDocument> {
	try {
		const data = window.localStorage.getItem(LOCAL_QUEST_KEY);

		if (!data) {
			return [];
		}

		const json = JSON.parse(data);
		const err = p({ json }, PR_LOCAL_QUESTS_SCHEMA);

		if (err) {
			if (
				confirm(
					`Failed to validate local quests: ${FormatPrError(err)}. Delete all and start again?`,
				)
			) {
				return [];
			}
		}

		return json as RawQuestDocument[];
	} catch {
		return [];
	}
}

function loadLocalQuestlines(): Array<RawQuestlineDocument> {
	try {
		const data = window.localStorage.getItem(LOCAL_QUESTLINE_KEY);

		if (!data) {
			return [];
		}

		return JSON.parse(data) as RawQuestlineDocument[];
	} catch {
		return [];
	}
}

function downloadJson(data: unknown, filename: string) {
	const href = `data:application/json;charset=UTF-8,${encodeURIComponent(JSON.stringify(data, null, "\t"))}`;
	const a = document.createElement("a");
	a.href = href;
	a.download = filename;
	a.click();
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuestEditor() {
	useSetSubheader(["Developer Utils", "Quest & Questline Editor"]);

	const initQuests = useMemo(() => loadLocalQuests(), []);
	const initQuestlines = useMemo(() => loadLocalQuestlines(), []);

	const [quests, setQuests] = useState<Array<RawQuestDocument>>(initQuests);
	const [questlines, setQuestlines] = useState<Array<RawQuestlineDocument>>(initQuestlines);
	const [selectedQuestIdx, setSelectedQuestIdx] = useState<number | null>(null);

	const [showImportQuests, setShowImportQuests] = useState(false);
	const [showImportQuestlines, setShowImportQuestlines] = useState(false);

	// ── Persist to localStorage on every change ────────────────────────────────
	useEffect(() => {
		window.localStorage.setItem(LOCAL_QUEST_KEY, JSON.stringify(quests));
	}, [quests]);

	useEffect(() => {
		window.localStorage.setItem(LOCAL_QUESTLINE_KEY, JSON.stringify(questlines));
	}, [questlines]);

	// ── Derived ────────────────────────────────────────────────────────────────
	const selectedQuest = selectedQuestIdx !== null ? quests[selectedQuestIdx] ?? null : null;

	const addQuest = (gptString: LEGACY_GPTString) => {
		const [game, playtype] = gptString.split(":") as [GameGroup, LEGACY_Playtype];
		const v3Game: V3Game = LEGACY_GameGroupPTToGame(game, playtype);

		const newQuest: RawQuestDocument = {
			game: v3Game,
			name: "Untitled Quest",
			desc: "Please set a description.",
			rawQuestData: [],
		};

		setQuests((prev) => {
			const updated = [...prev, newQuest];
			setSelectedQuestIdx(updated.length - 1);
			return updated;
		});
	};

	return (
		<Row className="g-3">
			<Col xs={12}>
				<h2 className="mb-1">Quest &amp; Questline Editor</h2>
				<p className="text-body-secondary small">
					Build quests and questlines locally, then download the JSON files and submit
					them as a PR to be included on the site.
				</p>
				<Divider />
			</Col>

			{/* ── Left panel: Quest list ─────────────────────────────────────── */}
			<Col lg={3} xs={12}>
				<div className="d-flex align-items-center justify-content-between mb-2">
					<h5 className="mb-0">Quests</h5>
					<Badge bg="secondary">{quests.length}</Badge>
				</div>

				<QuestList
					onAddQuest={addQuest}
					onSelect={setSelectedQuestIdx}
					quests={quests}
					selectedIdx={selectedQuestIdx}
				/>

				<Divider />

				<div className="d-flex flex-column gap-2">
					{quests.length > 0 && (
						<Button
							onClick={() => downloadJson(quests, `quests-${Date.now()}.json`)}
							size="sm"
							variant="outline-success"
						>
							<Icon type="download" /> Download quests.json
						</Button>
					)}
					<Button
						onClick={() => setShowImportQuests(true)}
						size="sm"
						variant="outline-info"
					>
						<Icon type="upload" /> Import quests.json
					</Button>
					{quests.length > 0 && (
						<Button
							onClick={() => {
								if (confirm("Delete all quests and start over?")) {
									setQuests([]);
									setSelectedQuestIdx(null);
								}
							}}
							size="sm"
							variant="outline-danger"
						>
							Clear All Quests
						</Button>
					)}
				</div>
			</Col>

			{/* ── Centre panel: Quest editor ─────────────────────────────────── */}
			<Col lg={5} xs={12}>
				{selectedQuest && selectedQuestIdx !== null ? (
					<EditableQuest
						onChange={(updated) =>
							setQuests(ChangeAtPosition(quests, updated, selectedQuestIdx))
						}
						onDelete={() => {
							setQuests(DeleteInPosition(quests, selectedQuestIdx));
							setSelectedQuestIdx(null);
						}}
						quest={selectedQuest}
					/>
				) : (
					<div className="d-flex h-100 align-items-center justify-content-center text-center text-body-secondary border rounded p-4">
						<div>
							<Icon type="arrow-left" />
							<p className="mt-2 small">Select a quest from the list to edit it.</p>
						</div>
					</div>
				)}
			</Col>

			{/* ── Right panel: Questline composer ───────────────────────────── */}
			<Col lg={4} xs={12}>
				<div className="d-flex align-items-center justify-content-between mb-2">
					<h5 className="mb-0">Questlines</h5>
					<Badge bg="secondary">{questlines.length}</Badge>
				</div>

				<QuestlineComposer
					onAddQuestline={(ql) => setQuestlines((prev) => [...prev, ql])}
					onUpdate={(updated, idx) =>
						setQuestlines(ChangeAtPosition(questlines, updated, idx))
					}
					onDelete={(idx) => setQuestlines(DeleteInPosition(questlines, idx))}
					questlines={questlines}
					quests={quests}
				/>

				<Divider />

				<div className="d-flex flex-column gap-2">
					{questlines.length > 0 && (
						<Button
							onClick={() =>
								downloadJson(questlines, `questlines-${Date.now()}.json`)
							}
							size="sm"
							variant="outline-success"
						>
							<Icon type="download" /> Download questlines.json
						</Button>
					)}
					<Button
						onClick={() => setShowImportQuestlines(true)}
						size="sm"
						variant="outline-info"
					>
						<Icon type="upload" /> Import questlines.json
					</Button>
					{questlines.length > 0 && (
						<Button
							onClick={() => {
								if (confirm("Delete all questlines?")) {
									setQuestlines([]);
								}
							}}
							size="sm"
							variant="outline-danger"
						>
							Clear All Questlines
						</Button>
					)}
				</div>
			</Col>

			{/* Import modals */}
			{showImportQuests && (
				<ImportJsonModal
					description="quests.json"
					onHide={() => setShowImportQuests(false)}
					onImport={(data) => {
						setQuests(data as RawQuestDocument[]);
						setSelectedQuestIdx(null);
					}}
					schema={PR_LOCAL_QUESTS_SCHEMA}
				/>
			)}
			{showImportQuestlines && (
				<ImportJsonModal
					description="questlines.json"
					onHide={() => setShowImportQuestlines(false)}
					onImport={(data) => setQuestlines(data as RawQuestlineDocument[])}
				/>
			)}
		</Row>
	);
}

// ─── QuestList ────────────────────────────────────────────────────────────────

function QuestList({
	quests,
	selectedIdx,
	onSelect,
	onAddQuest,
}: {
	onAddQuest: (gpt: LEGACY_GPTString) => void;
	onSelect: (idx: number) => void;
	quests: Array<RawQuestDocument>;
	selectedIdx: number | null;
}) {
	const [gpt, setGpt] = useState<LEGACY_GPTString | null>(null);

	const allGpts: Array<{ label: string; value: LEGACY_GPTString }> = TachiConfig.GAME_GROUPS.flatMap(
		(gameGroup) => {
			const config = GetGameGroupConfig(gameGroup);

			return config.playtypes.map((pt) => ({
				value: `${gameGroup}:${pt}` as LEGACY_GPTString,
				label: FormatGame(LEGACY_GameGroupPTToGame(gameGroup, pt)),
			}));
		},
	);

	return (
		<div className="d-flex flex-column gap-1 mb-3">
			{quests.length === 0 && (
				<span className="text-body-secondary small">No quests yet. Add one below.</span>
			)}
			{quests.map((quest, i) => (
				<button
					className={`btn btn-sm text-start text-truncate ${
						selectedIdx === i
							? "btn-primary"
							: "btn-outline-secondary"
					}`}
					key={i}
					onClick={() => onSelect(i)}
					title={quest.name}
					type="button"
				>
					<span className="small me-2 text-body-secondary">
						{FormatGame(quest.game)}
					</span>
					{quest.name}
				</button>
			))}

			{/* Inline new-quest form */}
			<div className="mt-2 d-flex gap-2 align-items-center">
				<Form.Select
					onChange={(e) => setGpt(e.target.value as LEGACY_GPTString)}
					size="sm"
					style={{ flex: 1 }}
					value={gpt ?? ""}
				>
					<option value="">Game…</option>
					{allGpts.map((g) => (
						<option key={g.value} value={g.value}>
							{g.label}
						</option>
					))}
				</Form.Select>
				<Button
					disabled={gpt === null}
					onClick={() => {
						if (gpt) {
							onAddQuest(gpt);
						}
					}}
					size="sm"
					variant="success"
				>
					<Icon type="plus" />
				</Button>
			</div>
		</div>
	);
}

// ─── QuestlineComposer ────────────────────────────────────────────────────────

function QuestlineComposer({
	questlines,
	quests,
	onAddQuestline,
	onUpdate,
	onDelete,
}: {
	onAddQuestline: (ql: RawQuestlineDocument) => void;
	onDelete: (idx: number) => void;
	onUpdate: (updated: RawQuestlineDocument, idx: number) => void;
	questlines: Array<RawQuestlineDocument>;
	quests: Array<RawQuestDocument>;
}) {
	const [newName, setNewName] = useState("");
	const [newGame, setNewGame] = useState<LEGACY_GPTString | "">("");

	const allGpts: Array<{ label: string; value: LEGACY_GPTString }> = TachiConfig.GAME_GROUPS.flatMap(
		(gameGroup) => {
			const config = GetGameGroupConfig(gameGroup);

			return config.playtypes.map((pt) => ({
				value: `${gameGroup}:${pt}` as LEGACY_GPTString,
				label: FormatGame(LEGACY_GameGroupPTToGame(gameGroup, pt)),
			}));
		},
	);

	return (
		<div className="d-flex flex-column gap-3 mb-3">
			{questlines.length === 0 && (
				<span className="text-body-secondary small">No questlines yet.</span>
			)}

			{questlines.map((ql, idx) => (
				<QuestlineCard
					key={idx}
					onDelete={() => onDelete(idx)}
					onUpdate={(updated) => onUpdate(updated, idx)}
					quests={quests}
					questline={ql}
				/>
			))}

			{/* New questline inline form */}
			<div className="border rounded p-2">
				<p className="small fw-semibold mb-2">New Questline</p>
				<Form.Control
					className="mb-2"
					onChange={(e) => setNewName(e.target.value)}
					placeholder="Questline name…"
					size="sm"
					value={newName}
				/>
				<div className="d-flex gap-2">
					<Form.Select
						onChange={(e) => setNewGame(e.target.value as LEGACY_GPTString)}
						size="sm"
						style={{ flex: 1 }}
						value={newGame}
					>
						<option value="">Game…</option>
						{allGpts.map((g) => (
							<option key={g.value} value={g.value}>
								{g.label}
							</option>
						))}
					</Form.Select>
					<Button
						disabled={!newName.trim() || !newGame}
						onClick={() => {
							if (!newName.trim() || !newGame) {
								return;
							}

							const [gameGroup, playtype] = newGame.split(":") as [
								GameGroup,
								LEGACY_Playtype,
							];

							const slug = newName
								.trim()
								.toLowerCase()
								.replace(/\s+/gu, "-")
								.replace(/[^a-z0-9-]/gu, "");

							onAddQuestline({
								questlineID: `${slug}-${Date.now()}`,
								name: newName.trim(),
								desc: "",
								game: gameGroup,
								playtype,
								quests: [],
							});

							setNewName("");
							setNewGame("");
						}}
						size="sm"
						variant="success"
					>
						<Icon type="plus" /> Create
					</Button>
				</div>
			</div>
		</div>
	);
}

function QuestlineCard({
	questline,
	quests,
	onUpdate,
	onDelete,
}: {
	onDelete: () => void;
	onUpdate: (updated: RawQuestlineDocument) => void;
	questline: RawQuestlineDocument;
	quests: Array<RawQuestDocument>;
}) {
	const availableQuests = quests.filter(
		(q) => !questline.quests.includes(q.name),
	);

	const addQuestByName = (name: string) => {
		if (!questline.quests.includes(name)) {
			onUpdate({ ...questline, quests: [...questline.quests, name] });
		}
	};

	const removeQuest = (name: string) => {
		onUpdate({ ...questline, quests: questline.quests.filter((q) => q !== name) });
	};

	const moveQuest = (idx: number, direction: -1 | 1) => {
		const arr = [...questline.quests];
		const target = idx + direction;

		if (target < 0 || target >= arr.length) {
			return;
		}

		[arr[idx], arr[target]] = [arr[target]!, arr[idx]!];
		onUpdate({ ...questline, quests: arr });
	};

	return (
		<div className="border rounded p-2">
			<div className="d-flex align-items-start gap-2 mb-1">
				<div className="flex-grow-1">
				<EditableText
					as="span"
					authorised
					initialText={questline.name}
					onSubmit={(name) => onUpdate({ ...questline, name })}
					placeholderText="Questline name"
				/>
					<EditableText
						authorised
						initialText={questline.desc}
						onSubmit={(desc) => onUpdate({ ...questline, desc })}
						placeholderText="Description…"
					/>
					<span className="text-body-secondary small">{questline.game} / {questline.playtype}</span>
				</div>
				<button
					className="btn btn-outline-danger btn-sm py-0"
					onClick={() => {
						if (confirm(`Delete questline "${questline.name}"?`)) {
							onDelete();
						}
					}}
					type="button"
				>
					<Icon type="trash" />
				</button>
			</div>

			{/* Ordered quest list */}
			{questline.quests.length === 0 ? (
				<span className="text-body-secondary small">No quests added yet.</span>
			) : (
				<div className="d-flex flex-column gap-1 mb-2">
					{questline.quests.map((questName, i) => (
						<div className="d-flex align-items-center gap-1" key={i}>
							<span className="text-body-secondary small me-1">{i + 1}.</span>
							<span className="flex-grow-1 small text-truncate">{questName}</span>
							<button
								className="btn btn-outline-secondary btn-sm py-0"
								disabled={i === 0}
								onClick={() => moveQuest(i, -1)}
								type="button"
							>
								<Icon type="chevron-up" />
							</button>
							<button
								className="btn btn-outline-secondary btn-sm py-0"
								disabled={i === questline.quests.length - 1}
								onClick={() => moveQuest(i, 1)}
								type="button"
							>
								<Icon type="chevron-down" />
							</button>
							<button
								className="btn btn-outline-danger btn-sm py-0"
								onClick={() => removeQuest(questName)}
								type="button"
							>
								<Icon type="times" />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Add quest from available */}
			{availableQuests.length > 0 && (
				<Form.Select
					onChange={(e) => {
						if (e.target.value) {
							addQuestByName(e.target.value);
							e.target.value = "";
						}
					}}
					size="sm"
				>
					<option value="">Add quest…</option>
					{availableQuests.map((q, i) => (
						<option key={i} value={q.name}>
							{q.name} ({FormatGame(q.game)})
						</option>
					))}
				</Form.Select>
			)}
		</div>
	);
}

// ─── ImportJsonModal ──────────────────────────────────────────────────────────

function ImportJsonModal({
	description,
	onHide,
	onImport,
	schema,
}: {
	description: string;
	onHide: () => void;
	onImport: (data: unknown[]) => void;
	schema?: PrudenceSchema;
}) {
	const [err, setErr] = useState<string | null>(null);

	return (
		<Modal onHide={onHide} show size="lg">
			<Modal.Header closeButton>
				<Modal.Title>Import {description}</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Alert variant="warning">
					This will replace your current {description} data. Make sure you've exported
					first!
				</Alert>
				<Form.Group>
					<Form.Label>Upload {description}</Form.Label>
					<input
						accept="application/json"
						className="form-control"
						multiple={false}
						onChange={async (e) => {
							try {
								const file = e.target.files?.[0];

								if (!file) {
									return;
								}

								const contents = JSON.parse(await file.text()) as unknown[];

								if (schema) {
									const prErr = p({ json: contents }, schema);

									if (prErr) {
										throw new Error(FormatPrError(prErr));
									}
								}

								onImport(contents);
								onHide();
							} catch (e) {
								setErr((e as Error).message);
							}
						}}
						type="file"
					/>
				</Form.Group>
				{err && <p className="text-danger small mt-2">Invalid file: {err}</p>}
			</Modal.Body>
		</Modal>
	);
}
