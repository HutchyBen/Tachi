import AsyncSelect from "#components/util/AsyncSelect";
import Divider from "#components/util/Divider";
import Select from "#components/util/Select";
import { type SongChartsSearch } from "#types/api-returns";
import { type GamePT, type SetState } from "#types/react";
import { type RawQuestGoal } from "#types/tachi";
import { APIFetchV1 } from "#util/api";
import { CreateSongMap } from "#util/data";
import { StrSOV } from "#util/sorts";
import React, { useEffect, useState } from "react";
import { Button, Col, Form, InputGroup, Modal, Row } from "react-bootstrap";
import { type GroupBase, type OptionsOrGroups } from "react-select";
import {
	FormatChart,
	GetGamePTConfig,
	GetGPTString,
	GetScoreMetricConf,
	type GPTString,
	type MONGO_ChartDocument,
	type MONGO_FolderDocument,
	type MONGO_GoalDocument,
	type MONGO_SongDocument,
} from "tachi-common";
import { type ConfEnumScoreMetric } from "tachi-common/types/metrics";

import { RenderGoalCriteriaPicker } from "./SetNewGoalModal";

export default function AddNewGoalForQuestModal({
	show,
	setShow,
	game,
	playtype,
	onCreate,
	noNote = false,
	initialState,
}: {
	initialState?: RawQuestGoal;
	noNote?: boolean;
	onCreate: (rawGoal: RawQuestGoal) => void;
	setShow: SetState<boolean>;
	show: boolean;
} & GamePT) {
	const gptConfig = GetGamePTConfig(game, playtype);

	const enumConf = GetScoreMetricConf(
		gptConfig,
		gptConfig.preferredDefaultEnum,
	) as ConfEnumScoreMetric<string>;

	const [criteria, setCriteria] = useState<MONGO_GoalDocument["criteria"]>(
		initialState?.goal.criteria ?? {
			mode: "single",
			key: gptConfig.preferredDefaultEnum,
			value: enumConf.values.indexOf(enumConf.minimumRelevantValue),
		},
	);

	const [charts, setCharts] = useState<MONGO_GoalDocument["charts"]>(
		initialState?.goal.charts ??
			({
				type: "single",
				// dw
				data: null,
			} as any),
	);

	const [note, setNote] = useState(initialState?.note ?? "");

	const [goalName, setGoalName] = useState("...");
	const [goalErr, setGoalErr] = useState<string | null>(null);

	useEffect(() => {
		if ("data" in charts && charts.data === null) {
			return setGoalName("...");
		}

		try {
			APIFetchV1<string>(`/games/${game}/${playtype}/targets/goals/format`, {
				method: "POST",
				body: JSON.stringify({ criteria, charts }),
				headers: { "Content-Type": "application/json" },
			}).then((r) => {
				if (r.success) {
					setGoalName(r.body);
					setGoalErr(null);
				} else {
					const match = /^Invalid goal: (.*)/u.exec(r.description) as
						| [string, string]
						| null;

					if (match) {
						setGoalName("...");
						setGoalErr(match[1]);
					}
				}
			});
		} catch (err) {
			console.error(`Failed to format goal: ${goalName}`);
		}
	}, [charts, criteria]);

	// if a user switches to "single" mode, forcibly change the now-invisible
	// criteria mode to "single".
	useEffect(() => {
		if (charts.type === "single") {
			setCriteria({ mode: "single", key: criteria.key, value: criteria.value });
		}
	}, [charts]);

	return (
		<Modal onHide={() => setShow(false)} show={show} size="xl">
			<Modal.Header closeButton>
				<Modal.Title>Create New Goal</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Row>
					<Col className="text-center mb-4" xs={12}>
						<h4 className="display-4">{goalName}</h4>
						{goalErr && <span className="text-danger">{goalErr}</span>}
					</Col>
					<Col xs={12}>
						<RenderGoalChartPicker
							charts={charts}
							game={game}
							onChange={(newCharts) => setCharts(newCharts)}
							playtype={playtype}
						/>
					</Col>
					<Col className="mt-4" xs={12}>
						<RenderGoalCriteriaPicker
							charts={charts}
							criteria={criteria}
							game={game}
							playtype={playtype}
							setCriteria={setCriteria}
						/>

						{/* don't render if charts.data is null */}
						{!("data" in charts && charts.data === null) && <Divider />}
					</Col>
					{!noNote && (
						<Col className="mt-4" xs={12}>
							<InputGroup>
								<InputGroup.Text>Note (optional)</InputGroup.Text>
								<Form.Control
									onChange={(e) => setNote(e.target.value)}
									placeholder="Optionally, set a note about this goal. Is it particularly noteworthy in this quest?"
									value={note}
								/>
							</InputGroup>

							<Divider />
						</Col>
					)}
					<Col className="w-100 mt-4 d-flex justify-content-center" xs={12}>
						<Button
							disabled={
								(criteria.mode === "absolute" && criteria.countNum <= 1) ||
								goalName === "..."
							}
							onClick={async () => {
								const res = await APIFetchV1<string>(
									`/games/${game}/${playtype}/targets/goals/format`,
									{
										headers: {
											"Content-Type": "application/json",
										},
										body: JSON.stringify({
											criteria,
											charts,
										}),
										method: "POST",
									},
									false,
									true,
								);

								if (res.success) {
									onCreate({
										note: note === "" ? undefined : note,
										goal: {
											name: res.body,
											charts,
											criteria,
										},
									});
									setShow(false);
								}
							}}
							variant="primary"
						>
							Add Goal
						</Button>
					</Col>
				</Row>
			</Modal.Body>
		</Modal>
	);
}

