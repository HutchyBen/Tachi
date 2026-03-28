import DebounceSearch from "#components/util/DebounceSearch";
import Muted from "#components/util/Muted";
import { UserContext } from "#context/UserContext";
import { type SongChartsSearch } from "#types/api-returns";
import { type GamePT, type SetState } from "#types/react";
import { APIFetchV1 } from "#util/api";
import { CreateSongMap } from "#util/data";
import { UppercaseFirst } from "#util/misc";
import { StrSOV } from "#util/sorts";
import { useFormik } from "formik";
import React, { type ChangeEventHandler, useContext, useEffect, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import {
	FormatDifficulty,
	type GameGroup,
	GetGamePTConfig,
	GetScoreMetricConf,
	GetScoreMetrics,
	type MONGO_FolderDocument,
	type MONGO_UserDocument,
	type Playtype,
	type ShowcaseStatDetails,
} from "tachi-common";

interface Props {
	reqUser: MONGO_UserDocument;
	game: GameGroup;
	playtype: Playtype;
	onCreate: (stat: ShowcaseStatDetails) => void;
	show: boolean;
	setShow: SetState<boolean>;
}

export default function UGPTStatCreator({
	reqUser,
	game,
	playtype,
	onCreate,
	show,
	setShow,
}: Props) {
	return (
		<Modal onHide={() => setShow(false)} show={show}>
			<Modal.Header closeButton>
				<Modal.Title>Showcase Stat Creator</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				{show && (
					<UGPTStatInnerSearchyBit
						game={game}
						onCreate={onCreate}
						playtype={playtype}
						reqUser={reqUser}
						setShow={setShow}
						show={show}
					/>
				)}
			</Modal.Body>
		</Modal>
	);
}

function UGPTStatInnerSearchyBit({ game, playtype, onCreate, setShow }: Props) {
	const gptConfig = GetGamePTConfig(game, playtype);

	const formik = useFormik({
		initialValues: {
			mode: "chart",
			metric: GetScoreMetrics(gptConfig, ["DECIMAL", "INTEGER", "ENUM"])[0],
			folderID: undefined,
			chartID: undefined,
		},
		onSubmit: (values) => {
			let stat: ShowcaseStatDetails;

			if (values.mode === "chart") {
				stat = {
					mode: "chart",
					metric: values.metric as ShowcaseStatDetails["metric"],
					chartID: values.chartID ?? "",
				};
			} else if (values.mode === "folder") {
				stat = {
					mode: "folder",
					metric: values.metric as "grade" | "lamp" | "percent" | "score",
					folderID: values.folderID ?? "",
					gte,
				};
			} else {
				throw new Error(`Unknown values.mode ${values.mode}.`);
			}

			onCreate(stat);
			setShow(false);
		},
	});

	useEffect(() => {
		if (formik.values.mode === "folder" && formik.values.metric === "playcount") {
			formik.setValues({ ...formik.values, metric: "lamp" });
		}
	}, [formik.values.mode]);

	const { user } = useContext(UserContext);
	const [chartData, setChartData] = useState<{ chartID: string; name: string }[]>([]);
	const [chartSearch, setChartSearch] = useState("");
	const [requesterHasPlayed, setRequesterHasPlayed] = useState(user !== null);

	const [folderData, setFolderData] = useState<{ folderID: string; name: string }[]>([]);
	const [folderSearch, setFolderSearch] = useState("");

	const [gte, setGte] = useState(0);

	useEffect(() => {
		(async () => {
			const search = folderSearch;
			const params = new URLSearchParams({
				search,
			});

			const res = await APIFetchV1<MONGO_FolderDocument[]>(
				`/games/${game}/${playtype}/folders?${params.toString()}`,
				{},
				false,
				true,
			);

			if (!res.success) {
				throw new Error(res.description);
			}

			setFolderData(
				res.body
					.map((e) => ({ folderID: e.folderID, name: e.title }))
					.sort(StrSOV((e) => e.name)),
			);
		})();
	}, [folderSearch]);

	useEffect(() => {
		(async () => {
			const search = chartSearch;
			const params = new URLSearchParams({
				search,
			});

			if (requesterHasPlayed) {
				params.set("requesterHasPlayed", "true");
			}

			const res = await APIFetchV1<SongChartsSearch>(
				`/games/${game}/${playtype}/charts?${params.toString()}`,
				{},
				false,
				true,
			);

			if (!res.success) {
				throw new Error(res.description);
			}

			const songMap = CreateSongMap(res.body.songs);

			const data = [];
			for (const chart of res.body.charts) {
				const song = songMap.get(chart.songID);

				data.push({
					chartID: chart.chartID,
					name: `${song!.title} ${FormatDifficulty(chart, game)}`,
				});
			}

			data.sort(StrSOV((e) => e.name));

			setChartData(data);
		})();
	}, [chartSearch, requesterHasPlayed]);

	return (
		<Form className="d-flex flex-column gap-4" onSubmit={formik.handleSubmit}>
			<Form.Group className="d-flex flex-column">
				<Form.Label>Mode</Form.Label>
				<Form.Select id="mode" onChange={formik.handleChange} value={formik.values.mode}>
					<option value="chart">Chart</option>
					<option value="folder">Folder</option>
				</Form.Select>
				<Form.Text>What kind of stat should this be?</Form.Text>
			</Form.Group>
			<Form.Group className="d-flex flex-column">
				<Form.Label>Property</Form.Label>
				<Form.Select
					id="metric"
					onChange={formik.handleChange}
					value={formik.values.metric}
				>
					{GetScoreMetrics(gptConfig, ["DECIMAL", "INTEGER", "ENUM"]).map((e) => (
						<option key={e} value={e}>
							{UppercaseFirst(e)}
						</option>
					))}
					{formik.values.mode === "chart" && <option value="playcount">Playcount</option>}
				</Form.Select>
				<Form.Text>What kind of statistic should this check for?</Form.Text>
			</Form.Group>
			{formik.values.mode === "chart" ? (
				<Form.Group className="d-flex flex-column">
					<Form.Label>Chart</Form.Label>
					<DebounceSearch placeholder="Chart Name" setSearch={setChartSearch} />
					{user && (
						<Form.Check
							checked={requesterHasPlayed}
							className="mt-4 mb-4"
							id="requesterHasPlayed"
							label="Only show charts you've played?"
							onChange={(e) => setRequesterHasPlayed(e.target.checked)}
						/>
					)}
					{chartData.length ? (
						<Form.Select
							id="chartID"
							onChange={formik.handleChange}
							value={formik.values.chartID}
						>
							<option value="">Select a chart...</option>
							{chartData.map((e, i) => (
								<option key={i} value={e.chartID}>
									{e.name}
								</option>
							))}
						</Form.Select>
					) : (
						<Muted>Your search returned nothing... :(</Muted>
					)}
				</Form.Group>
			) : (
				<>
					<Form.Group>
						<Form.Label>Target</Form.Label>
						<FolderGTESelect
							onChange={(e) => setGte(Number(e.target.value))}
							value={gte}
							{...{
								game,
								playtype,
								metric: formik.values.metric,
							}}
						/>
					</Form.Group>
					<Form.Group>
						<Form.Label>Folder</Form.Label>
						<DebounceSearch placeholder="Folder Name" setSearch={setFolderSearch} />
						{folderData.length ? (
							<Form.Select
								className="mt-4"
								id="folderID"
								onChange={formik.handleChange}
								value={formik.values.folderID}
							>
								<option value="">Select a folder...</option>
								{folderData.map((e, i) => (
									<option key={i} value={e.folderID}>
										{e.name}
									</option>
								))}
							</Form.Select>
						) : (
							<></>
						)}
					</Form.Group>
				</>
			)}
			<Button
				className="mt-4"
				disabled={formik.values.mode === "chart" && !formik.values.chartID}
				type="submit"
			>
				Submit
			</Button>
		</Form>
	);
}

function FolderGTESelect({
	metric,
	game,
	playtype,
	value,
	onChange,
}: {
	metric: string;
	onChange: ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
	value: number;
} & GamePT) {
	const gptConfig = GetGamePTConfig(game, playtype);

	const props = { value, onChange };

	const conf = GetScoreMetricConf(gptConfig, metric);

	if (!conf) {
		return <>error: no conf? what?</>;
	}

	if (conf.type === "ENUM") {
		return (
			<select className="form-select" {...props}>
				{conf.values.map((e, i) => (
					<option key={i} value={i}>
						{e}
					</option>
				))}
			</select>
		);
	} else if (conf.type === "GRAPH" || conf.type === "NULLABLE_GRAPH") {
		return <>can't set stats for graphs. how'd you get here?</>;
	}

	return <input className="form-control" min={0} type="number" {...props} />;
}
