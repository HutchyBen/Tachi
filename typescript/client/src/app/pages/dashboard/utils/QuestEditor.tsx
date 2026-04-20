import useSetSubheader from "#components/layout/header/useSetSubheader";
import AddNewQuestModal from "#components/targets/AddNewQuestModal";
import EditableQuest from "#components/targets/quests/editor/EditableQuest";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import { TachiConfig } from "#lib/config";
import { type SetState } from "#types/react";
import { type RawQuestDocument } from "#types/tachi";
import { ChangeAtPosition, DeleteInPosition } from "#util/misc";
import { p, type PrudenceSchema } from "prudence";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Form, Modal, Row } from "react-bootstrap";
import { FormatPrError, GetGameGroupConfig } from "tachi-common";

const LOCAL_QUEST_KEY = "LOCAL_QUESTS";

const PR_LOCAL_QUESTS_SCHEMA: PrudenceSchema = {
	json: [
		{
			game: p.isIn(TachiConfig.GAME_GROUPS),
			playtype: (self, parent) => {
				const gameConfig = GetGameGroupConfig(parent.game as any);

				if (!gameConfig.playtypes.includes(self)) {
					return `Invalid playtype '${self}' for ${parent.game}`;
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
									{
										type: p.is("folder"),
										data: "string",
									},
									{
										type: p.is("multi"),
										data: ["string"],
									},
									{
										type: p.is("single"),
										data: "string",
									},
								),
								criteria: p.or(
									{
										mode: p.is("single"),
										key: "string", // temp
										value: "number",
									},
									{
										mode: p.isIn("absolute", "proportion"),
										countNum: p.isPositive,
										key: "string", // temp
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

function GetLocalQuests(): Array<RawQuestDocument> {
	try {
		const data = window.localStorage.getItem(LOCAL_QUEST_KEY);

		if (!data) {
			return [];
		}

		const json = JSON.parse(data);

		// check that this data is what it seems
		const err = p({ json }, PR_LOCAL_QUESTS_SCHEMA);

		if (err) {
			const e = confirm(
				`Failed to validate your local quests: ${FormatPrError(
					err,
				)}. DELETE ALL AND START AGAIN?`,
			);

			if (e) {
				return [];
			}
		}

		return json;
	} catch (err) {
		console.error(err);

		return [];
	}
}

export default function QuestEditor() {
	useSetSubheader(["Developer Utils", "Quest Creator"]);

	const INIT_STATE = useMemo(() => GetLocalQuests(), []);
	const [quests, setQuests] = useState(INIT_STATE);
	const [show, setShow] = useState(false);
	const [showImport, setShowImport] = useState(false);

	useEffect(() => {
		window.localStorage.setItem(LOCAL_QUEST_KEY, JSON.stringify(quests));
	}, [quests]);

	return (
		<Row>
			<Col xs={12}>
				<h1>{TachiConfig.NAME} Quest Editor</h1>
				<Divider />
				<span>
					This tool is for creating your own quests and questlines.
					<br />
					These can be saved to a <code>.json</code> file, and sent to an admin to be
					considered for inclusion on the site!
				</span>
				<Divider />
			</Col>

			<Col xs={12}>
				<div className="d-flex w-100 justify-content-center">
					{quests.length > 0 && (
						<>
							<a
								className="btn btn-success me-4"
								download={`Quests-${Date.now()}.json`}
								href={`data:application/json;charset=UTF-8,${encodeURIComponent(
									JSON.stringify(quests),
								)}`}
							>
								Download Quests
							</a>
							<div
								className="btn btn-danger me-4"
								onClick={() => {
									if (confirm("Are you sure you want to start from scratch?")) {
										setQuests([]);
									}
								}}
							>
								Start Again
							</div>
						</>
					)}
					<div className="btn btn-info" onClick={() => setShowImport(true)}>
						Import Quests
					</div>
				</div>
				<div className="mt-4">
					If you want these quests to be added to the site, make a post about your quests
					in the discord!
				</div>
				<Divider />
			</Col>
			{quests.map((quest, i) => (
				<Col className="my-4" key={i} lg={6} xs={12}>
					<EditableQuest
						onChange={(quest) => {
							setQuests(ChangeAtPosition(quests, quest, i));
						}}
						onDelete={() => {
							setQuests(DeleteInPosition(quests, i));
						}}
						quest={quest}
					/>
				</Col>
			))}
			<Col className="my-4" lg={6} xs={12}>
				<div className="w-100 h-100">
					<div className="d-flex w-100 h-100 justify-content-center align-items-center">
						<Button onClick={() => setShow(true)} variant="outline-success">
							<Icon type="plus" /> Add New Quest
						</Button>
					</div>
				</div>
			</Col>
			<AddNewQuestModal
				onCreate={(rawQuest) => setQuests([...quests, rawQuest])}
				setShow={setShow}
				show={show}
			/>
			{showImport && (
				<ImportQuestsModal
					onChange={(newData) => setQuests(newData)}
					setShow={setShowImport}
					show={showImport}
				/>
			)}
		</Row>
	);
}

function ImportQuestsModal({
	show,
	setShow,
	onChange,
}: {
	onChange: (data: Array<RawQuestDocument>) => void;
	setShow: SetState<boolean>;
	show: boolean;
}) {
	const [err, setErr] = useState<string | null>(null);

	return (
		<Modal onHide={() => setShow(false)} show={show} size="xl">
			<Modal.Header closeButton>
				<Modal.Title>
					Import <code>quests.json</code>
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Row>
					<Col xs={12}>
						<Alert variant="warning">
							Uploading existing quests will replace whatever you're currently working
							on! Make sure you've saved your existing work!
						</Alert>
					</Col>
					<Col xs={12}>
						<Form.Group>
							<Form.Label>
								Upload <code>quests.json</code> File
							</Form.Label>
							<input
								accept="application/json"
								className="form-control"
								multiple={false}
								onChange={async (e) => {
									try {
										const file: File = e.target.files![0];

										const contents = JSON.parse(await file.text());

										const err = p({ json: contents }, PR_LOCAL_QUESTS_SCHEMA);

										if (err) {
											throw new Error(FormatPrError(err));
										}

										onChange(contents as RawQuestDocument[]);

										setShow(false);
									} catch (e) {
										const err = e as Error;
										setErr(err.message);
									}
								}}
								type="file"
							/>
						</Form.Group>
					</Col>
					{err && (
						<Col xs={12}>
							<span className="text-danger">Invalid file: {err}</span>
						</Col>
					)}
				</Row>
			</Modal.Body>
		</Modal>
	);
}