function RenderGoalChartPicker({
	charts,
	game,
	playtype,
	onChange,
}: {
	charts: MONGO_GoalDocument["charts"];
	onChange: (charts: MONGO_GoalDocument["charts"]) => void;
} & GamePT) {
	const [type, setType] = useState<MONGO_GoalDocument["charts"]["type"]>(charts.type);

	// hackily declaring this as any because type and chartInfo are technically disjoint
	// however, due to the code, these will always be in sync.
	const [data, setData] = useState<any>("data" in charts ? charts.data : null);

	useEffect(
		() =>
			// THIS MIGHT SET DATA AS NULL
			// THIS IS DELIBERATE, AS WE WANT TO REPRESENT THE PARTIAL STATE WHERE THE USER
			// HAS SELECTED SOME TYPE, BUT NOT PICKED A FOLDER/CHART YET.

			// SERIOUSLY. THIS IS SET AS NULL SOMETIMES AND THE TYPESYSTEM DOES NOT REPRESENT
			// THAT FACT.
			onChange({ type, data }),
		[type, data],
	);

	const [isFirstRender, setIsFirstRender] = useState(true);

	useEffect(() => {
		// DON'T RUN THIS HOOK ON FIRST RENDER
		// this should reset the selected folder/charts when the type is changed
		// but on the first render, we're potentially inheriting from initial state
		// so don't immediately wipe it!
		if (isFirstRender) {
			setIsFirstRender(false);
			return;
		}

		setData(null);

		onChange({ type, data: null as any });
	}, [type]);

	return (
		<>
			<div>
				On{" "}
				<Select inline setValue={setType} value={type}>
					<option value="folder">A Folder</option>
					<option value="single">A Specific Chart</option>
					<option value="multi">Specific Charts</option>
				</Select>
			</div>

			<div className="mt-4 ">
				{type === "folder" ? (
					<FolderSelect game={game} onChange={setData} playtype={playtype} />
				) : type === "single" ? (
					<ChartSelect game={game} onChange={setData} playtype={playtype} />
				) : (
					<ChartSelect game={game} multi onChange={setData} playtype={playtype} />
				)}
			</div>
		</>
	);
}

function FolderSelect({ game, playtype, onChange }: { onChange: (data: string) => void } & GamePT) {
	let lastTimeout: number | null = null;

	const loadFolderOptions = (
		input: string,
		cb: (options: OptionsOrGroups<unknown, GroupBase<unknown>>) => void,
	) => {
		if (lastTimeout !== null) {
			clearTimeout(lastTimeout);
		}

		// debounce this query to only run after 300ms of no more user input.
		lastTimeout = window.setTimeout(async () => {
			const res = await APIFetchV1<Array<MONGO_FolderDocument>>(
				`/games/${game}/${playtype}/folders?search=${input}`,
			);
			if (!res.success) {
				throw new Error(res.description);
			}

			const options = res.body.map((e) => ({
				value: e.folderID,
				label: e.title,
			}));

			options.sort(StrSOV((x) => x.label));

			cb(options);
		}, 300);
	};

	return (
		<AsyncSelect
			loadOptions={loadFolderOptions}
			// @ts-expect-error can't be bothered to figure out these types, they're stupid.
			onChange={(data) => onChange(data.value)}
			placeholder="Search for a folder..."
		/>
	);
}

function ChartSelect({
	game,
	playtype,
	multi = false,
	onChange,
}: { multi?: boolean; onChange: (data: string | string[]) => void } & GamePT) {
	let lastTimeout: number | null = null;

	const loadChartOptions = (
		input: string,
		cb: (options: OptionsOrGroups<unknown, GroupBase<unknown>>) => void,
	) => {
		if (lastTimeout !== null) {
			clearTimeout(lastTimeout);
		}

		// debounce this query to only run after 300ms of no more user input.
		lastTimeout = window.setTimeout(async () => {
			const res = await APIFetchV1<SongChartsSearch>(
				`/games/${game}/${playtype}/charts?search=${encodeURIComponent(input)}`,
			);

			const res2 = await APIFetchV1<{
				charts: Record<
					GPTString,
					{
						chart: MONGO_ChartDocument;
						song: MONGO_SongDocument;
					}[]
				>;
			}>(`/search/chart-hash?search=${encodeURIComponent(input)}`);

			if (!res.success || !res2.success) {
				throw new Error(res.description);
			}

			const res2Data = res2.body.charts[GetGPTString(game, playtype)] ?? [];

			const songMap = CreateSongMap([...res.body.songs, ...res2Data.map((e) => e.song)]);

			const options = [...res.body.charts, ...res2Data.map((e) => e.chart)].map((e) => ({
				value: e.chartID,
				label: FormatChart(game, songMap.get(e.songID)!, e),
			}));

			options.sort(StrSOV((x) => x.label));

			cb(options);
		}, 300);
	};

	return (
		<AsyncSelect
			isMulti={multi}
			loadOptions={loadChartOptions}
			// @ts-expect-error can't be bothered to figure out these types, they're stupid.
			onChange={(data) =>
				onChange(Array.isArray(data) ? data.map((e) => e.value) : data.value)
			}
			placeholder="Search for a chart..."
		/>
	);
}
