import MiniTable from "#components/tables/components/MiniTable";
import TachiTable from "#components/tables/components/TachiTable";
import ScoreTable from "#components/tables/scores/ScoreTable";
import ApiError from "#components/util/ApiError";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import SelectButton from "#components/util/SelectButton";
import { AllLUGPTStatsContext } from "#context/AllLUGPTStatsContext";
import { UserContext } from "#context/UserContext";
import { type ScoreDataset } from "#types/tables";
import { APIFetchV1 } from "#util/api";
import { CreateChartMap, CreateSongMap } from "#util/data";
import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, ButtonGroup } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
	type GameGroup,
	type MONGO_ChartDocument,
	type MONGO_ImportDocument,
	type MONGO_ScoreDocument,
	type MONGO_SessionDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	type MONGO_UserGameStats,
	type Playtype,
} from "tachi-common";

interface Data {
	import: MONGO_ImportDocument;
	scores: MONGO_ScoreDocument[];
	charts: MONGO_ChartDocument[];
	songs: MONGO_SongDocument[];
	sessions: MONGO_SessionDocument[];
	user: MONGO_UserDocument;
}

export default function ImportInfo({
	importID,
	noTopTable,
}: {
	importID: string;
	noTopTable?: boolean;
}) {
	const { data, error } = useApiQuery<Data>(`/imports/${importID}`);

	const { setUGS } = useContext(AllLUGPTStatsContext);
	const { user } = useContext(UserContext);
	const [hasUpdatedStats, setHasUpdatedStats] = useState(false);

	useEffect(() => {
		if (!data || hasUpdatedStats || !user) {
			return;
		}

		APIFetchV1<MONGO_UserGameStats[]>(`/users/${user!.id}/game-stats`).then((r) => {
			if (!r.success) {
				console.warn(`Can't update user stats post-import. ${r.description}`);
				return;
			}
			setUGS(r.body);
			setHasUpdatedStats(true);
		});
	}, [data]);

	const [tab, setTab] = useState<"errors" | "scores" | "sessions">("scores");

	if (error) {
		return (
			<>
				We've hit an error fetching info about this import. The import has still succeeded,
				though!
				<ApiError error={error} />
			</>
		);
	}

	if (!data) {
		return (
			<>
				<Loading />
				We're fetching stats about this import...
			</>
		);
	}

	const importDoc = data.import;

	return (
		<>
			{!noTopTable && (
				<>
					<div className="col-12">
						<MiniTable colSpan={2} headers={["Import Info"]}>
							<tr>
								<td>Imported Scores</td>
								<td>{importDoc.scoreIDs.length}</td>
							</tr>
							<tr>
								<td>Created Sessions</td>
								<td>{importDoc.createdSessions.length}</td>
							</tr>
							<tr>
								<td>Errors</td>
								<td>{importDoc.errors.length}</td>
							</tr>
						</MiniTable>
					</div>
					<div className="col-12">
						<Divider />
					</div>
				</>
			)}
			<div className="col-12 vstack gap-4">
				<ButtonGroup>
					<SelectButton id="scores" setValue={setTab} value={tab}>
						<Icon type="table" /> Scores
					</SelectButton>
					<SelectButton id="sessions" setValue={setTab} value={tab}>
						<Icon type="calendar-week" /> Sessions
					</SelectButton>
					<SelectButton id="errors" setValue={setTab} value={tab}>
						<Icon type="exclamation-triangle" /> Errors
					</SelectButton>
				</ButtonGroup>
				{tab === "errors" ? (
					<>
						<Alert variant="warning">
							Some of these errors might not be very useful. Depending on how scores
							are matched with data, all we have to display might be a hash.
						</Alert>
						<TachiTable
							dataset={data.import.errors}
							entryName="Errors"
							headers={[
								["Error Name", "Error Name"],
								["Info", "Info"],
							]}
							rowFunction={(r) => (
								<tr>
									<td>{r.type}</td>
									<td>{r.message}</td>
								</tr>
							)}
						/>
					</>
				) : tab === "scores" ? (
					<ScoreTab data={data} />
				) : (
					<SessionTab data={data} />
				)}
			</div>
		</>
	);
}

function SessionTab({ data }: { data: Data }) {
	const importDoc = data.import;

	const dataset = [];

	const sessionMap: Map<string, MONGO_SessionDocument> = new Map();

	for (const session of data.sessions) {
		sessionMap.set(session.sessionID, session);
	}

	for (const sesInfo of importDoc.createdSessions) {
		dataset.push({
			info: sesInfo,
			session: sessionMap.get(sesInfo.sessionID)!,
		});
	}

	return (
		<TachiTable
			dataset={dataset}
			entryName="Sessions"
			headers={[
				["Session Name", "Session Name"],
				["Change Info", "Change Info"],
				["Scores", "Scores"],
			]}
			rowFunction={(r) => (
				<tr>
					<td>
						<Link
							className="text-decoration-none"
							to={`/u/${r.session.userID}/games/${r.session.game}/${r.session.playtype}/sessions/${r.session.sessionID}`}
						>
							{r.session.name}
						</Link>
					</td>
					<td>{r.info.type}</td>
					<td>{r.session.scoreIDs.length}</td>
				</tr>
			)}
		/>
	);
}

function ScoreTab({ data }: { data: Data }) {
	const importDoc = data.import;

	if (importDoc.playtypes.length === 0) {
		return (
			<div className="row mt-4">
				<span className="w-100 text-center">No scores...</span>
			</div>
		);
	} else if (importDoc.playtypes.length > 1) {
		const datasets = [];

		for (const playtype of importDoc.playtypes) {
			const scoreDataset: ScoreDataset = [];

			const songMap = CreateSongMap(data.songs);
			const chartMap = CreateChartMap(data.charts);

			for (const [i, score] of data.scores.filter((e) => e.playtype === playtype).entries()) {
				scoreDataset.push({
					...score,
					__related: {
						song: songMap.get(score.songID)!,
						chart: chartMap.get(score.chartID)!,
						index: i,
						user: data.user,
					},
				});
			}

			datasets.push({ playtype, data: scoreDataset });
		}

		return <MultiPlaytypeScoreTable datasets={datasets} game={importDoc.game} />;
	}

	const scoreDataset: ScoreDataset = [];

	const songMap = CreateSongMap(data.songs);
	const chartMap = CreateChartMap(data.charts);

	for (const [i, score] of data.scores.entries()) {
		scoreDataset.push({
			...score,
			__related: {
				song: songMap.get(score.songID)!,
				chart: chartMap.get(score.chartID)!,
				index: i,
				user: data.user,
			},
		});
	}

	return (
		<ScoreTable
			dataset={scoreDataset}
			game={importDoc.game}
			playtype={importDoc.playtypes[0]}
		/>
	);
}

type ScoreDatasets = { data: ScoreDataset; playtype: Playtype }[];

function MultiPlaytypeScoreTable({ datasets, game }: { datasets: ScoreDatasets; game: GameGroup }) {
	const [playtype, setPlaytype] = useState<Playtype>(datasets[0].playtype);

	const content = useMemo(() => datasets.find((e) => e.playtype === playtype)!, [playtype]);

	return (
		<div className="row">
			<div className="col-12">
				<div className="btn-group">
					{datasets.map((e) => (
						<SelectButton
							id={e.playtype}
							key={e.playtype}
							setValue={setPlaytype}
							value={playtype}
						>
							{e.playtype}
						</SelectButton>
					))}
				</div>
			</div>

			<ScoreTable dataset={content.data} game={game} playtype={content.playtype} />
		</div>
	);
}
